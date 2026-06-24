#!/usr/bin/env node
/**
 * Build-time provider filter: regenerates registry, executors, and translators
 * to include only specified providers from build.config.mjs, reducing bundle size.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const registryDir = join(projectRoot, "open-sse", "providers", "registry");
const executorsDir = join(projectRoot, "open-sse", "executors");
const translatorDir = join(projectRoot, "open-sse", "translator");

// Read providers from build.config.mjs
const configPath = join(projectRoot, "build.config.mjs");
let allowedProviders;

if (existsSync(configPath)) {
  const configModule = await import(`file://${configPath}`);
  const providers = configModule.providers || configModule.default?.providers;
  if (providers === null || providers === undefined) {
    console.log(`[filter-providers] providers=null in build.config.mjs, building ALL providers`);
    process.exit(0);
  }
  allowedProviders = new Set(providers.map((p) => p.trim()).filter(Boolean));
} else {
  console.error(`[filter-providers] ERROR: build.config.mjs not found at ${configPath}`);
  process.exit(1);
}

console.log(`[filter-providers] Filtering to providers: ${Array.from(allowedProviders).sort().join(", ")}`);

// Check if already up-to-date (avoids redundant work when webpack workers re-import next.config)
function isAlreadyFiltered() {
  try {
    const currentRegistry = readFileSync(join(registryDir, "index.js"), "utf-8");
    const expectedCount = allowedProviders.size;
    const match = currentRegistry.match(/^import p\d+ from/gm);
    if (!match || match.length !== expectedCount) return false;
  } catch { return false; }
  return true;
}

if (isAlreadyFiltered()) {
  console.log(`[filter-providers] ✓ Already filtered (${allowedProviders.size} providers), skipping`);
  process.exit(0);
}

// Map provider ID to transport format and special executor
const providerMetadata = {
  antigravity: { format: "antigravity", executor: "AntigravityExecutor" },
  kiro: { format: "kiro", executor: "KiroExecutor" },
  "gemini-cli": { format: "gemini-cli", executor: "GeminiCLIExecutor" },
  opencode: { format: "opencode", executor: "OpenCodeExecutor" },
  gemini: { format: "gemini", executor: null },
  ollama: { format: "ollama", executor: null },
  nvidia: { format: "openai", executor: null }, // Default OpenAI format
};

// Translator pairs needed for each format
const translatorsByFormat = {
  antigravity: ["antigravity-to-openai", "openai-to-antigravity"],
  kiro: ["openai-to-kiro", "kiro-to-openai", "claude-to-kiro", "kiro-to-claude"],
  "gemini-cli": [], // GeminiCLIExecutor handles its own protocol
  opencode: [], // OpenCodeExecutor handles its own protocol
  gemini: ["gemini-to-openai", "openai-to-gemini"],
  ollama: ["openai-to-ollama", "ollama-to-openai"],
  openai: [], // Default, no special translation needed
};

// Always include these translators for core compatibility
const coreTranslators = [
  "claude-to-openai",
  "openai-to-claude",
  "openai-responses", // For OpenAI Responses API format
];

// ===== 1. Regenerate registry/index.js =====
function regenerateRegistry() {
  const registryFiles = readdirSync(registryDir)
    .filter((f) => f.endsWith(".js") && f !== "index.js" && f !== "REGISTRY_TEMPLATE.js")
    .sort();

  const allowedFiles = registryFiles.filter((f) => {
    const id = f.replace(".js", "");
    return allowedProviders.has(id);
  });

  if (allowedFiles.length === 0) {
    console.warn(`[filter-providers] WARNING: No matching provider files found for: ${Array.from(allowedProviders).join(", ")}`);
  }

  const imports = allowedFiles
    .map((file, idx) => `import p${idx} from "./${file}";`)
    .join("\n");

  const exports = allowedFiles.map((_, idx) => `  p${idx},`).join("\n");

  const content = `// Auto-generated: static imports of allowed registry entries
${imports}

export default [
${exports}
];
`;

  writeFileSync(join(registryDir, "index.js"), content);
  console.log(`[filter-providers] ✓ Regenerated registry/index.js (${allowedFiles.length} providers)`);
}

// ===== 2. Regenerate executors/index.js =====
function regenerateExecutors() {
  const neededExecutors = new Set();

  // Determine which executors are needed
  for (const providerId of allowedProviders) {
    const meta = providerMetadata[providerId];
    if (meta?.executor) {
      neededExecutors.add(meta.executor);
    }
  }

  // Always include DefaultExecutor as fallback
  neededExecutors.add("DefaultExecutor");

  // Map executor names to their file and import statement
  const executorMap = {
    AntigravityExecutor: { file: "antigravity.js", import: "AntigravityExecutor" },
    AzureExecutor: { file: "azure.js", import: "AzureExecutor" },
    GeminiCLIExecutor: { file: "gemini-cli.js", import: "GeminiCLIExecutor" },
    GithubExecutor: { file: "github.js", import: "GithubExecutor" },
    IFlowExecutor: { file: "iflow.js", import: "IFlowExecutor" },
    QoderExecutor: { file: "qoder.js", import: "QoderExecutor" },
    KiroExecutor: { file: "kiro.js", import: "KiroExecutor" },
    CodexExecutor: { file: "codex.js", import: "CodexExecutor" },
    CursorExecutor: { file: "cursor.js", import: "CursorExecutor" },
    VertexExecutor: { file: "vertex.js", import: "VertexExecutor" },
    QwenExecutor: { file: "qwen.js", import: "QwenExecutor" },
    OpenCodeExecutor: { file: "opencode.js", import: "OpenCodeExecutor" },
    OpenCodeGoExecutor: { file: "opencode-go.js", import: "OpenCodeGoExecutor" },
    GrokWebExecutor: { file: "grok-web.js", import: "GrokWebExecutor" },
    PerplexityWebExecutor: { file: "perplexity-web.js", import: "PerplexityWebExecutor" },
    OllamaLocalExecutor: { file: "ollama-local.js", import: "OllamaLocalExecutor" },
    CommandCodeExecutor: { file: "commandcode.js", import: "CommandCodeExecutor" },
    XiaomiTokenplanExecutor: { file: "xiaomi-tokenplan.js", import: "XiaomiTokenplanExecutor" },
    MimoFreeExecutor: { file: "mimo-free.js", import: "MimoFreeExecutor" },
    CodeBuddyExecutor: { file: "codebuddy-cn.js", import: "CodeBuddyExecutor" },
    DefaultExecutor: { file: "default.js", import: "DefaultExecutor" },
    BaseExecutor: { file: "base.js", import: "BaseExecutor" },
  };

  const sortedExecutors = Array.from(neededExecutors).sort();
  const imports = sortedExecutors
    .map((ex) => {
      const meta = executorMap[ex];
      return `import { ${meta.import} } from "./${meta.file}";`;
    })
    .join("\n");

  // Map executor classes to their registered provider keys
  const executorToKey = {
    AntigravityExecutor: "antigravity",
    AzureExecutor: "azure",
    GeminiCLIExecutor: "gemini-cli",
    GithubExecutor: "github",
    IFlowExecutor: "iflow",
    QoderExecutor: "qoder",
    KiroExecutor: "kiro",
    CodexExecutor: "codex",
    CursorExecutor: "cursor",
    VertexExecutor: "vertex",
    QwenExecutor: "qwen",
    OpenCodeExecutor: "opencode",
    OpenCodeGoExecutor: "opencode-go",
    GrokWebExecutor: "grok-web",
    PerplexityWebExecutor: "perplexity-web",
    OllamaLocalExecutor: "ollama-local",
    CommandCodeExecutor: "commandcode",
    XiaomiTokenplanExecutor: "xiaomi-tokenplan",
    MimoFreeExecutor: "mimo-free",
    CodeBuddyExecutor: "codebuddy-cn",
  };

  const instantiations = sortedExecutors
    .filter((ex) => ex !== "DefaultExecutor" && ex !== "BaseExecutor")
    .map((ex) => {
      const key = executorToKey[ex] || ex.replace(/Executor$/, "").toLowerCase();
      return `  ${JSON.stringify(key)}: new ${ex}(),`;
    })
    .join("\n");

  // Special aliases
  const aliases = [];
  if (neededExecutors.has("CursorExecutor")) {
    aliases.push(`  cu: new CursorExecutor(), // Alias for cursor`);
  }
  if (neededExecutors.has("VertexExecutor")) {
    aliases.push(`  vertex: new VertexExecutor("vertex"),`);
    aliases.push(`  "vertex-partner": new VertexExecutor("vertex-partner"),`);
  }
  if (neededExecutors.has("MimoFreeExecutor")) {
    aliases.push(`  mmf: new MimoFreeExecutor(), // Alias for mimo-free`);
  }

  const instantiationsWithAliases =
    instantiations + (aliases.length > 0 ? "\n" + aliases.join("\n") : "");

  const exportStatements = sortedExecutors
    .map((ex) => {
      const meta = executorMap[ex];
      return `export { ${meta.import} } from "./${meta.file}";`;
    })
    .join("\n");

  const content = `${imports}

const executors = {
${instantiationsWithAliases}
};

const defaultCache = new Map();

export function getExecutor(provider) {
  if (executors[provider]) return executors[provider];
  if (!defaultCache.has(provider)) defaultCache.set(provider, new DefaultExecutor(provider));
  return defaultCache.get(provider);
}

export function hasSpecializedExecutor(provider) {
  return !!executors[provider];
}

export { BaseExecutor } from "./base.js";
${exportStatements}
`;

  writeFileSync(join(executorsDir, "index.js"), content);
  console.log(`[filter-providers] ✓ Regenerated executors/index.js (${sortedExecutors.length} executors)`);
}

// ===== 3. Filter translator/index.js =====
function regenerateTranslators() {
  // Collect all translator pairs needed
  const neededTranslators = new Set(coreTranslators);

  for (const providerId of allowedProviders) {
    const meta = providerMetadata[providerId];
    if (meta?.format && translatorsByFormat[meta.format]) {
      translatorsByFormat[meta.format].forEach((t) => neededTranslators.add(t));
    }
  }

  // Read current translator index to get all imports
  const currentIndex = readFileSync(join(translatorDir, "index.js"), "utf-8");

  // Parse existing translator imports
  const requestImportPattern = /import\s+"\.\/request\/([^"]+)\.js"/g;
  const responseImportPattern = /import\s+"\.\/response\/([^"]+)\.js"/g;

  const requestMatches = [...currentIndex.matchAll(requestImportPattern)];
  const responseMatches = [...currentIndex.matchAll(responseImportPattern)];

  const requestImports = requestMatches
    .map((m) => m[1])
    .filter((t) => neededTranslators.has(t))
    .map((t) => `import "./request/${t}.js";`);

  const responseImports = responseMatches
    .map((m) => m[1])
    .filter((t) => neededTranslators.has(t))
    .map((t) => `import "./response/${t}.js";`);

  // Extract the part before the imports (helper functions, etc.)
  const headerMatch = currentIndex.match(/^[\s\S]*?(?=\/\/ Static side-effect imports)/);
  const header = headerMatch ? headerMatch[0] : "";

  const content = `${header}// Static side-effect imports: each module calls register() at load (works in ESM + bundler).
${requestImports.join("\n")}
${responseImports.join("\n")}
`;

  writeFileSync(join(translatorDir, "index.js"), content);
  console.log(
    `[filter-providers] ✓ Regenerated translator/index.js (${requestImports.length} request + ${responseImports.length} response translators)`
  );
}

// ===== Main =====
try {
  regenerateRegistry();
  regenerateExecutors();
  regenerateTranslators();
  console.log(`[filter-providers] ✅ All regenerated successfully`);
  process.exit(0);
} catch (err) {
  console.error(`[filter-providers] ❌ Error:`, err.message);
  process.exit(1);
}
