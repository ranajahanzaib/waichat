import type { ImageMetadata } from "../storage";

export async function generateImage(prompt: string, model: string, steps: number): Promise<{ blob: Blob; seed?: number }> {
  const response = await fetch("/api/images/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, model, size: "model-default", steps }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Image generation failed");
  }
  const blob = await response.blob();
  return { blob, seed: Number(response.headers.get("X-Image-Seed")) || undefined };
}

export function estimateImageNeurons(steps: number): number {
  // FLUX.1 schnell defaults to a 1024px image (four 512px tiles): 4.8 neurons/tile plus 9.6/step.
  return Math.ceil(4.8 * 4 + 9.6 * steps);
}

export function readImageMetadata(value: unknown): ImageMetadata | undefined {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return undefined; }
  }
  return value && typeof value === "object" ? value as ImageMetadata : undefined;
}
