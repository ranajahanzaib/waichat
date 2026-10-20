export { DEFAULT_IMAGE_MODEL_ID as DEFAULT_IMAGE_MODEL, IMAGE_MODEL_REGISTRY as IMAGE_MODELS, getImageModel, normalizeImageSettings } from "../shared/imageModels";
import { getImageModel } from "../shared/imageModels";

export interface GeneratedImage {
  bytes: Uint8Array;
  mimeType: string;
  seed?: number;
}

export function detectImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(String.fromCharCode(...bytes.slice(0, 6)))) return "image/gif";
  return null;
}

export async function normalizeImageResponse(response: unknown): Promise<GeneratedImage> {
  let bytes: Uint8Array;
  let seed: number | undefined;
  if (response instanceof ReadableStream) {
    bytes = new Uint8Array(await new Response(response).arrayBuffer());
  } else if (response instanceof ArrayBuffer) {
    bytes = new Uint8Array(response);
  } else if (response instanceof Uint8Array) {
    bytes = response;
  } else if (response && typeof response === "object" && "image" in response && typeof (response as { image: unknown }).image === "string") {
    const result = response as { image: string; seed?: number };
    const binary = atob(result.image);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    seed = typeof result.seed === "number" ? result.seed : undefined;
  } else {
    throw new Error("unsupported_response");
  }
  const mimeType = detectImageMime(bytes);
  if (!mimeType) throw new Error("unsupported_image_format");
  return { bytes, mimeType, seed };
}

export function modelPromptMax(modelId: string): number {
  return getImageModel(modelId)?.promptMax ?? 2048;
}
