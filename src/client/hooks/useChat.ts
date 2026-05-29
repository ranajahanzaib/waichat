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
  streamingStorageMode: StorageMode | null;
  activeVersions: Record<string, string>;
  loadConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  newConversation: (model: string, targetMode?: StorageMode, systemPromptId?: string | null, systemPromptContent?: string | null) => Promise<Conversation>;
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
  renameConversation: (id: string, title: string) => Promise<void>;
  streamingConversationId: string | null;
}

export function useChat(
  storageMode: StorageMode,
  pendingSelectionRef?: React.RefObject<string | null>,
  onStorageModeChange?: (mode: StorageMode) => void,
): UseChatReturn {
  const storageModeRef = useRef(storageMode);
  const activeConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    storageModeRef.current = storageMode;
  }, [storageMode]);

  const storage = useMemo(() => createStorage(storageMode), [storageMode]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  useEffect(() => {
    activeConversationIdRef.current = activeConversation?.id || null;
  }, [activeConversation?.id]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingStorageMode, setStreamingStorageMode] = useState<StorageMode | null>(null);
  const toast = useToast();
  const [activeVersions, setActiveVersions] = useState<Record<string, string>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null);
  const streamingDataRef = useRef<{
    conversationId: string;
    storageMode: StorageMode;
    userMessage?: Message;
    assistantMessage: Message;
  } | null>(null);

  useEffect(() => {
    setActiveConversation(null);
    setMessages([]);
    setActiveVersions({});
  }, [storageMode]);

  const mergeStreamingData = useCallback(
    (id: string, currentMessages: Message[]) => {
      const streaming = streamingDataRef.current;
      if (streaming?.conversationId === id && streaming?.storageMode === storageMode) {
        const existingIds = new Set(currentMessages.map((m) => m.id));
        const toAdd: Message[] = [];
        if (streaming.userMessage && !existingIds.has(streaming.userMessage.id)) {
          toAdd.push(streaming.userMessage);
        }
        if (!existingIds.has(streaming.assistantMessage.id)) {
          toAdd.push(streaming.assistantMessage);
        }
        if (toAdd.length > 0) {
          return [...currentMessages, ...toAdd];
        }
      }
      return currentMessages;
    },
    [storageMode],
  );

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
        setMessages(mergeStreamingData(id, data.messages));

        if (storageMode !== "temporary") {
          try {
            const stored = localStorage.getItem(`waichat:versions:${id}`);
            setActiveVersions(stored ? JSON.parse(stored) : {});
          } catch {
            setActiveVersions({});
          }
        } else {
          setActiveVersions({});
        }
      } catch {
        toast.error("Failed to load conversation");
      }
    },
    [storage, storageMode, mergeStreamingData, toast],
  );

  // After mode change: auto-select a conversation if pendingSelectionRef is set
  useEffect(() => {
    if (pendingSelectionRef?.current) {
      const id = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      // Select the specific conversation
      storage.getConversation(id).then((result) => {
        if (result) {
          setActiveConversation(result.conversation);
          const finalMessages = mergeStreamingData(id, result.messages);
          setMessages(finalMessages);
        }
      });
    }
  }, [storage, storageMode, pendingSelectionRef, mergeStreamingData]);

  const showBackgroundCompletionToast = useCallback(
    (targetMode: StorageMode, conversationId: string, title?: string) => {
      // Use refs to check current state to avoid closure staleness during async streams
      const isWrongMode = storageModeRef.current !== targetMode;
      const isWrongChat = activeConversationIdRef.current !== conversationId;

      if (!isWrongMode && !isWrongChat) return;

      const action = {
        label: "View",
        onClick: () => {
          if (isWrongMode && onStorageModeChange) {
            if (pendingSelectionRef) pendingSelectionRef.current = conversationId;
            onStorageModeChange(targetMode);
          } else {
            selectConversation(conversationId);
          }
        },
      };

      toast.success(`Response ready in "${title || "New Conversation"}"`, 6000, action);
    },
    [onStorageModeChange, toast, pendingSelectionRef, activeConversation?.id, selectConversation],
  );

  const showBackgroundErrorToast = useCallback(
    (actionName: string, targetMode: StorageMode, conversationId: string) => {
      const isWrongMode = storageModeRef.current !== targetMode;
      const isWrongChat = activeConversation?.id !== conversationId;

      if (!isWrongMode && !isWrongChat) return;

      const modeLabel = targetMode === "cloud" ? "Cloud" : "Local";
      const message = `Failed to ${actionName}${isWrongMode ? ` in ${modeLabel} mode` : ""}`;

      const action = {
        label: "Switch",
        onClick: () => {
          if (isWrongMode && onStorageModeChange) {
            onStorageModeChange(targetMode);
            if (pendingSelectionRef) pendingSelectionRef.current = conversationId;
          } else {
            selectConversation(conversationId);
          }
        },
      };

      toast.error(message, 6000, action);
    },
    [onStorageModeChange, toast, pendingSelectionRef, activeConversation?.id, selectConversation],
  );

  const newConversation = useCallback(
    async (model: string, targetMode?: StorageMode, systemPromptId?: string | null, systemPromptContent?: string | null): Promise<Conversation> => {
      const mode = targetMode || storageMode;
      const targetStorage = createStorage(mode);
      const conversation = await targetStorage.createConversation(model, systemPromptId, systemPromptContent);

      if (mode === storageMode) {
        setConversations((prev) => [conversation, ...prev]);
        setActiveConversation(conversation);
        setMessages([]);
        setActiveVersions({});
      }
      return conversation;
    },
    [storageMode],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      await storage.deleteConversation(id);
      if (storageMode !== "temporary") {
        localStorage.removeItem(`waichat:versions:${id}`);
      }
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
    if (activeConversation && storageMode !== "temporary") {
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
      signal: AbortSignal,
      systemPrompt?: string,
      parentId?: string,
      userMessageId?: string,
      userParentId?: string,
    ) => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: signal,
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

                // Update the persistent ref for re-hydration on re-focus.
                // Note: JS is single-threaded, so this mutation is safe from interleaving
                // with selectConversation's read of the same ref.
                if (streamingDataRef.current?.conversationId === conversationId) {
                  streamingDataRef.current.assistantMessage = {
                    ...streamingDataRef.current.assistantMessage,
                    content: fullContent,
                  };
                }

                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId ? { ...m, content: fullContent } : m,
                  ),
                );

                const isLocalOrTemp = currentStorageMode !== "cloud";
                const shouldSave = fullContent.length > 0 && fullContent.length % 50 === 0;

                if (isLocalOrTemp && shouldSave) {
                  const s = createStorage(currentStorageMode);
                  await s.saveMessage({
                    ...streamingDataRef.current!.assistantMessage,
                    content: fullContent,
                  });
                }
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

      // Track in ref for persistence during stream
      streamingDataRef.current = {
        conversationId,
        storageMode,
        userMessage: { ...userMessage }, // Owned copy
        assistantMessage: { ...assistantMessage }, // Owned copy
      };
      setStreamingConversationId(conversationId);

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);
      setStreamingStorageMode(storageMode);

      // Persist immediately in local/temporary mode to prevent loss on reload
      if (storageMode !== "cloud") {
        const s = createStorage(storageMode);
        await s.saveMessage(userMessage);
        await s.saveMessage(assistantMessage);
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

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
          storageMode === "temporary" ? "local" : storageMode,
          abortController.signal,
          systemPrompt,
          assistantMessage.parent_id,
          userMessage.id,
          userMessage.parent_id,
        );

        // Save whatever we got (full or partial) - skip for Cloud as worker already saves
        if (storageMode !== "cloud") {
          const finalStorage = createStorage(storageMode);
          await finalStorage.saveMessage(userMessage);
          await finalStorage.saveMessage({ ...assistantMessage, content: fullContent });
        }

        // Handle auto-titling if needed
        let finalTitle = activeConversation?.title;
        if (
          messages.length === 0 &&
          (storageMode === "local" || storageMode === "temporary") &&
          fullContent
        ) {
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
            finalTitle = title;
          } catch {
            const title = content.split(" ").slice(0, 5).join(" ");
            await storage.updateConversationTitle(conversationId, title);
            setConversations((prev) =>
              prev.map((c) => (c.id === conversationId ? { ...c, title } : c)),
            );
            finalTitle = title;
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

        // --- BACKGROUND COMPLETION TOAST ---
        // Use the current storageModeRef to check if the mode has changed during streaming (e.g. chat was saved)
        showBackgroundCompletionToast(storageMode, conversationId, finalTitle);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          console.log("[sendMessage] Aborted background stream");
        } else {
          console.error("[sendMessage] error:", e);
          showBackgroundErrorToast("send message", storageMode, conversationId);
          setMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id));
        }
      } finally {
        if (abortControllerRef.current === abortController || abortControllerRef.current === null) {
          setIsStreaming(false);
          setStreamingStorageMode(null);
          setStreamingConversationId(null);
          streamingDataRef.current = null;
          abortControllerRef.current = null;
        }
      }
    },
    [
      isStreaming,
      messages,
      storage,
      activeBranch,
      setActiveVersionCb,
      streamResponse,
      activeConversation,
      toast,
      showBackgroundCompletionToast,
      showBackgroundErrorToast,
    ],
  );

  const editMessage = useCallback(
    async (
      conversationId: string,
      model: string,
      content: string,
      targetMessageId: string,
      storageMode: StorageMode,
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

      // Track in ref for persistence during stream
      streamingDataRef.current = {
        conversationId,
        storageMode,
        userMessage: { ...userMessage }, // Owned copy
        assistantMessage: { ...assistantMessage }, // Owned copy
      };
      setStreamingConversationId(conversationId);

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);
      setStreamingStorageMode(storageMode);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

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
          storageMode === "temporary" ? "local" : storageMode,
          abortController.signal,
          systemPrompt,
          assistantMessage.parent_id,
          userMessage.id,
          userMessage.parent_id,
        );

        if (storageMode !== "cloud") {
          await storage.saveMessage(userMessage);
          await storage.saveMessage({ ...assistantMessage, content: fullContent });
        }

        // --- BACKGROUND COMPLETION TOAST ---
        showBackgroundCompletionToast(storageMode, conversationId, activeConversation?.title);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          console.log("[editMessage] Aborted background stream");
        } else {
          console.error("[editMessage] error:", e);
          showBackgroundErrorToast("edit message", storageMode, conversationId);
          setMessages((prev) =>
            prev.filter((m) => m.id !== assistantMessage.id && m.id !== userMessage.id),
          );
          const rootKey = `${conversationId}_root`;
          setActiveVersionCb(userParentId || rootKey, targetMessageId);
        }
      } finally {
        if (abortControllerRef.current === abortController || abortControllerRef.current === null) {
          setIsStreaming(false);
          setStreamingStorageMode(null);
          setStreamingConversationId(null);
          streamingDataRef.current = null;
          abortControllerRef.current = null;
        }
      }
    },
    [
      isStreaming,
      messages,
      storage,
      activeBranch,
      setActiveVersionCb,
      streamResponse,
      activeConversation,
      toast,
      showBackgroundCompletionToast,
      showBackgroundErrorToast,
    ],
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

      // Track in ref for persistence during stream
      streamingDataRef.current = {
        conversationId,
        storageMode,
        assistantMessage: { ...newAssistantMessage }, // Owned copy
      };
      setStreamingConversationId(conversationId);

      setMessages((prev) => [...prev, newAssistantMessage]);
      setIsStreaming(true);
      setStreamingStorageMode(storageMode);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

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
          storageMode === "temporary" ? "local" : storageMode,
          abortController.signal,
          systemPrompt,
          newAssistantMessage.parent_id,
          undefined,
          undefined,
        );

        if (storageMode !== "cloud") {
          await storage.saveMessage({ ...newAssistantMessage, content: fullContent });
        }

        // --- BACKGROUND COMPLETION TOAST ---
        showBackgroundCompletionToast(storageMode, conversationId, activeConversation?.title);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          console.log("[retryMessage] Aborted background stream");
        } else {
          console.error("[retryMessage] error:", e);
          showBackgroundErrorToast("retry message", storageMode, conversationId);
          // Remove the failed placeholder
          setMessages((prev) => prev.filter((m) => m.id !== newAssistantMessage.id));
          // Revert active version to the one the user was viewing
          const rootKey = `${conversationId}_root`;
          setActiveVersionCb(assistantParentId || rootKey, messageId);
        }
      } finally {
        if (abortControllerRef.current === abortController || abortControllerRef.current === null) {
          setIsStreaming(false);
          setStreamingStorageMode(null);
          setStreamingConversationId(null);
          streamingDataRef.current = null;
          abortControllerRef.current = null;
        }
      }
    },
    [
      isStreaming,
      messages,
      storage,
      activeBranch,
      setActiveVersionCb,
      streamResponse,
      activeConversation,
      toast,
      showBackgroundCompletionToast,
      showBackgroundErrorToast,
    ],
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
    streamingStorageMode,
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
    streamingConversationId,
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
