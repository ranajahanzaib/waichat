export type ImageSize = "model-default" | "512x512" | "768x768" | "1024x768" | "1024x1024" | "1536x1024";
export type ImageModelId =
  | "@cf/black-forest-labs/flux-1-schnell"
  | "@cf/black-forest-labs/flux-2-klein-4b"
  | "@cf/black-forest-labs/flux-2-klein-9b"
  | "@cf/black-forest-labs/flux-2-dev"
  | "@cf/leonardo/phoenix-1.0"
  | "@cf/leonardo/lucid-origin";

export interface ImageModelDefinition {
  id: ImageModelId;
  name: string;
  provider: string;
  tier: "free-friendly" | "uses-more-quota";
  sizes: ImageSize[];
  defaultSize: ImageSize;
  steps: { min: number; max: number; default: number; fixed?: boolean; field: "steps" | "num_steps"; minSource?: "documented" | "app-safety-cap"; maxSource?: "documented" | "app-safety-cap"; defaultSource?: "documented" | "app-assumption" };
  promptMax?: number;
  promptMaxSource?: "documented" | "app-safety-cap";
  inputEncoding: "json" | "multipart";
  responseNormalizer: "image-field-or-stream";
  licenseBadge: string;
  termsUrl: string;
  defaultWidth: number;
  defaultHeight: number;
  estimateNeurons: (size: ImageSize, steps: number) => number;
}

const tileCount = (width: number, height: number) => Math.ceil(width / 512) * Math.ceil(height / 512);
const estimateDimensions = (size: ImageSize) => {
  // Cloudflare's published model pricing estimate convention here assumes 1024x1024 for model-default.
  if (size === "model-default") return [1024, 1024];
  const [width, height] = size.split("x").map(Number);
  return [width || 1024, height || 1024];
};
const tiles = (size: ImageSize) => {
  const [width, height] = estimateDimensions(size);
  return tileCount(width, height);
};

// Rates from https://developers.cloudflare.com/workers-ai/platform/pricing/ (checked 2026-10-20).
// Estimates count output tiles only; no input-image tiles are used by this text-to-image feature.
export const IMAGE_MODEL_REGISTRY: ImageModelDefinition[] = [
  {
    id: "@cf/black-forest-labs/flux-1-schnell", name: "FLUX.1 schnell", provider: "Black Forest Labs", tier: "free-friendly",
    sizes: ["model-default"], defaultSize: "model-default", steps: { min: 1, max: 8, default: 4, field: "steps", minSource: "app-safety-cap" }, promptMax: 2048, promptMaxSource: "documented",
    inputEncoding: "json", responseNormalizer: "image-field-or-stream", licenseBadge: "Apache 2.0", termsUrl: "https://bfl.ai/legal/terms-of-service",
    defaultWidth: 1024, defaultHeight: 1024, estimateNeurons: (size, steps) => tiles(size) * 4.8 + 9.6 * steps,
  },
  {
    id: "@cf/black-forest-labs/flux-2-klein-4b", name: "FLUX.2 Klein 4B", provider: "Black Forest Labs", tier: "free-friendly",
    sizes: ["model-default", "512x512", "768x768", "1024x768", "1024x1024"], defaultSize: "model-default", steps: { min: 4, max: 4, default: 4, fixed: true, field: "steps" }, promptMax: 2048, promptMaxSource: "app-safety-cap",
    inputEncoding: "multipart", responseNormalizer: "image-field-or-stream", licenseBadge: "Apache 2.0", termsUrl: "https://bfl.ai/legal/terms-of-service",
    defaultWidth: 1024, defaultHeight: 768, estimateNeurons: (size, steps) => tiles(size) * 26.05,
  },
  {
    id: "@cf/black-forest-labs/flux-2-klein-9b", name: "FLUX.2 Klein 9B", provider: "Black Forest Labs", tier: "uses-more-quota",
    sizes: ["model-default", "512x512", "768x768", "1024x768", "1024x1024"], defaultSize: "model-default", steps: { min: 4, max: 4, default: 4, fixed: true, field: "steps" }, promptMax: 2048, promptMaxSource: "app-safety-cap",
    inputEncoding: "multipart", responseNormalizer: "image-field-or-stream", licenseBadge: "Non-commercial license: check Terms before selling outputs", termsUrl: "https://bfl.ai/legal/terms-of-service",
    defaultWidth: 1024, defaultHeight: 768, estimateNeurons: (size) => {
      const megapixels = Math.ceil((estimateDimensions(size)[0] * estimateDimensions(size)[1]) / 1_048_576);
      return 1363.64 + Math.max(0, megapixels - 1) * 181.82;
    },
  },
  {
    id: "@cf/black-forest-labs/flux-2-dev", name: "FLUX.2 dev", provider: "Black Forest Labs", tier: "uses-more-quota",
    sizes: ["model-default", "512x512", "768x768", "1024x768", "1024x1024", "1536x1024"], defaultSize: "model-default", steps: { min: 1, max: 50, default: 25, field: "steps", minSource: "app-safety-cap", maxSource: "app-safety-cap", defaultSource: "app-assumption" }, promptMax: 2048, promptMaxSource: "app-safety-cap",
    inputEncoding: "multipart", responseNormalizer: "image-field-or-stream", licenseBadge: "Non-commercial license: check Terms before selling outputs", termsUrl: "https://bfl.ai/legal/terms-of-service",
    defaultWidth: 1024, defaultHeight: 768, estimateNeurons: (size, steps) => tiles(size) * 37.5 * steps,
  },
  {
    id: "@cf/leonardo/phoenix-1.0", name: "Phoenix 1.0", provider: "Leonardo", tier: "uses-more-quota",
    sizes: ["model-default", "512x512", "768x768", "1024x768", "1024x1024"], defaultSize: "model-default", steps: { min: 1, max: 50, default: 25, field: "num_steps" }, promptMax: 2048, promptMaxSource: "app-safety-cap",
    inputEncoding: "json", responseNormalizer: "image-field-or-stream", licenseBadge: "Check provider terms", termsUrl: "https://leonardo.ai/terms-of-service",
    defaultWidth: 1024, defaultHeight: 1024, estimateNeurons: (size, steps) => tiles(size) * 530 + 10 * steps,
  },
  {
    id: "@cf/leonardo/lucid-origin", name: "Lucid Origin", provider: "Leonardo", tier: "uses-more-quota",
    sizes: ["model-default", "512x512", "768x768", "1024x768", "1024x1024", "1536x1024"], defaultSize: "model-default", steps: { min: 1, max: 40, default: 25, field: "steps", defaultSource: "app-assumption" }, promptMax: 2048, promptMaxSource: "app-safety-cap",
    inputEncoding: "json", responseNormalizer: "image-field-or-stream", licenseBadge: "Check provider terms", termsUrl: "https://leonardo.ai/terms-of-service",
    defaultWidth: 1120, defaultHeight: 1120, estimateNeurons: (size, steps) => tiles(size) * 636 + 12 * steps,
  },
];

export const DEFAULT_IMAGE_MODEL_ID: ImageModelId = IMAGE_MODEL_REGISTRY[0]!.id;
export const FREE_NEURON_ALLOCATION = 10_000;
export const IMAGE_SIZE_LABELS: Record<ImageSize, string> = {
  "model-default": "Model default", "512x512": "512 × 512", "768x768": "768 × 768",
  "1024x768": "1024 × 768", "1024x1024": "1024 × 1024", "1536x1024": "1536 × 1024",
};

export function getImageModel(modelId: string): ImageModelDefinition | undefined {
  return IMAGE_MODEL_REGISTRY.find((model) => model.id === modelId);
}

export function normalizeImageSettings(model: ImageModelDefinition, size: string, steps: number) {
  return {
    size: model.sizes.includes(size as ImageSize) ? size as ImageSize : model.defaultSize,
    steps: Math.min(model.steps.max, Math.max(model.steps.min, Number.isFinite(steps) ? Math.round(steps) : model.steps.default)),
  };
}
