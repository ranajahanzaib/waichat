/**
 * System-level model exclusions.
 * These models are never shown to users regardless of user preferences.
 */

/** Error 5028: Deprecated on 2025-10-01 */
const DEPRECATED: string[] = [
  "@hf/thebloke/deepseek-coder-6.7b-base-awq",
  "@hf/thebloke/deepseek-coder-6.7b-instruct-awq",
  "@cf/qwen/qwen1.5-14b-chat-awq",
  "@hf/thebloke/openhermes-2.5-mistral-7b-awq",
  "@cf/qwen/qwen1.5-1.8b-chat",
  "@cf/qwen/qwen1.5-7b-chat-awq",
  "@hf/nexusflow/starling-lm-7b-beta",
  "@hf/thebloke/neural-chat-7b-v3-1-awq",
  "@cf/fblgit/una-cybertron-7b-v2-bf16",
  "@cf/thebloke/discolm-german-7b-v1-awq",
  "@cf/deepseek-ai/deepseek-math-7b-instruct",
  "@cf/tiiuae/falcon-7b-instruct",
  "@hf/thebloke/zephyr-7b-beta-awq",
  "@cf/openchat/openchat-3.5-0106",
  "@cf/qwen/qwen1.5-0.5b-chat",
  "@cf/tinyllama/tinyllama-1.1b-chat-v1.0",
  "@hf/thebloke/mistral-7b-instruct-v0.1-awq",
  "@hf/thebloke/llama-2-13b-chat-awq",
];

/** Models present in the catalog but consistently unavailable (non-deprecated reasons) */
const UNAVAILABLE: string[] = [
  /** Error 5016: Requires license agreement 'agree' prompt (@todo: Needs to be addressed in a separate issue) */
  "@cf/meta/llama-3.2-11b-vision-instruct",

  /** Error 5006: Incorrect role handling */
  "@cf/meta/llama-guard-3-8b",

  /** No output response */
  "@hf/nousresearch/hermes-2-pro-mistral-7b",

  /** Error 5021/1031: Unlike standard 5021 context limit errors that resolve in a new chat,
   * these models fail even in new sessions, suggesting a different root cause. */
  "@cf/microsoft/phi-2",
  "@cf/meta-llama/llama-2-7b-chat-hf-lora", // 1031
];

/** Other exclusions */
const OTHER: string[] = [];

export const EXCLUDED_MODELS = new Set([...DEPRECATED, ...UNAVAILABLE, ...OTHER]);

/** Maps error codes to their excluded model IDs - useful for logging and future admin tooling */
export const EXCLUDED_BY_ERROR: Record<string, string[]> = {
  "5028": DEPRECATED,
};
