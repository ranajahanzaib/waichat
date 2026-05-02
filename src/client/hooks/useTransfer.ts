import { useCallback, useRef, useState } from "react";
import type { Conversation, Message, StorageMode } from "../storage";
import { createStorage } from "../storage";

const PENDING_CLOUD_DELETE_KEY = "waichat:pending-cloud-delete";

interface TransferState {
  /** The conversation being transferred (null = idle) */
  conversationId: string | null;
  /** Loading phase: 'prefetch' (reading source) or 'transfer' (writing target) */
  phase: "idle" | "prefetch" | "transfer";
  /** Pre-confirm data (used for size warning) */
  prefetchedData: { conversation: Conversation; messages: Message[] } | null;
  /** Estimated bytes for cloud→local size warning */
  estimatedBytes: number;
  /** Error message if transfer failed */
  error: string | null;
}

interface UseTransferReturn {
  /** Current transfer state */
  transferState: TransferState;
  /** Initiate a move - prefetches data, then caller should show confirm modal */
  initiateMove: (conversationId: string, fromMode: StorageMode) => Promise<void>;
  /** Execute the confirmed move */
  executeMove: (fromMode: StorageMode, toMode: StorageMode) => Promise<string>;
  /** Cancel / reset transfer state */
  cancelMove: () => void;
  /** Retry any pending cloud deletes from previous failed transfers */
  retryPendingCloudDeletes: () => Promise<void>;
}

export function useTransfer(): UseTransferReturn {
  const [transferState, setTransferState] = useState<TransferState>({
    conversationId: null,
    phase: "idle",
    prefetchedData: null,
    estimatedBytes: 0,
    error: null,
  });

  // Keep prefetched data in a ref so async executeMove can access it
  // without depending on stale state
  const prefetchedRef = useRef<{ conversation: Conversation; messages: Message[] } | null>(null);

  const initiateMove = useCallback(async (conversationId: string, fromMode: StorageMode) => {
    setTransferState({
      conversationId,
      phase: "prefetch",
      prefetchedData: null,
      estimatedBytes: 0,
      error: null,
    });

    try {
      const sourceStorage = createStorage(fromMode);
      const data = await sourceStorage.exportConversation(conversationId);

      if (!data) {
        setTransferState((prev) => ({
          ...prev,
          phase: "idle",
          error: "Conversation not found",
        }));
        return;
      }

      const estimatedBytes = JSON.stringify(data).length;
      prefetchedRef.current = data;

      setTransferState({
        conversationId,
        phase: "idle", // Prefetch done, waiting for confirm
        prefetchedData: data,
        estimatedBytes,
        error: null,
      });
    } catch (e) {
      console.error("[useTransfer] prefetch error:", e);
      setTransferState({
        conversationId: null,
        phase: "idle",
        prefetchedData: null,
        estimatedBytes: 0,
        error: "Failed to read conversation",
      });
    }
  }, []);

  const executeMove = useCallback(
    async (fromMode: StorageMode, toMode: StorageMode): Promise<string> => {
      const data = prefetchedRef.current;
      if (!data) throw new Error("No prefetched data");

      const { conversation, messages } = data;

      setTransferState((prev) => ({
        ...prev,
        phase: "transfer",
        error: null,
      }));

      try {
        if (toMode === "cloud") {
          // Local → Cloud: POST to import endpoint
          const res = await fetch("/api/conversations/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversation, messages }),
          });

          if (!res.ok) {
            const errorData = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(errorData.error || "Import failed");
          }

          // Success - delete from localStorage
          const sourceStorage = createStorage("local");
          await sourceStorage.deleteConversation(conversation.id);
        } else {
          // Cloud → Local: write to localStorage, then delete from cloud
          const targetStorage = createStorage("local");

          // Write conversation (filter first to prevent duplicates on retry)
          const localConversations = JSON.parse(
            localStorage.getItem("waichat:conversations") ?? "[]",
          ) as Conversation[];
          const filtered = localConversations.filter((c) => c.id !== conversation.id);
          filtered.push({
            id: conversation.id,
            title: conversation.title,
            model: conversation.model,
            created_at: conversation.created_at,
            updated_at: conversation.updated_at,
          });
          localStorage.setItem("waichat:conversations", JSON.stringify(filtered));

          // Write messages
          localStorage.setItem(`waichat:messages:${conversation.id}`, JSON.stringify(messages));

          // Delete from cloud
          try {
            const cloudStorage = createStorage("cloud");
            await cloudStorage.deleteConversation(conversation.id);
          } catch {
            // Cloud delete failed - mark for retry on next app load
            const pending = JSON.parse(
              localStorage.getItem(PENDING_CLOUD_DELETE_KEY) ?? "[]",
            ) as string[];
            if (!pending.includes(conversation.id)) {
              pending.push(conversation.id);
              localStorage.setItem(PENDING_CLOUD_DELETE_KEY, JSON.stringify(pending));
            }
            console.warn(
              "[useTransfer] Cloud delete failed, will retry on next load:",
              conversation.id,
            );
          }
        }

        // Clean up state
        prefetchedRef.current = null;
        setTransferState({
          conversationId: null,
          phase: "idle",
          prefetchedData: null,
          estimatedBytes: 0,
          error: null,
        });

        return conversation.id;
      } catch (e) {
        console.error("[useTransfer] transfer error:", e);
        const errorMessage = e instanceof Error ? e.message : "Transfer failed";
        setTransferState((prev) => ({
          ...prev,
          phase: "idle",
          error: errorMessage,
        }));
        throw e;
      }
    },
    [],
  );

  const cancelMove = useCallback(() => {
    prefetchedRef.current = null;
    setTransferState({
      conversationId: null,
      phase: "idle",
      prefetchedData: null,
      estimatedBytes: 0,
      error: null,
    });
  }, []);

  const retryPendingCloudDeletes = useCallback(async () => {
    const pending = JSON.parse(localStorage.getItem(PENDING_CLOUD_DELETE_KEY) ?? "[]") as string[];

    if (pending.length === 0) return;

    const remaining: string[] = [];

    for (const id of pending) {
      try {
        const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
        if (!res.ok && res.status !== 404) {
          // 404 means already deleted (idempotent success)
          remaining.push(id);
        }
      } catch {
        remaining.push(id);
      }
    }

    if (remaining.length > 0) {
      localStorage.setItem(PENDING_CLOUD_DELETE_KEY, JSON.stringify(remaining));
    } else {
      localStorage.removeItem(PENDING_CLOUD_DELETE_KEY);
    }
  }, []);

  return {
    transferState,
    initiateMove,
    executeMove,
    cancelMove,
    retryPendingCloudDeletes,
  };
}
