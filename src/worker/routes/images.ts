import { Hono } from "hono";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS, getImageModel, modelPromptMax, normalizeImageSettings } from "../imageGeneration";
import { getImageModelAdapter } from "../imageModelAdapters";
import { isModelExcluded } from "../config/model-exclusions";
import { getSecret } from "../db";
import type { Env } from "../types";

const router = new Hono<{ Bindings: Env }>();
async function getImageModels(c: { env: Env }) {
  let accountId = c.env.CLOUDFLARE_ACCOUNT_ID;
  let apiToken = c.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    try {
      const [storedAccount, storedToken] = await Promise.all([
        getSecret(c.env.DB, "cf_account_id", c.env.SECRET_KEY),
        getSecret(c.env.DB, "cf_api_token", c.env.SECRET_KEY),
      ]);
      accountId ||= storedAccount || undefined;
      apiToken ||= storedToken || undefined;
    } catch { /* use the built-in fallback */ }
  }
  if (!accountId || !apiToken) return IMAGE_MODELS.filter((model) => !isModelExcluded(model.id));
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?task=Text-to-Image&per_page=100`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!response.ok) throw new Error("catalog unavailable");
  const data = await response.json() as { success: boolean; result?: { name: string; task?: { name?: string } }[] };
  if (!data.success || !Array.isArray(data.result)) throw new Error("catalog unavailable");
  const available = new Set(data.result.filter((model) => model.task?.name?.toLowerCase().includes("text-to-image") && !isModelExcluded(model.name)).map((model) => model.name));
  const models = IMAGE_MODELS.filter((model) => available.has(model.id) && !isModelExcluded(model.id));
  return models;
}

router.get("/models", async (c) => {
  try { return c.json(await getImageModels(c)); }
  catch { return c.json(IMAGE_MODELS.filter((model) => !isModelExcluded(model.id))); }
});

router.post("/generate", async (c) => {
  let body: { prompt?: unknown; model?: unknown; size?: unknown; steps?: unknown; seed?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid request body" }, 400); }
  const model = typeof body.model === "string" ? body.model : DEFAULT_IMAGE_MODEL;
  const definition = getImageModel(model);
  if (!definition || !(await getImageModels(c).catch(() => IMAGE_MODELS)).some((item) => item.id === model)) return c.json({ error: "Selected image model is unavailable" }, 400);
  const maxPromptLength = modelPromptMax(model);
  if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > maxPromptLength) return c.json({ error: `Prompt must be between 1 and ${maxPromptLength} characters` }, 400);
  const size = typeof body.size === "string" ? body.size : definition.defaultSize;
  if (!definition.sizes.includes(size as (typeof definition.sizes)[number])) return c.json({ error: "This model does not support the selected image size" }, 400);
  const normalized = normalizeImageSettings(definition, size, Number(body.steps ?? definition.steps.default));
  if (!Number.isInteger(body.steps ?? definition.steps.default) || normalized.steps !== Number(body.steps ?? definition.steps.default)) return c.json({ error: `Steps must be ${definition.steps.min === definition.steps.max ? definition.steps.min : `between ${definition.steps.min} and ${definition.steps.max}`}` }, 400);
  try {
    const adapter = getImageModelAdapter(definition);
    const result = await c.env.AI.run(model as keyof AiModels, adapter.buildInput(body.prompt.trim(), normalized.size, normalized.steps, Number.isInteger(body.seed) ? body.seed as number : undefined) as never);
    const image = await adapter.normalizeResponse(result);
    return new Response(image.bytes.slice().buffer as ArrayBuffer, { headers: { "Content-Type": image.mimeType, "X-Image-Seed": image.seed === undefined ? "" : String(image.seed), "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/3036|daily free allocation|quota|neurons|exceeded.*limit/i.test(message)) return c.json({ error: "Workers AI daily free allocation is exhausted. Try again after the daily reset." }, 429);
    if (/invalid.*step|step.*(invalid|range)|unsupported.*(parameter|argument)|unknown.*parameter/i.test(message)) return c.json({ error: "These settings are not supported by the selected image model. Adjust size or steps and try again." }, 400);
    if (/not found|unavailable|does not exist/i.test(message)) return c.json({ error: "This image model is temporarily unavailable. Choose another model and try again." }, 503);
    console.error("[/api/images/generate] image inference failed");
    return c.json({ error: "Image generation failed. Check the model and try again." }, 502);
  }
});

export default router;
