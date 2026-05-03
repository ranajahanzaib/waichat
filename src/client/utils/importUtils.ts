import { strFromU8, unzipSync } from "fflate";
import type { Conversation, Message } from "../storage";

const MAX_COMPRESSED_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_UNCOMPRESSED_SIZE = 100 * 1024 * 1024; // 100MB

export interface ImportResult {
  scope: "local" | "cloud" | "both" | "external";
  local?: { conversations: Conversation[]; messages: Message[] };
  cloud?: { conversations: Conversation[]; messages: Message[] };
  external?: { conversations: Conversation[]; messages: Message[] };
  settings?: Record<string, string>;
}

export async function parseImportFile(file: File): Promise<ImportResult> {
  // Check compressed file size
  if (file.size > MAX_COMPRESSED_SIZE) {
    throw new Error(`File is too large. Max size is ${MAX_COMPRESSED_SIZE / 1024 / 1024}MB.`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Unzip and check uncompressed size
  let unzipped;
  try {
    unzipped = unzipSync(uint8Array);
  } catch (e) {
    throw new Error("Failed to extract ZIP file. It may be corrupted.");
  }

  let totalSize = 0;
  for (const key in unzipped) {
    totalSize += unzipped[key].length;
  }

  if (totalSize > MAX_UNCOMPRESSED_SIZE) {
    throw new Error(
      `Uncompressed archive is too large. Max size is ${MAX_UNCOMPRESSED_SIZE / 1024 / 1024}MB.`,
    );
  }

  // Parse manifest
  let isWaiChat = false;
  let exportScope: "local" | "cloud" | "both" | "external" = "external";
  const keys = Object.keys(unzipped);
  const manifestKey = keys.find((k) => k.endsWith("manifest.json"));

  if (manifestKey) {
    try {
      const manifestStr = strFromU8(unzipped[manifestKey]);
      const manifest = JSON.parse(manifestStr);
      if (manifest.app === "WaiChat") {
        isWaiChat = true;
        if (["local", "cloud", "both"].includes(manifest.export_scope)) {
          exportScope = manifest.export_scope as "local" | "cloud" | "both";
        }
      }
    } catch (e) {
      // Manifest parsing failed, treat as ChatGPT Compatibility Mode
    }
  }

  const result: ImportResult = { scope: exportScope };

  // Data validation
  if (exportScope === "both") {
    const localKey = keys.find((k) => k.endsWith("local/conversations.json"));
    const cloudKey = keys.find((k) => k.endsWith("cloud/conversations.json"));

    if (localKey) {
      try {
        result.local = parseChatGPTFormat(JSON.parse(strFromU8(unzipped[localKey])));
      } catch (e) {
        throw new Error("Invalid archive: Failed to parse local/conversations.json.");
      }
    }
    if (cloudKey) {
      try {
        result.cloud = parseChatGPTFormat(JSON.parse(strFromU8(unzipped[cloudKey])));
      } catch (e) {
        throw new Error("Invalid archive: Failed to parse cloud/conversations.json.");
      }
    }

    if (!localKey && !cloudKey) {
      throw new Error(
        "Invalid archive: missing both local and cloud conversations in 'both' scope.",
      );
    }
  } else {
    // Single scope or external
    const convKey = keys.find(
      (k) => k.endsWith("conversations.json") && !k.includes("local/") && !k.includes("cloud/"),
    );
    if (!convKey) {
      throw new Error("Invalid archive: conversations.json not found.");
    }

    let chatGPTData;
    try {
      chatGPTData = JSON.parse(strFromU8(unzipped[convKey]));
    } catch (e) {
      throw new Error("Invalid archive: Failed to parse conversations.json.");
    }

    const parsed = parseChatGPTFormat(chatGPTData);
    if (exportScope === "local") {
      result.local = parsed;
    } else if (exportScope === "cloud") {
      result.cloud = parsed;
    } else {
      result.external = parsed;
    }
  }

  let settings: Record<string, string> | undefined;
  const settingsKey = keys.find((k) => k.endsWith("settings.json"));

  if (isWaiChat && settingsKey) {
    try {
      result.settings = JSON.parse(strFromU8(unzipped[settingsKey]));
    } catch (e) {
      console.error("Failed to parse settings.json", e);
    }
  }

  return result;
}

function parseChatGPTFormat(data: any[]): {
  conversations: Conversation[];
  messages: Message[];
} {
  const conversations: Conversation[] = [];
  const messages: Message[] = [];

  for (const conv of data) {
    const id = conv.id || conv.conversation_id || crypto.randomUUID();

    conversations.push({
      id,
      title: typeof conv.title === "string" ? conv.title : "Imported Conversation",
      model: "default",
      created_at: (conv.create_time || Date.now() / 1000) * 1000,
      updated_at: (conv.update_time || Date.now() / 1000) * 1000,
    });

    if (conv.mapping) {
      let lastModel = null;

      // We need to repair the parent_id chain for skipped nodes (e.g. system nodes or empty nodes)
      const skippedNodes = new Map<string, string | null>();

      // First pass: identify skipped nodes and their parents
      for (const key in conv.mapping) {
        const node = conv.mapping[key];
        const msgData = node.message;

        let skip = false;
        if (!msgData) {
          skip = true;
        } else {
          const role = msgData.author?.role;
          // WaiChat only supports user and assistant roles
          if (role !== "user" && role !== "assistant") {
            skip = true;
          }
        }

        if (skip) {
          skippedNodes.set(key, node.parent || null);
        }
      }

      // Helper to resolve the actual parent ID by bypassing skipped nodes
      const resolveParent = (parentId: string | null): string | undefined => {
        let current = parentId;
        while (current && skippedNodes.has(current)) {
          current = skippedNodes.get(current) || null;
        }
        return current || undefined;
      };

      for (const key in conv.mapping) {
        if (skippedNodes.has(key)) continue;

        const node = conv.mapping[key];
        const msgData = node.message;

        let content = "";
        if (msgData.content?.parts) {
          content = msgData.content.parts.filter((p: any) => typeof p === "string").join("\n");
        } else if (typeof msgData.content === "string") {
          content = msgData.content;
        }

        const model = msgData.metadata?.model || null;
        if (model) lastModel = model;

        messages.push({
          id: String(msgData.id || key),
          conversation_id: id,
          role: msgData.author.role as "user" | "assistant",
          content: content,
          created_at: (msgData.create_time || Date.now() / 1000) * 1000,
          model: model,
          parent_id: resolveParent(node.parent || null),
        });
      }

      if (lastModel) {
        conversations[conversations.length - 1].model = lastModel;
      }
    }
  }

  return { conversations, messages };
}
