import { Hono } from "hono";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS, normalizeImageResponse } from "../imageGeneration";
import { isModelExcluded } from "../config/model-exclusions";
import { getSecret } from "../db";
import type { Env } from "../types";

const router = new Hono<{ Bindings: Env }>();
const MAX_PROMPT_LENGTH = 2048;
const MAX_STEPS = 8;

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
  const models = data.result.filter((model) => model.task?.name?.toLowerCase().includes("text-to-image") && model.name === DEFAULT_IMAGE_MODEL && !isModelExcluded(model.name)).map((model) => ({ id: model.name, name: model.name.split("/").pop()?.replaceAll("-", " ") || model.name }));
  return models.length ? models : IMAGE_MODELS.filter((model) => !isModelExcluded(model.id));
}

router.get("/models", async (c) => {
  try { return c.json(await getImageModels(c)); }
  catch { return c.json(IMAGE_MODELS.filter((model) => !isModelExcluded(model.id))); }
});

router.post("/generate", async (c) => {
  let body: { prompt?: unknown; model?: unknown; size?: unknown; steps?: unknown; seed?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid request body" }, 400); }
  if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > MAX_PROMPT_LENGTH) return c.json({ error: `Prompt must be between 1 and ${MAX_PROMPT_LENGTH} characters` }, 400);
  if (body.size !== "model-default") return c.json({ error: "Unsupported image size" }, 400);
  const steps = body.steps ?? 4;
  if (!Number.isInteger(steps) || (steps as number) < 1 || (steps as number) > MAX_STEPS) return c.json({ error: `Steps must be between 1 and ${MAX_STEPS}` }, 400);
  const model = typeof body.model === "string" ? body.model : DEFAULT_IMAGE_MODEL;
  if (!(await getImageModels(c).catch(() => IMAGE_MODELS)).some((item) => item.id === model)) return c.json({ error: "Selected image model is unavailable" }, 400);
  try {
    const result = await c.env.AI.run(model as keyof AiModels, { prompt: body.prompt.trim(), steps: steps as number, ...(Number.isInteger(body.seed) ? { seed: body.seed as number } : {}) } as never);
    const image = await normalizeImageResponse(result);
    return new Response(image.bytes.slice().buffer as ArrayBuffer, { headers: { "Content-Type": image.mimeType, "X-Image-Seed": image.seed === undefined ? "" : String(image.seed), "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/3036|daily free allocation|quota|neurons/i.test(message)) return c.json({ error: "Workers AI daily free allocation is exhausted. Try again after the daily reset." }, 429);
    console.error("[/api/images/generate] image inference failed");
    return c.json({ error: "Image generation failed. Check the model and try again." }, 502);
  }
});

export default router;
