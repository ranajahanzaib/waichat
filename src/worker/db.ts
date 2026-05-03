import type { Conversation, Message } from "./types";

export async function getConversations(db: D1Database): Promise<Conversation[]> {
  const { results } = await db
    .prepare("SELECT * FROM conversations ORDER BY updated_at DESC")
    .all<Conversation>();
  return results;
}

export async function getConversation(db: D1Database, id: string): Promise<Conversation | null> {
  return db.prepare("SELECT * FROM conversations WHERE id = ?").bind(id).first<Conversation>();
}

export async function createConversation(
  db: D1Database,
  conversation: Conversation,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO conversations (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(
      conversation.id,
      conversation.title,
      conversation.model,
      conversation.created_at,
      conversation.updated_at,
    )
    .run();
}

export async function updateConversationTitle(
  db: D1Database,
  id: string,
  title: string,
): Promise<void> {
  await db
    .prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?")
    .bind(title, Date.now(), id)
    .run();
}

export async function updateConversationModel(
  db: D1Database,
  id: string,
  model: string,
): Promise<void> {
  await db
    .prepare("UPDATE conversations SET model = ?, updated_at = ? WHERE id = ?")
    .bind(model, Date.now(), id)
    .run();
}

export async function updateConversationTimestamp(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
    .bind(Date.now(), id)
    .run();
}

export async function deleteConversation(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM conversations WHERE id = ?").bind(id).run();
}

export async function getMessages(db: D1Database, conversationId: string): Promise<Message[]> {
  const { results } = await db
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .bind(conversationId)
    .all<Message>();
  return results;
}

export async function saveMessage(db: D1Database, message: Message): Promise<void> {
  await db
    .prepare(
      "INSERT INTO messages (id, conversation_id, role, content, created_at, model, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      message.id,
      message.conversation_id,
      message.role,
      message.content,
      message.created_at,
      message.model || null,
      message.parent_id || null,
    )
    .run();
}

export async function getMessageById(db: D1Database, id: string): Promise<Message | null> {
  return db.prepare("SELECT * FROM messages WHERE id = ?").bind(id).first<Message>();
}

export async function getSiblingCount(db: D1Database, parentId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as count FROM messages WHERE parent_id = ?")
    .bind(parentId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function deleteMessageById(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM messages WHERE id = ?").bind(id).run();
}

export async function softDeleteMessage(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE messages SET content = '', deleted_at = ? WHERE id = ?")
    .bind(Date.now(), id)
    .run();
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(key, value, Date.now())
    .run();
}

export async function markImportComplete(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE conversations SET import_complete = 1 WHERE id = ?").bind(id).run();
}

/**
 * Bulk-import a conversation and its messages into D1.
 * Uses chunked db.batch() calls (max 99 statements per batch).
 * Idempotent: if the conversation already exists with import_complete=1, returns early.
 * If it exists without import_complete, deletes the partial and re-imports.
 */
export async function importConversation(
  db: D1Database,
  conversation: Conversation,
  messages: Message[],
): Promise<void> {
  // Removed idempotency check that prevented overwriting.
  // Using INSERT OR REPLACE below handles upserts safely.

  const BATCH_SIZE = 99;

  // Build all message INSERT statements
  const msgStatements = messages.map((m) =>
    db
      .prepare(
        "INSERT OR REPLACE INTO messages (id, conversation_id, role, content, created_at, model, parent_id, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        m.id,
        m.conversation_id,
        m.role,
        m.content,
        m.created_at,
        m.model || null,
        m.parent_id || null,
        m.deleted_at || null,
      ),
  );

  // First batch: conversation INSERT + first chunk of messages
  const convInsert = db
    .prepare(
      "INSERT OR REPLACE INTO conversations (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(
      conversation.id,
      conversation.title,
      conversation.model,
      conversation.created_at,
      conversation.updated_at,
    );

  const firstChunk = msgStatements.slice(0, BATCH_SIZE);
  await db.batch([convInsert, ...firstChunk]);

  // Remaining batches
  try {
    for (let i = BATCH_SIZE; i < msgStatements.length; i += BATCH_SIZE) {
      const chunk = msgStatements.slice(i, i + BATCH_SIZE);
      await db.batch(chunk);
    }
  } catch (e) {
    // Rollback: delete conversation (cascades to messages via FK)
    try {
      await deleteConversation(db, conversation.id);
    } catch {
      // Rollback failed - next retry will hit the idempotency check
      // and clean up the partial via the import_complete=null path
    }
    throw e;
  }

  // Mark import as complete
  await markImportComplete(db, conversation.id);
}
