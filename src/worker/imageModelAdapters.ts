import type { ImageModelDefinition, ImageSize } from "../shared/imageModels";
import { normalizeImageResponse, type GeneratedImage } from "./imageGeneration";

export interface ImageModelAdapter {
  buildInput: (prompt: string, size: ImageSize, steps: number, seed?: number) => unknown;
  normalizeResponse: (response: unknown) => Promise<GeneratedImage>;
}

function getDimensions(size: ImageSize, model: ImageModelDefinition): [number, number] {
  if (size === "model-default") return [model.defaultWidth, model.defaultHeight];
  const [width, height] = size.split("x").map(Number);
  return [width || model.defaultWidth, height || model.defaultHeight];
}

function buildImageModelInput(model: ImageModelDefinition, prompt: string, size: ImageSize, steps: number, seed?: number) {
  const dims = model.sizes.length > 1 ? getDimensions(size, model) : undefined;
  const params = new FormData();
  params.set("prompt", prompt);
  if (!model.steps.fixed) {
    if (model.steps.field === "num_steps") params.set("num_steps", String(steps));
    else params.set("steps", String(steps));
  }
  if (dims) {
    params.set("width", String(dims[0]));
    params.set("height", String(dims[1]));
  }
  if (seed !== undefined) params.set("seed", String(seed));

  if (model.inputEncoding === "json") {
    const input: Record<string, unknown> = { prompt };
    if (!model.steps.fixed) input[model.steps.field] = steps;
    if (dims) {
      input.width = dims[0];
      input.height = dims[1];
    }
    if (seed !== undefined) input.seed = seed;
    return input;
  }

  // Workers AI accepts multipart through a serialized Request stream and its generated boundary.
  const request = new Request("http://image-model-input", { method: "POST", body: params });
  return { multipart: { body: request.body, contentType: request.headers.get("content-type") || "multipart/form-data" } };
}

export function getImageModelAdapter(model: ImageModelDefinition): ImageModelAdapter {
  const normalizers = {
    "image-field-or-stream": normalizeImageResponse,
  } as const;
  return {
    buildInput: (prompt, size, steps, seed) => buildImageModelInput(model, prompt, size, steps, seed),
    normalizeResponse: normalizers[model.responseNormalizer],
  };
}
