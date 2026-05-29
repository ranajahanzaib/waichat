import { Hono } from "hono";
import { cors } from "hono/cors";
import { AVAILABLE_MODELS, generateTitle, streamAiResponse } from "./ai";
import { getModelNotice, isModelExcluded } from "./config/model-exclusions";
import {
  deleteConversation,
  deleteSetting,
  getConversation,
  getConversations,
  getMessages,
  getSecret,
  getSetting,
  importConversation,
  saveMessage,
  setSecret,
  setSetting,
  updateConversationTimestamp,
  updateConversationTitle,
} from "./db";
import type { ChatRequest, Conversation, Env, Message, Model, SystemPrompt } from "./types";

// Isolate-specific in-memory cache for models
let modelCache: { data: Model[]; timestamp: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function scoreModel(id: string): number {
  let score = 0;

  // Explicit boosts for known latest models
  if (id.includes("gemma-4")) score += 100;
  if (id.includes("kimi-k2")) score += 95;
  if (id.includes("llama-4")) score += 90;
  if (id.includes("qwen3")) score += 85;
  if (id.includes("gpt-oss-120b")) score += 80;
  if (id.includes("llama-3.3")) score += 75;
  if (id.includes("deepseek-r1")) score += 70;
  if (id.includes("qwq")) score += 65;
  if (id.includes("mistral-small-3.1")) score += 60;
  if (id.includes("gpt-oss-20b")) score += 55;

  // General heuristics for everything else
  const versionMatch = id.match(/(\d+)\.\d+/);
  if (versionMatch) score += parseInt(versionMatch[1]) * 2;

  const sizeMatch = id.match(/(\d+)b/i);
  if (sizeMatch) score += parseInt(sizeMatch[1]);

  if (id.includes("fast")) score += 3;
  if (id.includes("fp8")) score += 2;

  // Penalize old models
  if (id.includes("v0.1") || id.includes("v0.2")) score -= 20;
  if (id.includes("llama-2")) score -= 30;
  if (id.includes("1.5b") || id.includes("0.5b") || id.includes("1.1b")) score -= 15;
  if (id.includes("lora")) score -= 10;

  return score;
}

function formatModelName(id: string): string {
  const parts = id.split("/");
  const slug = parts[parts.length - 1];
  const author = parts[parts.length - 2] ?? "";

  // Known author prefixes to prepend
  const authorMap: Record<string, string> = {
    openai: "OpenAI",
    meta: "Meta",
    mistral: "Mistral",
    "deepseek-ai": "DeepSeek",
    qwen: "Qwen",
    google: "Google",
    microsoft: "Microsoft",
  };

  const formattedSlug = slug
    .split("-")
    .map((word) => {
      if (/^\d/.test(word)) return word.toUpperCase();
      const lower = word.toLowerCase();
      const special: Record<string, string> = {
        gpt: "GPT",
        oss: "OSS",
        fp8: "FP8",
        awq: "AWQ",
        llm: "LLM",
        rag: "RAG",
        qwq: "QwQ",
        llama: "Llama",
        mistral: "Mistral",
        deepseek: "DeepSeek",
        instruct: "Instruct",
        fast: "Fast",
        chat: "Chat",
        vision: "Vision",
        coder: "Coder",
        distill: "Distill",
      };
      return special[lower] ?? word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");

  const prefix = authorMap[author];
  return prefix ? `${prefix} ${formattedSlug}` : formattedSlug;
}

async function fetchDynamicModels(accountId: string, apiToken: string): Promise<Model[]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?task=Text+Generation&per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    },
  );

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as any;
    throw new Error(errorData.errors?.[0]?.message || `Cloudflare API error: ${res.status}`);
  }

  const data = (await res.json()) as {
    result: {
      id: string;
      name: string;
      description: string;
      task: { name: string };
    }[];
    success: boolean;
    errors?: { message: string }[];
  };

  if (!data.success) {
    throw new Error(data.errors?.[0]?.message || "Cloudflare API request failed");
  }

  return data.result
    .filter((m) => !isModelExcluded(m.name))
    .map((m) => ({
      id: m.name,
      name: formatModelName(m.name),
      notice: getModelNotice(m.name) || undefined,
    }))
    .sort((a, b) => scoreModel(b.id) - scoreModel(a.id));
}

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());

// Models - fetched live from Cloudflare API if account ID is set, otherwise hardcoded fallback
app.get("/api/models", async (c) => {
  // Check Cache
  const now = Date.now();
  if (modelCache && now - modelCache.timestamp < CACHE_TTL) {
    return c.json(modelCache.data);
  }

  // Resolve Credentials
  let accountId = c.env.CLOUDFLARE_ACCOUNT_ID;
  let apiToken = c.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    try {
      // Try fetching from D1 if environment variables are missing
      const [d1AccountId, d1ApiToken] = await Promise.all([
        getSecret(c.env.DB, "cf_account_id", c.env.SECRET_KEY),
        getSecret(c.env.DB, "cf_api_token", c.env.SECRET_KEY),
      ]);
      accountId = accountId || d1AccountId || undefined;
      apiToken = apiToken || d1ApiToken || undefined;
    } catch (e) {
      console.error("[/api/models] Error resolving D1 secrets:", e);
    }
  }

  // Fallback to hardcoded list
  const fallback = AVAILABLE_MODELS.filter((m) => !isModelExcluded(m.id)).map((m) => ({
    ...m,
    notice: getModelNotice(m.id) || undefined,
  }));

  if (!accountId || !apiToken) {
    return c.json(fallback);
  }

  // Fetch & Cache
  try {
    const models = await fetchDynamicModels(accountId, apiToken);
    modelCache = { data: models, timestamp: now };
    return c.json(models);
  } catch (e) {
    console.error("[/api/models] error:", e);
    return c.json(fallback);
  }
});

// Secrets Management for Dynamic Models
app.get("/api/secrets", async (c) => {
  const isConfigurable = !!c.env.SECRET_KEY;
  let accountId: string | null = null;
  let hasToken = false;

  try {
    if (isConfigurable) {
      const [rawAccountId, rawApiToken] = await Promise.all([
        getSecret(c.env.DB, "cf_account_id", c.env.SECRET_KEY),
        getSecret(c.env.DB, "cf_api_token", c.env.SECRET_KEY),
      ]);

      if (rawAccountId) {
        // Mask account ID: show last 4 chars
        accountId = rawAccountId.length > 4 ? "********" + rawAccountId.slice(-4) : rawAccountId;
      }
      hasToken = !!rawApiToken;
    }
  } catch (e) {
    console.error("[/api/secrets] Error fetching secrets:", e);
  }

  return c.json({ accountId, hasToken, isConfigurable });
});

app.post("/api/secrets", async (c) => {
  if (!c.env.SECRET_KEY) {
    return c.json({ error: "SECRET_KEY environment variable is not set" }, 400);
  }

  const { accountId, apiToken } = await c.req.json<{
    accountId: string;
    apiToken: string;
  }>();

  if (!accountId || !apiToken) {
    return c.json({ error: "Account ID and API Token are required" }, 400);
  }

  try {
    // Validate credentials with a test fetch
    const models = await fetchDynamicModels(accountId, apiToken);

    // Save to D1
    await setSecret(c.env.DB, "cf_account_id", accountId, c.env.SECRET_KEY);
    await setSecret(c.env.DB, "cf_api_token", apiToken, c.env.SECRET_KEY);

    // Update cache immediately
    modelCache = { data: models, timestamp: Date.now() };

    return c.json({ success: true, models });
  } catch (e: any) {
    console.error("[POST /api/secrets] error:", e);
    return c.json({ error: e.message || "Failed to validate credentials" }, 400);
  }
});

app.delete("/api/secrets", async (c) => {
  try {
    await deleteSetting(c.env.DB, "cf_account_id");
    await deleteSetting(c.env.DB, "cf_api_token");
    // Invalidate cache
    modelCache = null;
    return c.json({ success: true });
  } catch (e: any) {
    console.error("[DELETE /api/secrets] error:", e);
    return c.json({ error: "Failed to clear credentials" }, 500);
  }
});

// Conversations
app.get("/api/conversations", async (c) => {
  const conversations = await getConversations(c.env.DB);
  return c.json(conversations);
});

// Export all workspace data (conversations, messages, settings)
app.get("/api/export", async (c) => {
  try {
    const db = c.env.DB;

    // Helper to fetch all rows using pagination (bypass 10k limit)
    const fetchAll = async (query: string) => {
      const results: any[] = [];
      const LIMIT = 10000;
      let offset = 0;
      while (true) {
        const batch = await db.prepare(`${query} LIMIT ${LIMIT} OFFSET ${offset}`).all();
        if (!batch.results || batch.results.length === 0) break;
        results.push(...batch.results);
        if (batch.results.length < LIMIT) break;
        offset += LIMIT;
      }
      return results;
    };

    const conversations = await fetchAll(
      "SELECT id, title, model, created_at, updated_at FROM conversations",
    );
    const messages = await fetchAll(
      "SELECT id, conversation_id, role, content, created_at, model, parent_id FROM messages WHERE deleted_at IS NULL",
    );
    const settingsRaw = await fetchAll("SELECT key, value FROM settings");

    // Reformat settings into a simple key-value object
    const settings: Record<string, string> = {};
    for (const { key, value } of settingsRaw as { key: string; value: string }[]) {
      settings[key] = value;
    }

    return c.json({ conversations, messages, settings });
  } catch (e) {
    console.error("[GET /api/export] error:", e);
    return c.json({ error: "Export failed" }, 500);
  }
});

app.post("/api/conversations", async (c) => {
  const body = await c.req.json<{ model: string; system_prompt_id?: string; system_prompt?: string }>().catch(() => null);
  if (!body || typeof body.model !== "string" || !body.model.trim()) {
    return c.json({ error: "Model is required and must be a non-empty string" }, 400);
  }
  const systemPromptContent =
    typeof body.system_prompt === "string" && body.system_prompt.trim()
      ? body.system_prompt.trim()
      : null;
  if (systemPromptContent && systemPromptContent.length > 10000) {
    return c.json({ error: "system_prompt must be 10000 characters or less" }, 400);
  }
  const now = Date.now();
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    title: "New Conversation",
    model: body.model,
    created_at: now,
    updated_at: now,
    system_prompt_id: typeof body.system_prompt_id === "string" && body.system_prompt_id.trim() ? body.system_prompt_id.trim() : null,
    system_prompt: systemPromptContent,
  };
  await c.env.DB.prepare(
    "INSERT INTO conversations (id, title, model, created_at, updated_at, system_prompt_id, system_prompt) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      conversation.id,
      conversation.title,
      conversation.model,
      conversation.created_at,
      conversation.updated_at,
      conversation.system_prompt_id,
      conversation.system_prompt,
    )
    .run();
  return c.json(conversation, 201);
});

app.get("/api/conversations/:id", async (c) => {
  const conversation = await getConversation(c.env.DB, c.req.param("id"));
  if (!conversation) return c.json({ error: "Not found" }, 404);
  const messages = await getMessages(c.env.DB, conversation.id);
  return c.json({ conversation, messages });
});

// Import a full conversation + messages from local storage into D1
app.post("/api/conversations/import", async (c) => {
  try {
    const { conversation, messages } = await c.req.json<{
      conversation: {
        id: string;
        title: string;
        model: string;
        created_at: number;
        updated_at: number;
      };
      messages: {
        id: string;
        conversation_id: string;
        role: "user" | "assistant";
        content: string;
        created_at: number;
        model?: string;
        parent_id?: string;
        deleted_at?: number;
      }[];
    }>();

    if (!conversation?.id || !Array.isArray(messages)) {
      return c.json({ success: false, error: "Invalid request body" }, 400);
    }

    await importConversation(c.env.DB, conversation, messages);
    return c.json({ success: true, conversationId: conversation.id });
  } catch (e) {
    console.error("[POST /api/conversations/import] error:", e);
    return c.json({ success: false, error: "Import failed" }, 500);
  }
});

app.delete("/api/conversations", async (c) => {
  await c.env.DB.prepare("DELETE FROM conversations").run();
  return c.json({ success: true });
});

app.delete("/api/conversations/:id", async (c) => {
  await deleteConversation(c.env.DB, c.req.param("id"));
  return c.json({ success: true });
});

app.patch("/api/conversations/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ model?: string; title?: string }>();
  const db = c.env.DB;

  const conversation = await getConversation(db, id);
  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (body.model) {
    updates.push("model = ?");
    params.push(body.model);
    updates.push("updated_at = ?");
    params.push(Date.now());
  }
  if (body.title) {
    updates.push("title = ?");
    params.push(body.title);
  }

  if (updates.length > 0) {
    params.push(id);
    await db
      .prepare(`UPDATE conversations SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...params)
      .run();
  }

  return c.json({ success: true });
});

// Delete a single message (with recursive soft-delete logic for its sub-tree)
app.post("/api/conversations/:conversationId/messages", async (c) => {
  const conversationId = c.req.param("conversationId");
  const body = await c.req.json<Message>();
  const db = c.env.DB;

  if (body.conversation_id && body.conversation_id !== conversationId) {
    return c.json({ error: "Conversation ID mismatch" }, 400);
  }

  if (!body.role || !body.content) {
    return c.json({ error: "Role and content are required" }, 400);
  }

  const conversation = await getConversation(db, conversationId);
  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const messageId = body.id || crypto.randomUUID();
  const createdAt = body.created_at || Date.now();
  const now = Date.now();

  await db
    .prepare(
      "INSERT INTO messages (id, conversation_id, role, content, created_at, model, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET content=excluded.content, model=COALESCE(excluded.model, messages.model)",
    )
    .bind(
      messageId,
      conversationId,
      body.role,
      body.content,
      createdAt,
      body.model || null,
      body.parent_id || null,
    )
    .run();

  // Update conversation timestamp
  await db
    .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
    .bind(now, conversationId)
    .run();

  const fullMessage: Message = {
    ...body,
    id: messageId,
    conversation_id: conversationId,
    created_at: createdAt,
  };

  return c.json(fullMessage);
});

app.delete("/api/conversations/:conversationId/messages/:messageId", async (c) => {
  const { conversationId, messageId } = c.req.param();
  const db = c.env.DB;

  try {
    const allMessages = await getMessages(db, conversationId);
    const targetMsg = allMessages.find((m) => m.id === messageId);

    if (!targetMsg) {
      return c.json({ error: "Message not found" }, 404);
    }

    // Find all descendants in memory
    const childrenMap = new Map<string | null, string[]>();
    for (const m of allMessages) {
      const pId = m.parent_id || null;
      const children = childrenMap.get(pId) || [];
      children.push(m.id);
      childrenMap.set(pId, children);
    }

    const descendants = new Set<string>();
    const stack = [messageId];
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (descendants.has(currentId)) continue;
      descendants.add(currentId);
      const children = childrenMap.get(currentId);
      if (children) stack.push(...children);
    }

    const softDeletedIds = Array.from(descendants);
    const now = Date.now();
    const statements: D1PreparedStatement[] = [];

    // Chunk soft-deletes to respect D1's 100-parameter limit per statement
    const CHUNK_SIZE = 90;
    for (let i = 0; i < softDeletedIds.length; i += CHUNK_SIZE) {
      const chunk = softDeletedIds.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => "?").join(",");
      statements.push(
        db
          .prepare(
            "UPDATE messages SET content = '', deleted_at = ? WHERE id IN (" + placeholders + ")",
          )
          .bind(now, ...chunk),
      );
    }

    statements.push(
      db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").bind(now, conversationId),
    );
    await db.batch(statements);

    return c.json({ success: true, deletedIds: [], softDeletedIds });
  } catch (e) {
    console.error("[DELETE /message] error:", e);
    return c.json({ error: "Failed to delete message" }, 500);
  }
});

// System Prompt Library
app.get("/api/system-prompts", async (c) => {
  const prompts = await c.env.DB.prepare(
    "SELECT id, user_id, name, content, created_at, updated_at FROM system_prompts ORDER BY created_at ASC",
  )
    .all<SystemPrompt>()
    .then((r) => r.results);
  return c.json(prompts);
});

app.post("/api/system-prompts", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) || {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!name || !content) {
    return c.json({ error: "Name and content are required and must be non-empty strings" }, 400);
  }
  if (name.length > 100) {
    return c.json({ error: "Name must be 100 characters or less" }, 400);
  }
  if (content.length > 10000) {
    return c.json({ error: "Content must be 10000 characters or less" }, 400);
  }
  const now = Date.now();
  const prompt: SystemPrompt = {
    id: typeof body.id === "string" && body.id.trim() && body.id.length <= 36 ? body.id.trim() : crypto.randomUUID(),
    user_id: "default",
    name,
    content,
    created_at: typeof body.created_at === "number" ? body.created_at : now,
    updated_at: typeof body.updated_at === "number" ? body.updated_at : now,
  };
  await c.env.DB.prepare(
    "INSERT INTO system_prompts (id, user_id, name, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, content = excluded.content, updated_at = excluded.updated_at WHERE system_prompts.updated_at IS NULL OR excluded.updated_at >= system_prompts.updated_at",
  )
    .bind(prompt.id, prompt.user_id, prompt.name, prompt.content, prompt.created_at, prompt.updated_at)
    .run();
  return c.json(prompt, 201);
});

app.patch("/api/system-prompts/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) || {};

  const existing = await c.env.DB.prepare("SELECT id FROM system_prompts WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const updates: string[] = [];
  const params: (string | number)[] = [];
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return c.json({ error: "Name must be a non-empty string" }, 400);
    }
    if (body.name.trim().length > 100) {
      return c.json({ error: "Name must be 100 characters or less" }, 400);
    }
    updates.push("name = ?");
    params.push(body.name.trim());
  }
  if (body.content !== undefined) {
    if (typeof body.content !== "string" || !body.content.trim()) {
      return c.json({ error: "Content must be a non-empty string" }, 400);
    }
    if (body.content.trim().length > 10000) {
      return c.json({ error: "Content must be 10000 characters or less" }, 400);
    }
    updates.push("content = ?");
    params.push(body.content.trim());
  }
  if (updates.length === 0) return c.json({ error: "Nothing to update" }, 400);

  const updatedAt = typeof body.updated_at === "number" ? body.updated_at : Date.now();
  updates.push("updated_at = ?");
  params.push(updatedAt);
  params.push(id);
  await c.env.DB.prepare(`UPDATE system_prompts SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...params)
    .run();
  return c.json({ success: true });
});

app.delete("/api/system-prompts/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM system_prompts WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});

// Settings
const ALLOWED_SETTING_KEYS = ["system_prompt", "default_model"];

app.get("/api/settings/:key", async (c) => {
  const key = c.req.param("key");
  if (!ALLOWED_SETTING_KEYS.includes(key)) {
    return c.json({ error: "Invalid setting key" }, 400);
  }
  let value = await getSetting(c.env.DB, key);

  // Migration: If default_model is missing, try legacy "model" key
  if (key === "default_model" && value === null) {
    value = await getSetting(c.env.DB, "model");
  }

  return c.json({ value });
});

app.post("/api/settings/:key", async (c) => {
  const key = c.req.param("key");
  if (!ALLOWED_SETTING_KEYS.includes(key)) {
    return c.json({ error: "Invalid setting key" }, 400);
  }
  const { value } = await c.req.json<{ value: string }>();
  if (typeof value !== "string") return c.json({ error: "Invalid value" }, 400);
  await setSetting(c.env.DB, key, value);
  return c.json({ success: true });
});

// Title generation (used by local mode)
app.post("/api/title", async (c) => {
  const { message } = await c.req.json<{ message: string }>();
  const title = await generateTitle(c.env.AI, message);
  return c.json({ title });
});

app.post("/api/chat", async (c) => {
  const body = await c.req.json<ChatRequest>();
  const {
    conversation_id,
    model,
    messages,
    storage_mode,
    system_prompt,
    parent_id,
    user_parent_id,
    user_message_id,
    assistant_message_id,
  } = body;
  const isCloud = storage_mode !== "local";
  const now = Date.now();

  // Prepend system message if provided
  const messagesWithSystem = system_prompt
    ? [{ role: "system" as const, content: system_prompt }, ...messages]
    : messages;

  if (isCloud && user_message_id) {
    // Save user message to D1 (only for new messages or edits, not retries)
    const userMsg = messages[messages.length - 1];
    await saveMessage(c.env.DB, {
      id: user_message_id,
      conversation_id,
      role: "user",
      content: userMsg.content,
      created_at: now,
      parent_id: user_parent_id || undefined,
    });

    // Auto-generate title from first user message
    if (messages.length === 1) {
      generateTitle(c.env.AI, userMsg.content).then((title) =>
        updateConversationTitle(c.env.DB, conversation_id, title),
      );
    }
  }

  const sourceStream = await streamAiResponse(c.env.AI, model as any, messagesWithSystem);

  if (!isCloud) {
    return new Response(sourceStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }

  // Cloud Mode: Transform stream to capture fullContent and handle abort
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const reader = sourceStream.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let buffer = "";

  const processStream = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Try writing to client. If client aborted, this will throw.
        try {
          await writer.write(value);
        } catch (e) {
          // Client aborted the connection
          console.log("[/api/chat] Client disconnected");
          await reader.cancel();
          break;
        }

        // Process chunk for saving
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          if (trimmed === "data: [DONE]") continue;
          try {
            const json = JSON.parse(trimmed.slice(6));
            let token: string | undefined;
            if (typeof json.choices?.[0]?.delta?.content === "string") {
              token = json.choices[0].delta.content;
            } else if (typeof json.response === "string") {
              token = json.response;
            }
            if (token) fullContent += token;
          } catch {}
        }
      }
    } catch (e) {
      console.error("[/api/chat] stream error:", e);
    } finally {
      if (fullContent) {
        // Save whatever we got
        try {
          await saveMessage(c.env.DB, {
            id: assistant_message_id || crypto.randomUUID(),
            conversation_id,
            role: "assistant",
            content: fullContent,
            created_at: Date.now(),
            model,
            parent_id: user_message_id || parent_id || undefined,
          });
          await updateConversationTimestamp(c.env.DB, conversation_id);
        } catch (e) {
          console.error("[/api/chat] failed to save message:", e);
        }
      }
      reader.releaseLock();
      try {
        await writer.close();
      } catch {}
    }
  };

  c.executionCtx.waitUntil(processStream());

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
});

// saveAssistantMessage is no longer needed as saving is handled inline with streaming

export default app;
