import type { Conversation, DeleteMessageResult, Message, StorageAdapter } from "./index";

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

  async createConversation(model: string, systemPromptId?: string | null, systemPromptContent?: string | null): Promise<Conversation> {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, system_prompt_id: systemPromptId ?? null, system_prompt: systemPromptContent ?? null }),
    });
    if (!res.ok) throw new Error("Failed to create conversation");
    return res.json();
  }

  async deleteConversation(id: string): Promise<void> {
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete conversation");
  }

  async updateConversationModel(id: string, model: string): Promise<void> {
    const res = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (!res.ok) throw new Error("Failed to update conversation model");
  }

  async saveMessage(msg: Omit<Message, "id" | "created_at"> & { id?: string }): Promise<Message> {
    const res = await fetch(`/api/conversations/${msg.conversation_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    });
    if (!res.ok) throw new Error("Failed to save message");
    return res.json();
  }

  async updateConversationTitle(id: string, title: string): Promise<void> {
    const res = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error("Failed to update conversation title");
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
  async clear(): Promise<void> {
    const res = await fetch("/api/conversations", { method: "DELETE" });
    if (!res.ok) {
      throw new Error("Failed to clear cloud conversations");
    }
  }
}
