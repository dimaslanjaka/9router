/**
 * Build-time provider configuration.
 * Edit this to control which providers are included in the build.
 * 
 * Available providers: See open-sse/providers/registry/*.js
 * 
 * Set to null to build ALL providers (full 9router).
 */

export const providers = [
  "opencode",
  "gemini",
  "gemini-cli",
  "antigravity",
  "kiro",
  "ollama",
  "nvidia",
];

export default { providers };
