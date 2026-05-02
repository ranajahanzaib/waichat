import type { Conversation, DeleteMessageResult, Message, StorageAdapter } from "./index";

const CONVERSATIONS_KEY = "waichat:conversations";
const MESSAGES_KEY = (id: string) => `waichat:messages:${id}`;

export class LocalStorage implements StorageAdapter {
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
    return this.getConversationsRaw().sort((a, b) => b.updated_at - a.updated_at);
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
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      title: "New Conversation",
      model,
      created_at: now,
      updated_at: now,
    };
    const conversations = this.getConversationsRaw();
    conversations.push(conversation);
    this.setConversations(conversations);
    return conversation;
  }

  async deleteConversation(id: string): Promise<void> {
    const conversations = this.getConversationsRaw().filter((c) => c.id !== id);
    this.setConversations(conversations);
    localStorage.removeItem(MESSAGES_KEY(id));
  }

  async saveMessage(msg: Omit<Message, "id" | "created_at"> & { id?: string }): Promise<Message> {
    const message: Message = {
      ...msg,
      id: msg.id || crypto.randomUUID(),
      created_at: Date.now(),
    };
    const messages = this.getMessagesRaw(msg.conversation_id);
    messages.push(message);
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

    const deletedIds: string[] = [];
    const softDeletedIds: string[] = [];

    if (msg.role === "user") {
      // Cascade: also delete the assistant turn below
      const userIdx = messages.findIndex((m) => m.id === messageId);
      for (let i = userIdx + 1; i < messages.length; i++) {
        const m = messages[i];
        if (m.role === "user") break;
        if (m.role === "assistant" && !m.parent_id) {
          // Delete all retry siblings
          const siblings = messages.filter((s) => s.parent_id === m.id);
          for (const s of siblings) deletedIds.push(s.id);
          deletedIds.push(m.id);
          break;
        }
      }
      deletedIds.push(messageId);
    } else {
      // Assistant message
      if (msg.parent_id) {
        // Retry sibling - hard-delete
        deletedIds.push(messageId);

        // Check if parent is now orphaned
        const remainingSiblings = messages.filter(
          (m) => m.parent_id === msg.parent_id && m.id !== messageId,
        );
        if (remainingSiblings.length === 0) {
          const parent = messages.find((m) => m.id === msg.parent_id);
          if (parent && parent.deleted_at) {
            deletedIds.push(parent.id);
          }
        }
      } else {
        // Parent assistant message
        const siblingCount = messages.filter((m) => m.parent_id === msg.id).length;
        if (siblingCount > 0) {
          // Soft-delete
          softDeletedIds.push(msg.id);
        } else {
          // Solo — hard-delete
          deletedIds.push(msg.id);
        }
      }
    }

    // Apply deletions
    messages = messages.filter((m) => !deletedIds.includes(m.id));

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

    return { deletedIds, softDeletedIds };
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
