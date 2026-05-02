import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Conversation, Message, StorageMode } from "../storage";
import { createStorage } from "../storage";

interface UseChatReturn {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  isStreaming: boolean;
  error: string | null;
  activeVersions: Record<string, string>;
  loadConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  newConversation: (model: string) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  clearConversation: () => void;
  sendMessage: (
    content: string,
    model: string,
    conversationId: string,
    storageMode: StorageMode,
    systemPrompt?: string,
  ) => Promise<void>;
  stopGeneration: () => void;
  retryMessage: (
    messageId: string,
    model: string,
    storageMode: StorageMode,
    systemPrompt?: string,
  ) => Promise<void>;
  setActiveVersion: (parentId: string, messageId: string) => void;
  deleteMessage: (messageId: string) => Promise<void>;
}

export function useChat(
  storageMode: StorageMode,
  pendingSelectionRef?: React.RefObject<string | null>,
): UseChatReturn {
  const storage = useMemo(() => createStorage(storageMode), [storageMode]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeVersions, setActiveVersions] = useState<Record<string, string>>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setActiveConversation(null);
    setMessages([]);
    setError(null);
    setIsStreaming(false);
    setActiveVersions({});
  }, [storageMode]);

  // After mode change: auto-select a conversation if pendingSelectionRef is set
  const selectAfterModeChangeRef = useRef(false);
  useEffect(() => {
    selectAfterModeChangeRef.current = true;
  }, [storageMode]);

  useEffect(() => {
    if (
      selectAfterModeChangeRef.current &&
      pendingSelectionRef?.current
    ) {
      const id = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      selectAfterModeChangeRef.current = false;
      // Select the specific conversation (conversation list is loaded by App.tsx)
      storage.getConversation(id).then((result) => {
        if (result) {
          setActiveConversation(result.conversation);
          setMessages(result.messages);
        }
      });
    }
  }, [storage, storageMode, pendingSelectionRef]);

  const loadConversations = useCallback(async () => {
    try {
      const data = await storage.getConversations();
      setConversations(data);
    } catch {
      setError("Failed to load conversations");
    }
  }, [storage]);

  const selectConversation = useCallback(
    async (id: string) => {
      try {
        const data = await storage.getConversation(id);
        if (!data) return;
        setActiveConversation(data.conversation);
        setMessages(data.messages);
        setActiveVersions({});
      } catch {
        setError("Failed to load conversation");
      }
    },
    [storage],
  );

  const newConversation = useCallback(
    async (model: string): Promise<Conversation> => {
      const conversation = await storage.createConversation(model);
      setConversations((prev) => [conversation, ...prev]);
      setActiveConversation(conversation);
      setMessages([]);
      setActiveVersions({});
      return conversation;
    },
    [storage],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      await storage.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversation?.id === id) {
        setActiveConversation(null);
        setMessages([]);
        setActiveVersions({});
      }
    },
    [storage, activeConversation],
  );

  const clearConversation = useCallback(() => {
    setActiveConversation(null);
    setMessages([]);
    setError(null);
    setActiveVersions({});
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const setActiveVersionCb = useCallback((parentId: string, messageId: string) => {
    setActiveVersions((prev) => ({ ...prev, [parentId]: messageId }));
  }, []);

  /**
   * Build the message history for the AI, using the active version of each assistant turn.
   * Messages that are retry siblings (have parent_id) are excluded unless they are the active version.
   */
  const buildContextMessages = useCallback(
    (allMessages: Message[], upToIndex: number, currentActiveVersions: Record<string, string>) => {
      // Collect all sibling groups
      const siblingGroups = new Map<string, Message[]>();
      for (const m of allMessages) {
        if (m.parent_id) {
          const group = siblingGroups.get(m.parent_id) || [];
          group.push(m);
          siblingGroups.set(m.parent_id, group);
        }
      }

      const result: { role: string; content: string }[] = [];

      for (let i = 0; i <= upToIndex; i++) {
        const m = allMessages[i];

        if (m.role === "user") {
          result.push({ role: m.role, content: m.content });
          continue;
        }

        // Assistant message
        // Skip retry siblings in the main loop; they are handled via their parent
        if (m.parent_id) {
          continue;
        }

        // Original assistant message (no parent_id)
        const siblings = siblingGroups.get(m.id);
        if (siblings && siblings.length > 0) {
          // This message has retries. Check if one of the retries is the active version.
          const activeId = currentActiveVersions[m.id];
          if (activeId && activeId !== m.id) {
            // A retry is active, the retry itself will be included when we encounter it
            // But since retries come after in the array and we process in order,
            // we need to include the active one here
            const activeMsg = siblings.find((s) => s.id === activeId);
            if (activeMsg) {
              result.push({ role: activeMsg.role, content: activeMsg.content });
            } else {
              // Fallback to original
              result.push({ role: m.role, content: m.content });
            }
          } else {
            // Original is active (or no explicit selection - default to latest)
            if (!activeId) {
              // Default: use the latest sibling
              const latest = siblings[siblings.length - 1];
              result.push({ role: latest.role, content: latest.content });
            } else {
              // activeId === m.id, so original is explicitly selected
              result.push({ role: m.role, content: m.content });
            }
          }
        } else {
          // No retries, just include it
          result.push({ role: m.role, content: m.content });
        }
      }

      return result;
    },
    [],
  );

  /**
   * Stream a response from the API, updating the placeholder message as tokens arrive.
   * Shared between sendMessage and retryMessage.
   */
  const streamResponse = useCallback(
    async (
      allMessages: { role: string; content: string }[],
      assistantMessageId: string,
      conversationId: string,
      model: string,
      currentStorageMode: StorageMode,
      systemPrompt?: string,
      parentId?: string,
      userMessageId?: string,
    ) => {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          conversation_id: conversationId,
          model,
          messages: allMessages,
          storage_mode: currentStorageMode,
          system_prompt: systemPrompt || undefined,
          parent_id: parentId || undefined,
          user_message_id: userMessageId || undefined,
          assistant_message_id: assistantMessageId || undefined,
        }),
      });

      if (!res.ok || !res.body) {
        console.error("[streamResponse] bad response", res.status);
        throw new Error("Chat request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            if (trimmed === "data: [DONE]") continue;
            try {
              const json = JSON.parse(trimmed.slice(6));
              let token: string | undefined;
              if (typeof json.choices?.[0]?.delta?.content === "string") {
                token = json.choices[0].delta.content;
              } else if (typeof json.response === "string") {
                token = json.response;
              }
              if (token) {
                fullContent += token;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId ? { ...m, content: fullContent } : m,
                  ),
                );
              }
            } catch {}
          }
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          console.log("[streamResponse] stream aborted");
        } else {
          throw e;
        }
      }

      return fullContent;
    },
    [],
  );

  const sendMessage = useCallback(
    async (
      content: string,
      model: string,
      conversationId: string,
      storageMode: StorageMode,
      systemPrompt?: string,
    ) => {
      if (isStreaming) return;
      setError(null);

      const userMessage: Message = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "user",
        content,
        created_at: Date.now(),
      };

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "assistant",
        content: "",
        created_at: Date.now(),
        model,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      try {
        const allMessages = [...messages, userMessage].map(({ role, content }) => ({
          role,
          content,
        }));

        // For context, we need to use buildContextMessages to respect active versions
        // But for sendMessage the simple approach works since we're appending
        const contextMessages = [
          ...buildContextMessages(messages, messages.length - 1, activeVersions),
          { role: userMessage.role, content: userMessage.content },
        ];

        const fullContent = await streamResponse(
          contextMessages,
          assistantMessage.id,
          conversationId,
          model,
          storageMode,
          systemPrompt,
          undefined,
          userMessage.id,
        );

        // Save whatever we got (full or partial)
        await storage.saveMessage({ id: userMessage.id, conversation_id: conversationId, role: "user", content });
        await storage.saveMessage({
          id: assistantMessage.id,
          conversation_id: conversationId,
          role: "assistant",
          content: fullContent,
          model,
        });

        if (messages.length === 0 && storageMode === "local" && fullContent) {
          try {
            const res = await fetch("/api/title", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: content }),
            });
            const data = (await res.json()) as { title: string };
            const title = data.title ?? content.split(" ").slice(0, 5).join(" ");
            await storage.updateConversationTitle(conversationId, title);
            setConversations((prev) =>
              prev.map((c) => (c.id === conversationId ? { ...c, title } : c)),
            );
          } catch {
            const title = content.split(" ").slice(0, 5).join(" ");
            await storage.updateConversationTitle(conversationId, title);
            setConversations((prev) =>
              prev.map((c) => (c.id === conversationId ? { ...c, title } : c)),
            );
          }
        }

        if (messages.length === 0 && storageMode === "cloud") {
          setTimeout(async () => {
            try {
              const res = await fetch(`/api/conversations/${conversationId}`);
              if (res.ok) {
                const data = (await res.json()) as { conversation: Conversation };
                setConversations((prev) =>
                  prev.map((c) => (c.id === conversationId ? data.conversation : c)),
                );
              }
            } catch {}
          }, 3000);
        }
      } catch (e) {
        console.error("[sendMessage] error:", e);
        setError("Failed to send message");
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id));
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [isStreaming, messages, storage, activeVersions, buildContextMessages, streamResponse],
  );

  const retryMessage = useCallback(
    async (messageId: string, model: string, storageMode: StorageMode, systemPrompt?: string) => {
      if (isStreaming) return;
      setError(null);

      // Find the target assistant message
      const targetMsg = messages.find((m) => m.id === messageId);
      if (!targetMsg || targetMsg.role !== "assistant") return;

      const conversationId = targetMsg.conversation_id;

      // Determine the parent_id for the new sibling
      const parentId = targetMsg.parent_id || targetMsg.id;

      // Find the user message that precedes this assistant turn.
      // We need to find the index of the original (parent) message to locate its preceding user msg.
      const originalId = targetMsg.parent_id || targetMsg.id;
      const originalIndex = messages.findIndex((m) => m.id === originalId);
      if (originalIndex < 0) return;

      // The user message is the one right before the original assistant message
      let userMsgIndex = originalIndex - 1;
      while (userMsgIndex >= 0 && messages[userMsgIndex].role !== "user") {
        userMsgIndex--;
      }
      if (userMsgIndex < 0) return;

      // Build context: everything up to and including the user message
      const contextMessages = buildContextMessages(messages, userMsgIndex, activeVersions);

      // Create new placeholder assistant message
      const newAssistantMessage: Message = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "assistant",
        content: "",
        created_at: Date.now(),
        model,
        parent_id: parentId,
      };

      // Append the new sibling to messages (don't remove old ones)
      setMessages((prev) => [...prev, newAssistantMessage]);
      // Set it as the active version
      setActiveVersions((prev) => ({ ...prev, [parentId]: newAssistantMessage.id }));
      setIsStreaming(true);

      try {
        const fullContent = await streamResponse(
          contextMessages,
          newAssistantMessage.id,
          conversationId,
          model,
          storageMode,
          systemPrompt,
          parentId,
          undefined,
        );

        // Save the new retry version (local mode only - cloud saves server-side)
        if (storageMode === "local") {
          await storage.saveMessage({
            id: newAssistantMessage.id,
            conversation_id: conversationId,
            role: "assistant",
            content: fullContent,
            model,
            parent_id: parentId,
          });
        }
      } catch (e) {
        console.error("[retryMessage] error:", e);
        setError("Failed to retry message");
        // Remove the failed placeholder
        setMessages((prev) => prev.filter((m) => m.id !== newAssistantMessage.id));
        // Revert active version to the one the user was viewing
        setActiveVersions((prev) => ({ ...prev, [parentId]: messageId }));
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [isStreaming, messages, storage, activeVersions, buildContextMessages, streamResponse],
  );

  const deleteMessageCb = useCallback(
    async (messageId: string) => {
      if (!activeConversation) return;
      try {
        const result = await storage.deleteMessage(activeConversation.id, messageId);
        const { deletedIds, softDeletedIds } = result;

        setMessages((prev) => {
          let updated = prev.filter((m) => !deletedIds.includes(m.id));
          updated = updated.map((m) =>
            softDeletedIds.includes(m.id) ? { ...m, content: "", deleted_at: Date.now() } : m,
          );
          return updated;
        });

        // Clean up activeVersions for deleted messages
        setActiveVersions((prev) => {
          const next = { ...prev };
          for (const id of deletedIds) {
            // If a deleted message was the active version, remove the entry
            // so the UI defaults to the latest remaining sibling
            for (const [parentId, activeId] of Object.entries(next)) {
              if (activeId === id || parentId === id) {
                delete next[parentId];
              }
            }
          }
          return next;
        });
      } catch (e) {
        console.error("[deleteMessage] error:", e);
        setError("Failed to delete message");
      }
    },
    [activeConversation, storage],
  );

  return {
    conversations,
    activeConversation,
    messages,
    isStreaming,
    error,
    activeVersions,
    loadConversations,
    selectConversation,
    newConversation,
    deleteConversation,
    clearConversation,
    sendMessage,
    stopGeneration,
    retryMessage,
    setActiveVersion: setActiveVersionCb,
    deleteMessage: deleteMessageCb,
  };
}
