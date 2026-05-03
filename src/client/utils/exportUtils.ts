import { strToU8, zipSync } from "fflate";
import type { Conversation, Message } from "../storage";

export function convertToChatGPTFormat(conversations: Conversation[], messages: Message[]) {
  const result = [];

  // Group messages by conversation
  const messagesByConv = new Map<string, Message[]>();
  for (const m of messages) {
    if (!messagesByConv.has(m.conversation_id)) {
      messagesByConv.set(m.conversation_id, []);
    }
    messagesByConv.get(m.conversation_id)!.push(m);
  }

  for (const conv of conversations) {
    const convMessages = messagesByConv.get(conv.id) || [];

    // Build mapping
    const mapping: Record<string, any> = {};
    const childrenMap = new Map<string | null, string[]>();

    // First pass to build children relationships
    for (const msg of convMessages) {
      const parentId = msg.parent_id || null;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(msg.id);
    }

    // Find leaves
    let current_node = null;
    let latestTime = 0;

    for (const msg of convMessages) {
      const children = childrenMap.get(msg.id) || [];
      mapping[msg.id] = {
        id: msg.id,
        message: {
          id: msg.id,
          author: { role: msg.role },
          create_time: msg.created_at / 1000,
          content: {
            content_type: "text",
            parts: [msg.content],
          },
          metadata: {
            model: msg.model || conv.model,
          },
        },
        parent: msg.parent_id || null,
        children,
      };

      if (children.length === 0) {
        if (msg.created_at > latestTime) {
          latestTime = msg.created_at;
          current_node = msg.id;
        }
      }
    }

    // Add root nodes (messages without parent)
    const rootNodes = convMessages.filter((m) => !m.parent_id).map((m) => m.id);

    // ChatGPT uses a system root node that connects everything, we can synthesize one
    // if there isn't a clear root. If we don't synthesize, we need to ensure root nodes
    // have parent: null, which is already done above.

    result.push({
      id: conv.id,
      title: conv.title,
      create_time: conv.created_at / 1000,
      update_time: conv.updated_at / 1000,
      mapping,
      current_node,
    });
  }

  return result;
}

export async function exportWorkspace(
  scope: "local" | "cloud" | "both",
  data: {
    local?: { conversations: Conversation[]; messages: Message[] };
    cloud?: { conversations: Conversation[]; messages: Message[] };
    settings: Record<string, string>;
  },
) {
  const manifest = {
    version: "1.0",
    export_date: new Date().toISOString(),
    app: "WaiChat",
    schema_version: 1,
    export_scope: scope,
  };

  const zipData: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
    "settings.json": strToU8(JSON.stringify(data.settings, null, 2)),
    "custom_prompts.json": strToU8(JSON.stringify([], null, 2)),
    "model_configs.json": strToU8(JSON.stringify([], null, 2)),
    "attachments/.placeholder": strToU8(""),
  };

  if (scope === "both") {
    if (data.local) {
      const localFormat = convertToChatGPTFormat(data.local.conversations, data.local.messages);
      zipData["local/conversations.json"] = strToU8(JSON.stringify(localFormat, null, 2));
    }
    if (data.cloud) {
      const cloudFormat = convertToChatGPTFormat(data.cloud.conversations, data.cloud.messages);
      zipData["cloud/conversations.json"] = strToU8(JSON.stringify(cloudFormat, null, 2));
    }
  } else {
    const targetData = scope === "local" ? data.local : data.cloud;
    if (targetData) {
      const flatFormat = convertToChatGPTFormat(targetData.conversations, targetData.messages);
      zipData["conversations.json"] = strToU8(JSON.stringify(flatFormat, null, 2));
    }
  }

  const zipped = zipSync(zipData);

  const blob = new Blob([zipped as any], { type: "application/zip" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.download = `waichat_export_${timestamp}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
