import { Hono } from "hono";
import { cors } from "hono/cors";
import { AVAILABLE_MODELS, generateTitle, streamAiResponse } from "./ai";
import {
  createConversation,
  deleteConversation,
  getConversation,
  getConversations,
  getMessages,
  getSetting,
  importConversation,
  saveMessage,
  setSetting,
  updateConversationTimestamp,
  updateConversationTitle,
} from "./db";
import type { ChatRequest, Env } from "./types";

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

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());

// Models — fetched live from Cloudflare API if account ID is set, otherwise hardcoded fallback
app.get("/api/models", async (c) => {
  if (!c.env.CLOUDFLARE_ACCOUNT_ID) {
    return c.json(AVAILABLE_MODELS);
  }
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${c.env.CLOUDFLARE_ACCOUNT_ID}/ai/models/search?task=Text+Generation&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${c.env.CLOUDFLARE_API_TOKEN}`,
        },
      },
    );

    if (!res.ok) throw new Error(`Cloudflare API error: ${res.status}`);

    const data = (await res.json()) as {
      result: {
        id: string;
        name: string;
        description: string;
        task: { name: string };
      }[];
      success: boolean;
    };

    const models = data.result
      .map((m) => ({ id: m.name, name: formatModelName(m.name) }))
      .sort((a, b) => scoreModel(b.id) - scoreModel(a.id));

    return c.json(models);
  } catch (e) {
    console.error("[/api/models] error:", e);
    // Fallback to hardcoded list if API call fails
    return c.json(AVAILABLE_MODELS);
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
  const body = await c.req.json<{ model: string }>();
  const now = Date.now();
  const conversation = {
    id: crypto.randomUUID(),
    title: "New Conversation",
    model: body.model,
    created_at: now,
    updated_at: now,
  };
  await createConversation(c.env.DB, conversation);
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
  }
  if (body.title) {
    updates.push("title = ?");
    params.push(body.title);
  }

  if (updates.length > 0) {
    updates.push("updated_at = ?");
    params.push(Date.now());
    params.push(id);
    await db
      .prepare(`UPDATE conversations SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...params)
      .run();
  }

  return c.json({ success: true });
});

// Delete a single message (with recursive soft-delete logic for its sub-tree)
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
