export interface Env {
  AI: Ai;
  DB: D1Database;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  SECRET_KEY?: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  created_at: number;
  updated_at: number;
  import_complete?: number | null;
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

export interface Model {
  id: string;
  name: string;
}

export interface ChatRequest {
  conversation_id: string;
  model: string;
  messages: { role: "user" | "assistant"; content: string }[];
  storage_mode: "cloud" | "local";
  system_prompt?: string;
  parent_id?: string;
  user_parent_id?: string;
  user_message_id?: string;
  assistant_message_id?: string;
}
