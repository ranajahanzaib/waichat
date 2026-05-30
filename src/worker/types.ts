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

export interface Model {
  id: string;
  name: string;
  notice?: string;
}

export interface SystemPrompt {
  id: string;
  user_id: string;
  name: string;
  content: string;
  created_at: number;
  updated_at?: number | null;
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
