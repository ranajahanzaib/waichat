import type { StorageAdapter, Conversation, Message, DeleteMessageResult } from "./index";

export class CloudStorage implements StorageAdapter {
  async getConversations(): Promise<Conversation[]> {
    const res = await fetch("/api/conversations");
    if (!res.ok) throw new Error("Failed to fetch conversations");
    return res.json();
  }

  async getConversation(
    id: string,
  ): Promise<{ conversation: Conversation; messages: Message[] } | null> {
    const res = await fetch(`/api/conversations/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Failed to fetch conversation");
    return res.json();
  }

  async createConversation(model: string): Promise<Conversation> {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (!res.ok) throw new Error("Failed to create conversation");
    return res.json();
  }

  async deleteConversation(id: string): Promise<void> {
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete conversation");
  }

  async saveMessage(msg: Omit<Message, "id" | "created_at"> & { id?: string }): Promise<Message> {
    // Messages are saved server-side during /api/chat — nothing to do here
    return {
      ...msg,
      id: msg.id || crypto.randomUUID(),
      created_at: Date.now(),
    };
  }

  async updateConversationTitle(id: string, title: string): Promise<void> {
    // Title is updated server-side after first message — nothing to do here
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<DeleteMessageResult> {
    const res = await fetch(`/api/conversations/${conversationId}/messages/${messageId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete message");
    const data = (await res.json()) as { deletedIds: string[]; softDeletedIds: string[] };
    return { deletedIds: data.deletedIds, softDeletedIds: data.softDeletedIds };
  }

  async exportConversation(
    id: string,
  ): Promise<{ conversation: Conversation; messages: Message[] } | null> {
    return this.getConversation(id);
  }

  async importConversation(conversation: Conversation, messages: Message[]): Promise<void> {
    const res = await fetch("/api/conversations/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation, messages }),
    });
    if (!res.ok) {
      const errorData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errorData.error || "Import failed");
    }
  }
}
