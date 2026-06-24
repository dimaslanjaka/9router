#!/usr/bin/env node
/**
 * secret-manager.mjs — mask/restore secrets in config files for safe commits
 *
 * Usage:
 *   node scripts/secret-manager.mjs                # mask secrets → {env:KEY}
 *   node scripts/secret-manager.mjs --restore       # restore {env:KEY} → env value
 *   node scripts/secret-manager.mjs --target <path> # operate on custom file
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_TARGET = path.join(ROOT, '.opencode', 'opencode.jsonc');

// ── Known secret fields ──────────────────────────────────────────────
// Each entry maps a config field → env var name + detection prefix
const SECRET_FIELDS = [
  { key: 'apiKey', detect: /sk-/, envName: 'OPENAI_API_KEY' },
  { key: 'GITHUB_TOKEN', detect: /(?:github_pat_|ghp_|gho_|ghu_|ghs_|ghr_)/, envName: 'GITHUB_TOKEN' },
];

// Build regex patterns from SECRET_FIELDS
const MASK_PAIRS = SECRET_FIELDS.map(
  ({ key, detect, envName }) => ({
    // Match: "fieldName": "valueStartingWithPrefix..."
    pattern: new RegExp(`"${key}"\\s*:\\s*"${detect.source}[^"]*"`),
    replacement: `"${key}": "{env:${envName}}"`,
  }),
);

// ── Helpers ───────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const mode = args.includes('--restore') ? 'restore' : 'mask';
  const idx = args.indexOf('--target');
  const target = idx >= 0 ? path.resolve(ROOT, args[idx + 1]) : DEFAULT_TARGET;
  return { mode, target };
}

// ── Mask mode ─────────────────────────────────────────────────────────

function maskSecrets(content) {
  let result = content;
  let changed = false;

  for (const { pattern, replacement } of MASK_PAIRS) {
    if (pattern.test(result)) {
      result = result.replace(pattern, replacement);
      changed = true;
    }
  }

  return { content: result, changed };
}

// ── Restore mode ──────────────────────────────────────────────────────

function restoreSecrets(content) {
  const result = content.replace(/\{env:(\w+)\}/g, (match, envName) =>
    process.env[envName] !== undefined ? process.env[envName] : match,
  );
  return { content: result, changed: result !== content };
}

// ── Main ──────────────────────────────────────────────────────────────

function main() {
  const { mode, target } = parseArgs();

  if (!fs.existsSync(target)) {
    console.error(`[secret-manager] Target not found: ${target}`);
    process.exit(1);
  }

  const original = fs.readFileSync(target, 'utf8');
  const { content: updated, changed } =
    mode === 'mask' ? maskSecrets(original) : restoreSecrets(original);

  if (!changed) {
    console.log(`[secret-manager] ${mode}: no changes needed`);
    return;
  }

  fs.writeFileSync(target, updated, 'utf8');
  console.log(`[secret-manager] ${mode}: ${target} updated`);
}

main();
