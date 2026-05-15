import type { Conversation, DeleteMessageResult, Message, StorageAdapter } from "./index";

const CONVERSATIONS_KEY = "waichat:conversations";
const MESSAGES_KEY = (id: string) => `waichat:messages:${id}`;
const TEMP_EXPIRY_KEY = "waichat:temp-expiry";

export class LocalStorage implements StorageAdapter {
  constructor(private isTemporary: boolean = false) {}

  private getConversationsRaw(): Conversation[] {
    try {
      return JSON.parse(localStorage.getItem(CONVERSATIONS_KEY) ?? "[]");
    } catch {
      return [];
    }
  }

  private setConversations(conversations: Conversation[]): void {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  }

  private getMessagesRaw(conversationId: string): Message[] {
    try {
      return JSON.parse(localStorage.getItem(MESSAGES_KEY(conversationId)) ?? "[]");
    } catch {
      return [];
    }
  }

  private setMessages(conversationId: string, messages: Message[]): void {
    localStorage.setItem(MESSAGES_KEY(conversationId), JSON.stringify(messages));
  }

  async getConversations(): Promise<Conversation[]> {
    return this.getConversationsRaw()
      .filter((c) => (this.isTemporary ? !!c.is_temporary : !c.is_temporary))
      .sort((a, b) => b.updated_at - a.updated_at);
  }

  async getConversation(
    id: string,
  ): Promise<{ conversation: Conversation; messages: Message[] } | null> {
    const conversation = this.getConversationsRaw().find((c) => c.id === id);
    if (!conversation) return null;
    const messages = this.getMessagesRaw(id);
    return { conversation, messages };
  }

  async createConversation(model: string): Promise<Conversation> {
    const now = Date.now();
    const expirySetting = localStorage.getItem(TEMP_EXPIRY_KEY) || "1h";
    let expires_at: number | undefined;

    if (this.isTemporary) {
      if (expirySetting === "24h") {
        expires_at = now + 24 * 60 * 60 * 1000;
      } else if (expirySetting === "6h") {
        expires_at = now + 6 * 60 * 60 * 1000;
      } else if (expirySetting === "instant") {
        expires_at = now;
      } else {
        // Default to 1h
        expires_at = now + 60 * 60 * 1000;
      }
    }

    const conversation: Conversation = {
      id: crypto.randomUUID(),
      title: "New Chat",
      model,
      created_at: now,
      updated_at: now,
      is_temporary: this.isTemporary,
      expires_at,
    };
    const conversations = this.getConversationsRaw();
    conversations.push(conversation);
    this.setConversations(conversations);
    return conversation;
  }

  async clear(): Promise<void> {
    const conversations = this.getConversationsRaw();
    const toDelete = conversations.filter((c) => c.is_temporary);
    const toKeep = conversations.filter((c) => !c.is_temporary);

    for (const conv of toDelete) {
      localStorage.removeItem(MESSAGES_KEY(conv.id));
      localStorage.removeItem(`waichat:versions:${conv.id}`);
    }

    this.setConversations(toKeep);
  }

  async deleteConversation(id: string): Promise<void> {
    const conversations = this.getConversationsRaw().filter((c) => c.id !== id);
    this.setConversations(conversations);
    localStorage.removeItem(MESSAGES_KEY(id));
  }

  async updateConversationModel(id: string, model: string): Promise<void> {
    const conversations = this.getConversationsRaw().map((c) =>
      c.id === id ? { ...c, model, updated_at: Date.now() } : c,
    );
    this.setConversations(conversations);
  }

  async saveMessage(msg: Omit<Message, "id" | "created_at"> & { id?: string }): Promise<Message> {
    const message: Message = {
      ...msg,
      id: msg.id || crypto.randomUUID(),
      created_at: Date.now(),
    };
    let messages = this.getMessagesRaw(msg.conversation_id);
    const existingIndex = message.id ? messages.findIndex((m) => m.id === message.id) : -1;
    if (existingIndex >= 0) {
      messages[existingIndex] = message;
    } else {
      messages.push(message);
    }
    this.setMessages(msg.conversation_id, messages);

    // Update conversation timestamp
    const conversations = this.getConversationsRaw().map((c) =>
      c.id === msg.conversation_id ? { ...c, updated_at: Date.now() } : c,
    );
    this.setConversations(conversations);
    return message;
  }

  async updateConversationTitle(id: string, title: string): Promise<void> {
    const conversations = this.getConversationsRaw().map((c) =>
      c.id === id ? { ...c, title } : c,
    );
    this.setConversations(conversations);
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<DeleteMessageResult> {
    let messages = this.getMessagesRaw(conversationId);
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return { deletedIds: [], softDeletedIds: [] };

    const childrenMap = new Map<string | null, string[]>();
    for (const m of messages) {
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

    // Apply soft-deletes
    messages = messages.map((m) =>
      softDeletedIds.includes(m.id) ? { ...m, content: "", deleted_at: Date.now() } : m,
    );

    this.setMessages(conversationId, messages);

    // Update conversation timestamp
    const conversations = this.getConversationsRaw().map((c) =>
      c.id === conversationId ? { ...c, updated_at: Date.now() } : c,
    );
    this.setConversations(conversations);

    return { deletedIds: [], softDeletedIds };
  }

  async exportConversation(
    id: string,
  ): Promise<{ conversation: Conversation; messages: Message[] } | null> {
    return this.getConversation(id);
  }

  async importConversation(conversation: Conversation, messages: Message[]): Promise<void> {
    // Filter out any existing entry with the same ID to prevent duplicates on retry
    const existing = this.getConversationsRaw().filter((c) => c.id !== conversation.id);
    existing.push({
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
    });
    this.setConversations(existing);
    this.setMessages(conversation.id, messages);
  }
}
