import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Conversation, Message, StorageMode } from "../storage";
import { createStorage } from "../storage";
import { useToast } from "./useToast";

interface UseChatReturn {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  activeBranch: Message[];
  isStreaming: boolean;
  activeVersions: Record<string, string>;
  loadConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  newConversation: (model: string) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  updateActiveModel: (model: string) => Promise<void>;
  clearConversation: () => void;
  sendMessage: (
    content: string,
    model: string,
    conversationId: string,
    storageMode: StorageMode,
    systemPrompt?: string,
  ) => Promise<void>;
  editMessage: (
    conversationId: string,
    model: string,
    content: string,
    targetMessageId: string,
    storageMode: "local" | "cloud",
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
  renameConversation: (id: string, title: string) => Promise<void>;
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
  const toast = useToast();
  const [activeVersions, setActiveVersions] = useState<Record<string, string>>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setActiveConversation(null);
    setMessages([]);
    setIsStreaming(false);
    setActiveVersions({});
  }, [storageMode]);

  // After mode change: auto-select a conversation if pendingSelectionRef is set
  const selectAfterModeChangeRef = useRef(false);
  useEffect(() => {
    selectAfterModeChangeRef.current = true;
  }, [storageMode]);

  useEffect(() => {
    if (selectAfterModeChangeRef.current && pendingSelectionRef?.current) {
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
      toast.error("Failed to load conversations");
    }
  }, [storage]);

  const selectConversation = useCallback(
    async (id: string) => {
      try {
        const data = await storage.getConversation(id);
        if (!data) return;
        setActiveConversation(data.conversation);
        setMessages(data.messages);
        try {
          const stored = localStorage.getItem(`waichat:versions:${id}`);
          setActiveVersions(stored ? JSON.parse(stored) : {});
        } catch {
          setActiveVersions({});
        }
      } catch {
        toast.error("Failed to load conversation");
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
      localStorage.removeItem(`waichat:versions:${id}`);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversation?.id === id) {
        setActiveConversation(null);
        setMessages([]);
        setActiveVersions({});
      }
    },
    [storage, activeConversation],
  );

  const updateActiveModel = useCallback(
    async (model: string) => {
      if (!activeConversation) return;
      try {
        await storage.updateConversationModel(activeConversation.id, model);
        const now = Date.now();
        setActiveConversation((prev) => (prev ? { ...prev, model, updated_at: now } : null));
        setConversations((prev) =>
          prev
            .map((c) => (c.id === activeConversation.id ? { ...c, model, updated_at: now } : c))
            .sort((a, b) => b.updated_at - a.updated_at),
        );
      } catch (err) {
        console.error("Failed to update active model:", err);
        toast.error("Failed to update conversation model");
      }
    },
    [storage, activeConversation],
  );

  const clearConversation = useCallback(() => {
    setActiveConversation(null);
    setMessages([]);
    setActiveVersions({});
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (activeConversation) {
      localStorage.setItem(
        `waichat:versions:${activeConversation.id}`,
        JSON.stringify(activeVersions),
      );
    }
  }, [activeVersions, activeConversation]);

  const setActiveVersionCb = useCallback((parentId: string, messageId: string) => {
    setActiveVersions((prev) => ({ ...prev, [parentId]: messageId }));
  }, []);

  /**
   * Build the linear message history by traversing the tree.
   * Starts from the root (parent_id = null) and follows the active versions.
   */
  const getActiveBranch = useCallback(
    (
      allMessages: Message[],
      currentActiveVersions: Record<string, string>,
      rootKey: string,
    ): Message[] => {
      // Group messages by their parent_id
      const childrenMap = new Map<string | null, Message[]>();
      for (const m of allMessages) {
        if (m.deleted_at) continue; // skip soft-deleted
        const pId = m.parent_id || null;
        const group = childrenMap.get(pId) || [];
        group.push(m);
        childrenMap.set(pId, group);
      }

      const result: Message[] = [];
      let currentParentId: string | null = null;
      const visited = new Set<string>();

      while (true) {
        const siblings = childrenMap.get(currentParentId);
        if (!siblings || siblings.length === 0) break;

        // Determine active child for this parent
        const versionKey: string = currentParentId === null ? rootKey : currentParentId;
        const activeId: string | undefined = currentActiveVersions[versionKey];

        let activeChild: Message | undefined;
        if (activeId) {
          activeChild = siblings.find((s) => s.id === activeId);
        }

        // Default to the most recently created sibling if none is explicitly selected
        if (!activeChild) {
          // Since allMessages is sorted by created_at, the last one in siblings is the latest
          activeChild = siblings[siblings.length - 1];
        }

        if (visited.has(activeChild.id)) break;
        visited.add(activeChild.id);

        result.push(activeChild);
        currentParentId = activeChild.id;
      }

      return result;
    },
    [],
  );

  const activeBranch = useMemo(() => {
    if (!activeConversation) return [];
    const rootKey = `${activeConversation.id}_root`;
    return getActiveBranch(messages, activeVersions, rootKey);
  }, [messages, activeVersions, activeConversation, getActiveBranch]);

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
      userParentId?: string,
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
          user_parent_id: userParentId || undefined,
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

      const userParentId =
        activeBranch.length > 0 ? activeBranch[activeBranch.length - 1].id : undefined;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "user",
        content,
        created_at: Date.now(),
        parent_id: userParentId,
      };

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "assistant",
        content: "",
        created_at: Date.now(),
        model,
        parent_id: userMessage.id,
      };

      // Set it as active
      const rootKey = `${conversationId}_root`;
      setActiveVersionCb(userParentId || rootKey, userMessage.id);

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      try {
        const contextMessages = [...activeBranch, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const fullContent = await streamResponse(
          contextMessages,
          assistantMessage.id,
          conversationId,
          model,
          storageMode,
          systemPrompt,
          assistantMessage.parent_id,
          userMessage.id,
          userMessage.parent_id,
        );

        // Save whatever we got (full or partial)
        await storage.saveMessage(userMessage);
        await storage.saveMessage({ ...assistantMessage, content: fullContent });

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
        toast.error("Failed to send message");
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id));
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [isStreaming, messages, storage, activeBranch, setActiveVersionCb, streamResponse],
  );

  const editMessage = useCallback(
    async (
      conversationId: string,
      model: string,
      content: string,
      targetMessageId: string,
      storageMode: "local" | "cloud",
      systemPrompt?: string,
    ) => {
      if (isStreaming) return;

      const targetMsg = messages.find((m) => m.id === targetMessageId);
      if (!targetMsg) return;

      const userParentId = targetMsg.parent_id;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "user",
        content,
        created_at: Date.now(),
        parent_id: userParentId,
      };

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "assistant",
        content: "",
        created_at: Date.now(),
        model,
        parent_id: userMessage.id,
      };

      // Set the newly created user message as the active version for its parent
      const rootKey = `${conversationId}_root`;
      const versionKey = userParentId || rootKey;
      setActiveVersionCb(versionKey, userMessage.id);

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      try {
        // Calculate the branch up to this new message
        const targetIndex = activeBranch.findIndex((m) => m.id === targetMessageId);
        const priorBranch = targetIndex >= 0 ? activeBranch.slice(0, targetIndex) : [];

        const contextMessages = [...priorBranch, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const fullContent = await streamResponse(
          contextMessages,
          assistantMessage.id,
          conversationId,
          model,
          storageMode,
          systemPrompt,
          assistantMessage.parent_id,
          userMessage.id,
          userMessage.parent_id,
        );

        await storage.saveMessage(userMessage);
        await storage.saveMessage({ ...assistantMessage, content: fullContent });
      } catch (e) {
        console.error("[editMessage] error:", e);
        toast.error("Failed to edit message");
        setMessages((prev) =>
          prev.filter((m) => m.id !== assistantMessage.id && m.id !== userMessage.id),
        );
        const rootKey = `${conversationId}_root`;
        setActiveVersionCb(userParentId || rootKey, targetMessageId);
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [isStreaming, messages, storage, activeBranch, setActiveVersionCb, streamResponse],
  );

  const retryMessage = useCallback(
    async (messageId: string, model: string, storageMode: StorageMode, systemPrompt?: string) => {
      if (isStreaming) return;

      // Find the target assistant message
      const targetMsg = messages.find((m) => m.id === messageId);
      if (!targetMsg || targetMsg.role !== "assistant") return;

      const conversationId = targetMsg.conversation_id;

      // In the new tree model, the assistant message's parent is the preceding user message
      const assistantParentId = targetMsg.parent_id;

      // Create new placeholder assistant message
      const newAssistantMessage: Message = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "assistant",
        content: "",
        created_at: Date.now(),
        model,
        parent_id: assistantParentId,
      };

      // Set it as the active version
      const rootKey = `${conversationId}_root`;
      setActiveVersionCb(assistantParentId || rootKey, newAssistantMessage.id);

      setMessages((prev) => [...prev, newAssistantMessage]);
      setIsStreaming(true);

      try {
        // Calculate the active branch up to the parent user message
        const targetUserIndex = activeBranch.findIndex((m) => m.id === assistantParentId);
        const priorBranch = targetUserIndex >= 0 ? activeBranch.slice(0, targetUserIndex + 1) : [];

        const contextMessages = priorBranch.map((m) => ({ role: m.role, content: m.content }));

        const fullContent = await streamResponse(
          contextMessages,
          newAssistantMessage.id,
          conversationId,
          model,
          storageMode,
          systemPrompt,
          newAssistantMessage.parent_id,
          undefined,
          undefined,
        );

        await storage.saveMessage({ ...newAssistantMessage, content: fullContent });
      } catch (e) {
        console.error("[retryMessage] error:", e);
        toast.error("Failed to retry message");
        // Remove the failed placeholder
        setMessages((prev) => prev.filter((m) => m.id !== newAssistantMessage.id));
        // Revert active version to the one the user was viewing
        const rootKey = `${conversationId}_root`;
        setActiveVersionCb(assistantParentId || rootKey, messageId);
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [isStreaming, messages, storage, activeBranch, setActiveVersionCb, streamResponse],
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
        toast.error("Failed to delete message");
      }
    },
    [activeConversation, storage],
  );

  return {
    conversations,
    activeConversation,
    messages,
    activeBranch,
    isStreaming,
    activeVersions,
    loadConversations,
    selectConversation,
    newConversation,
    deleteConversation,
    updateActiveModel,
    clearConversation,
    sendMessage,
    editMessage,
    stopGeneration,
    retryMessage,
    setActiveVersion: setActiveVersionCb,
    deleteMessage: deleteMessageCb,
    renameConversation: async (id: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;

      const current = conversations.find((c) => c.id === id);
      if (!current || current.title === trimmed) return;

      try {
        await storage.updateConversationTitle(id, trimmed);

        // Update local list
        setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c)));

        // Update active conversation if it's the one being renamed
        if (activeConversation?.id === id) {
          setActiveConversation((prev) => (prev ? { ...prev, title: trimmed } : null));
        }
      } catch (err) {
        console.error("Failed to rename conversation:", err);
        toast.error("Failed to rename conversation");
        throw err; // Re-throw so the UI can handle UI-specific logic (like closing the input)
      }
    },
  };
}
