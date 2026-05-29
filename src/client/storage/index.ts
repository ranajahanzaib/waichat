export interface Conversation {
  id: string;
  title: string;
  model: string;
  created_at: number;
  updated_at: number;
  import_complete?: number | null;
  is_temporary?: boolean;
  expires_at?: number;
  system_prompt_id?: string | null;
  system_prompt?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: number;
  model?: string;
  parent_id?: string;
  deleted_at?: number;
}

export interface DeleteMessageResult {
  deletedIds: string[];
  softDeletedIds: string[];
}

export interface StorageAdapter {
  getConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<{ conversation: Conversation; messages: Message[] } | null>;
  createConversation(model: string, systemPromptId?: string | null, systemPromptContent?: string | null): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;
  updateConversationModel(id: string, model: string): Promise<void>;
  saveMessage(message: Omit<Message, "id" | "created_at"> & { id?: string }): Promise<Message>;
  updateConversationTitle(id: string, title: string): Promise<void>;
  deleteMessage(conversationId: string, messageId: string): Promise<DeleteMessageResult>;
  exportConversation(
    id: string,
  ): Promise<{ conversation: Conversation; messages: Message[] } | null>;
  importConversation(conversation: Conversation, messages: Message[]): Promise<void>;
  clear?(): Promise<void>;
  cleanup?(expirySetting: string, isInitial: boolean): Promise<string[]>;
}

export type StorageMode = "cloud" | "local" | "temporary";

import { CloudStorage } from "./cloud";
import { LocalStorage } from "./local";

export function createStorage(mode: StorageMode): StorageAdapter {
  switch (mode) {
    case "cloud":
      return new CloudStorage();
    case "local":
      return new LocalStorage(false);
    case "temporary":
      return new LocalStorage(true);
    default:
      throw new Error(`Unknown storage mode: ${mode}`);
  }
}
