import { FREE_NEURON_ALLOCATION, getImageModel, normalizeImageSettings, type ImageSize } from "../../shared/imageModels";
import type { ImageMetadata } from "../storage";

export async function generateImage(prompt: string, model: string, size: ImageSize, steps: number): Promise<{ blob: Blob; seed?: number }> {
  const response = await fetch("/api/images/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, model, size, steps }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Image generation failed");
  }
  const blob = await response.blob();
  return { blob, seed: Number(response.headers.get("X-Image-Seed")) || undefined };
}

export function estimateImageNeurons(modelId: string, size: string, steps: number): number {
  const model = getImageModel(modelId);
  if (!model) return 0;
  const settings = normalizeImageSettings(model, size, steps);
  return Math.ceil(model.estimateNeurons(settings.size, settings.steps));
}

export function estimateImagesPerDay(modelId: string, size: string, steps: number): number {
  const cost = estimateImageNeurons(modelId, size, steps);
  return cost > 0 ? Math.floor(FREE_NEURON_ALLOCATION / cost) : 0;
}

export function readImageMetadata(value: unknown): ImageMetadata | undefined {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return undefined; }
  }
  return value && typeof value === "object" ? value as ImageMetadata : undefined;
}
