import { HatGlasses, SquarePen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ChatInput from "./components/ChatInput";
import MessageList from "./components/MessageList";
import ModelPicker from "./components/ModelPicker";
import SettingsModal from "./components/SettingsModal";
import Sidebar from "./components/Sidebar";
import { ToastContainer } from "./components/Toast";
import { useChat } from "./hooks/useChat";
import { DEFAULT_MODEL_ID, useModels } from "./hooks/useModels";
import { useToast } from "./hooks/useToast";
import { useTransfer } from "./hooks/useTransfer";
import type { Conversation, Message, StorageMode } from "./storage";
import { createStorage } from "./storage";
import { exportWorkspace } from "./utils/exportUtils";
import { parseImportFile } from "./utils/importUtils";

const STORAGE_MODE_KEY = "waichat:storage-mode";
const SYNC_SETTINGS_KEY = "waichat:sync-settings";
const DEFAULT_MODEL_KEY = "waichat:default-model";
const SYSTEM_PROMPTS_KEY = "waichat:system-prompts";
export const THEME_KEY = "waichat:theme";
const MOBILE_BREAKPOINT = 768;

export interface SystemPrompt {
  id: string;
  user_id: string;
  name: string;
  content: string;
  created_at: number;
  updated_at?: number | null;
}

export type ThemeMode = "system" | "light" | "dark";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Pure read of stored system prompts — no side effects. */
function readSystemPromptsFromStorage(): SystemPrompt[] {
  try {
    const stored = localStorage.getItem(SYSTEM_PROMPTS_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  const toast = useToast();
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(THEME_KEY);
      return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    }
    return "system";
  });

  const [pendingPrompt, setPendingPrompt] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }

    // Instantly save to localStorage whenever theme changes
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const root = window.document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(mediaQuery.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  // Track the actual saved preference in localStorage separately
  const [savedStorageMode, setSavedStorageMode] = useState<StorageMode>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_MODE_KEY);
      return stored === "local" ? "local" : "cloud";
    }
    return "cloud";
  });

  // Check the URL for a forced storage mode first, fallback to localStorage
  const [storageMode, setStorageMode] = useState<StorageMode>(() => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      if (path.startsWith("/c/local/")) return "local";
      if (path.startsWith("/c/cloud/")) return "cloud";
    }
    return savedStorageMode;
  });

  const pendingSelectionRef = useRef<string | null>(null);
  const [storageDropdownOpen, setStorageDropdownOpen] = useState(false);

  const isTemporaryChat = storageMode === "temporary";

  const { transferState, initiateMove, executeMove, cancelMove, retryPendingCloudDeletes } =
    useTransfer();

  const { models, refreshModels } = useModels();
  const [defaultModel, setDefaultModel] = useState(
    () => localStorage.getItem(DEFAULT_MODEL_KEY) ?? DEFAULT_MODEL_ID,
  );
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>(
    () => readSystemPromptsFromStorage(),
  );
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [syncSettings, setSyncSettings] = useState(
    () =>
      (localStorage.getItem(SYNC_SETTINGS_KEY) ??
        localStorage.getItem("waichat:sync-system-prompt")) === "true",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempExpiry, setTempExpiry] = useState(
    () => localStorage.getItem("waichat:temp-expiry") || "1h",
  );

  const {
    conversations,
    activeConversation,
    messages,
    isStreaming,
    activeBranch,
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
    setActiveVersion,
    deleteMessage,
    renameConversation,
    streamingConversationId,
    streamingStorageMode,
  } = useChat(storageMode, pendingSelectionRef, (mode) => {
    handleStorageToggle(mode);
  });

  const activeConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeConversationIdRef.current = activeConversation?.id || null;
  }, [activeConversation?.id]);

  // Sync selected prompt with the active conversation's stored system_prompt_id.
  // Covers all cases: initial URL load, conversation switch, new-chat clear, and
  // new conversation creation (which comes back from storage with system_prompt_id set).
  useEffect(() => {
    if (activeConversation) {
      setSelectedPromptId(activeConversation.system_prompt_id ?? null);
    } else {
      setSelectedPromptId(null);
    }
  }, [activeConversation?.id, activeConversation?.system_prompt_id]);

  const handleTempExpiryChange = useCallback((val: string) => {
    setTempExpiry(val);
    localStorage.setItem("waichat:temp-expiry", val);
  }, []);

  const handleStorageToggle = useCallback((next: StorageMode) => {
    setStorageMode(next);
    if (next !== "temporary") {
      setSavedStorageMode(next);
      localStorage.setItem(STORAGE_MODE_KEY, next);
    }
    setStorageDropdownOpen(false);
  }, []);

  // Initial Temporary Chat Cleanup (only on mount)
  useEffect(() => {
    const runInitialCleanup = async () => {
      const storage = createStorage("temporary");
      if (storage.cleanup) {
        const expiredIds = await storage.cleanup(tempExpiry, true);
        if (expiredIds.length > 0) {
          loadConversations();
        }
      }
    };
    runInitialCleanup();
  }, []); // Only on mount

  // Recurring Temporary Chat Cleanup
  useEffect(() => {
    const runCleanup = async () => {
      const storage = createStorage("temporary");
      if (storage.cleanup) {
        const expiredIds = await storage.cleanup(tempExpiry, false);
        if (expiredIds.length > 0) {
          const expiredIdsSet = new Set(expiredIds);
          if (
            activeConversationIdRef.current &&
            expiredIdsSet.has(activeConversationIdRef.current)
          ) {
            clearConversation();
          }
          loadConversations();
        }
      }
    };

    const interval = setInterval(runCleanup, 60000);
    return () => clearInterval(interval);
  }, [loadConversations, tempExpiry, clearConversation]);

  // One-time migration: import legacy waichat:system-prompt into the library
  useEffect(() => {
    try {
      const legacyPrompt = localStorage.getItem("waichat:system-prompt");
      if (legacyPrompt !== null) {
        if (legacyPrompt.trim()) {
          const now = Date.now();
          const migrated: SystemPrompt = {
            id: generateUUID(),
            user_id: "default",
            name: "Default Prompt",
            content: legacyPrompt.trim(),
            created_at: now,
            updated_at: now,
          };
          const current = readSystemPromptsFromStorage();
          const updated = [...current, migrated];
          localStorage.setItem(SYSTEM_PROMPTS_KEY, JSON.stringify(updated));
          setSystemPrompts(updated);
        }
        // Always remove so the migration never runs again, even for empty/whitespace values
        localStorage.removeItem("waichat:system-prompt");
      }
    } catch (err) {
      console.error("Failed to migrate legacy system prompt:", err);
    }
  }, []);

  const isStreamingHere =
    isStreaming &&
    activeConversation?.id === streamingConversationId &&
    storageMode === streamingStorageMode;

  // Sidebar state: Open by default on desktop, closed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return typeof window !== "undefined" ? window.innerWidth >= MOBILE_BREAKPOINT : true;
  });

  useEffect(() => {
    loadConversations();
    retryPendingCloudDeletes();
  }, [loadConversations, retryPendingCloudDeletes]);

  // Load system prompts from cloud if sync enabled, merging local-only prompts up first
  useEffect(() => {
    if (!syncSettings) return;
    let active = true;

    const syncPrompts = async () => {
      try {
        const res = await fetch("/api/system-prompts");
        if (!res.ok) throw new Error("Failed to fetch system prompts");
        const cloudPrompts = (await res.json()) as SystemPrompt[];
        if (!active) return;

        const cloudPromptsMap = new Map(cloudPrompts.map((p) => [p.id, p]));

        // Read local prompts directly from storage to avoid stale closure
        let localPrompts: SystemPrompt[] = [];
        try {
          const stored = localStorage.getItem(SYSTEM_PROMPTS_KEY);
          const parsed = stored ? JSON.parse(stored) : [];
          localPrompts = Array.isArray(parsed) ? parsed : [];
        } catch {
          localPrompts = [];
        }

        // Upload prompts that are missing from cloud OR are strictly newer locally
        // (using updated_at to avoid overwriting changes made on other devices)
        const localOnlyOrModified = localPrompts.filter((p) => {
          const cloud = cloudPromptsMap.get(p.id);
          if (!cloud) return true;
          return (p.updated_at ?? p.created_at) > (cloud.updated_at ?? cloud.created_at);
        });
        let hasUploadError = false;
        await Promise.all(
          localOnlyOrModified.map(async (p) => {
            try {
              const postRes = await fetch("/api/system-prompts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: p.id, name: p.name, content: p.content, created_at: p.created_at, updated_at: p.updated_at }),
              });
              if (!postRes.ok) throw new Error(`Failed to sync prompt: ${p.name}`);
            } catch (err) {
              console.error(err);
              hasUploadError = true;
            }
          }),
        );
        // Abort before overwriting localStorage — any failed upload means the
        // cloud list is incomplete and would permanently delete local-only prompts
        if (hasUploadError) {
          throw new Error("Some prompts failed to upload. Aborting sync to prevent local data loss.");
        }
        if (!active) return;

        // Re-fetch the merged list from cloud
        const merged =
          localOnlyOrModified.length > 0
            ? await fetch("/api/system-prompts").then((r) => {
                if (!r.ok) throw new Error("Failed to fetch merged prompts");
                return r.json() as Promise<SystemPrompt[]>;
              })
            : cloudPrompts;
        if (!active) return;

        setSystemPrompts(merged);
        localStorage.setItem(SYSTEM_PROMPTS_KEY, JSON.stringify(merged));
      } catch (err) {
        if (active) console.error("Cloud sync error (system_prompts):", err);
      }
    };

    syncPrompts();
    return () => {
      active = false;
    };
  }, [syncSettings]);

  // Sync Default Model from Cloud if enabled
  useEffect(() => {
    if (syncSettings) {
      fetch("/api/settings/default_model")
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch default model");
          return res.json() as Promise<{ value?: string }>;
        })
        .then((data) => {
          if (data.value != null && data.value !== defaultModel) {
            setDefaultModel(data.value);
            localStorage.setItem(DEFAULT_MODEL_KEY, data.value);
          }
        })
        .catch((err) => console.error("Cloud sync error (default_model):", err));
    }
  }, [syncSettings]);

  const initialLoadDone = useRef(false);

  // Clear URL when switching to Temporary mode
  useEffect(() => {
    if (isTemporaryChat) {
      if (window.location.pathname !== "/") {
        window.history.pushState({}, "", "/");
      }
    }
  }, [isTemporaryChat]);

  // Safely parse the new URL format on initial render
  useEffect(() => {
    if (initialLoadDone.current) return;

    const path = window.location.pathname;
    if (path.startsWith("/c/")) {
      const parts = path.split("/");
      const mode = parts[2];
      const id = parts[3];

      if ((mode === "cloud" || mode === "local") && id) {
        selectConversation(id);
      } else {
        // Invalid path format, just go back home cleanly
        window.history.replaceState({}, "", "/");
      }
    }

    initialLoadDone.current = true;
  }, [selectConversation]);

  // Handle browser Back/Forward with cross-mode support
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path.startsWith("/c/")) {
        const parts = path.split("/");
        const mode = parts[2] as StorageMode;
        const id = parts[3];

        if ((mode === "cloud" || mode === "local") && id) {
          if (mode !== storageMode) {
            // If the user hits "Back" and it crosses into a different storage mode,
            // the safest way to re-initialize all hooks and state is a hard reload.
            window.location.reload();
            return;
          }
          selectConversation(id);
        } else {
          // Invalid URL format, act as if we hit home
          clearConversation();
          window.history.replaceState({}, "", "/");
        }
      } else {
        clearConversation();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectConversation, clearConversation, storageMode]);

  // Update the URL format to include the storage mode
  useEffect(() => {
    if (isTemporaryChat) return; // Don't update URL for temporary chats
    const currentPath = window.location.pathname;
    if (activeConversation) {
      const expectedPath = `/c/${storageMode}/${activeConversation.id}`;
      if (currentPath !== expectedPath) {
        window.history.pushState({}, "", expectedPath);
      }
    } else if (currentPath !== "/") {
      window.history.pushState({}, "", "/");
    }
  }, [activeConversation, storageMode, isTemporaryChat]);

  // Close storage dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(".storage-dropdown-container")) {
        setStorageDropdownOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStorageDropdownOpen(false);
    };

    if (storageDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [storageDropdownOpen]);

  const closeSidebarOnMobile = () => {
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      setSidebarOpen(false);
    }
  };

  const handleSelectConversation = (id: string) => {
    // Save current input to its draft key before switching
    const currentKey = activeConversation?.id || "new";
    const nextDraft = drafts[id] || "";

    setDrafts((prev) => ({ ...prev, [currentKey]: inputValue }));
    selectConversation(id);
    setInputValue(nextDraft);
    closeSidebarOnMobile();
  };

  const handleNew = async (targetMode?: StorageMode) => {
    // Save current input draft before switching
    const currentKey = activeConversation?.id || "new";
    const nextNewDraft = drafts["new"] || "";

    setDrafts((prev) => ({ ...prev, [currentKey]: inputValue }));

    const finalMode = targetMode ?? storageMode;
    if (finalMode !== storageMode) {
      handleStorageToggle(finalMode);
      clearConversation();
      window.history.pushState({}, "", "/");
    } else {
      // Prevent creating multiple empty chats if the current one is already empty
      if (activeConversation && messages.length === 0) {
        closeSidebarOnMobile();
        return;
      }
      clearConversation();
      window.history.pushState({}, "", "/");
    }
    setInputValue(nextNewDraft);
    closeSidebarOnMobile();
  };

  // For an active conversation use its stored snapshot so library edits/deletes
  // don't silently change the AI's behaviour mid-conversation.
  // For a new chat (no active conversation) use the currently selected prompt.
  const effectiveSystemPrompt = activeConversation
    ? (activeConversation.system_prompt ?? "")
    : (systemPrompts.find((p) => p.id === selectedPromptId)?.content ?? "");

  const handleSend = async (content: string) => {
    if (isStreaming) return;
    const currentModel = activeConversation?.model ?? defaultModel;
    if (!activeConversation) {
      const convo = await newConversation(defaultModel, storageMode, selectedPromptId, effectiveSystemPrompt || null);
      await sendMessage(content, defaultModel, convo.id, storageMode, effectiveSystemPrompt);
    } else {
      await sendMessage(
        content,
        currentModel,
        activeConversation.id,
        storageMode,
        effectiveSystemPrompt,
      );
    }
    setInputValue("");
    const key = activeConversation?.id || "new";
    setDrafts((prev) => ({ ...prev, [key]: "" }));
  };

  const handleInputChange = useCallback((val: string) => {
    setInputValue(val);
  }, []);

  const handleDefaultModelChange = async (m: string, sync: boolean = syncSettings) => {
    setDefaultModel(m);
    localStorage.setItem(DEFAULT_MODEL_KEY, m);

    if (sync) {
      try {
        await fetch("/api/settings/default_model", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: m }),
        });
      } catch (err) {
        console.error("Failed to sync default model to cloud:", err);
      }
    }
  };

  const handleModelChange = (m: string) => {
    if (activeConversation) {
      updateActiveModel(m);
    } else {
      handleDefaultModelChange(m, syncSettings);
    }
  };

  const savePromptsLocally = (prompts: SystemPrompt[]) => {
    localStorage.setItem(SYSTEM_PROMPTS_KEY, JSON.stringify(prompts));
  };

  const handleAddSystemPrompt = async (name: string, content: string) => {
    const now = Date.now();
    const prompt: SystemPrompt = {
      id: generateUUID(),
      user_id: "default",
      name,
      content,
      created_at: now,
      updated_at: now,
    };

    // Optimistic update
    const newList = [...systemPrompts, prompt];
    savePromptsLocally(newList);
    setSystemPrompts(newList);

    if (syncSettings) {
      try {
        const res = await fetch("/api/system-prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: prompt.id,
            name: prompt.name,
            content: prompt.content,
            created_at: prompt.created_at,
            updated_at: prompt.updated_at,
          }),
        });
        if (!res.ok) throw new Error("Failed to save prompt");
      } catch (err) {
        // Local state is kept — background sync will retry on next load/sync enable
        console.error("Failed to sync system prompt to cloud (will retry on next sync):", err);
      }
    }
  };

  const handleUpdateSystemPrompt = async (id: string, name: string, content: string) => {
    const now = Date.now();
    const updatedList = systemPrompts.map((p) =>
      p.id === id ? { ...p, name, content, updated_at: now } : p,
    );
    savePromptsLocally(updatedList);
    setSystemPrompts(updatedList);

    if (syncSettings) {
      try {
        const res = await fetch(`/api/system-prompts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, content, updated_at: now }),
        });
        if (!res.ok) throw new Error("Failed to update prompt");
      } catch (err) {
        // Local state is kept — background sync will retry on next load/sync enable
        console.error("Failed to sync system prompt update to cloud (will retry on next sync):", err);
      }
    }
  };

  const handleDeleteSystemPrompt = async (id: string) => {
    const originalList = [...systemPrompts];
    const originalSelectedPromptId = selectedPromptId;

    // Optimistic update
    const filteredList = systemPrompts.filter((p) => p.id !== id);
    savePromptsLocally(filteredList);
    setSystemPrompts(filteredList);
    if (selectedPromptId === id) setSelectedPromptId(null);

    if (syncSettings) {
      try {
        const res = await fetch(`/api/system-prompts/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete prompt");
      } catch (err) {
        console.error("Failed to delete system prompt:", err);
        savePromptsLocally(originalList);
        setSystemPrompts(originalList);
        if (originalSelectedPromptId === id) setSelectedPromptId(originalSelectedPromptId);
        throw err;
      }
    }
  };

  const handleClearConversations = async (mode: StorageMode) => {
    const storage = createStorage(mode);
    if (storage.clear) {
      await storage.clear();
    }
    await loadConversations();
  };

  const handleMoveConversation = async (conversationId: string, forcedTargetMode?: StorageMode) => {
    const targetMode: StorageMode =
      forcedTargetMode || (storageMode === "cloud" ? "local" : "cloud");

    try {
      // Prefetch the source data
      await initiateMove(conversationId, storageMode);

      // Execute the move
      const movedId = await executeMove(storageMode, targetMode);

      const actionText = storageMode === "temporary" ? "saved" : "moved";
      toast.success(
        `Chat ${actionText} to ${targetMode === "cloud" ? "Cloud" : "Local"} successfully!`,
      );

      // If the moved conversation was the active one, clear it
      if (activeConversation?.id === conversationId) {
        clearConversation();
      }

      // Set pending selection so useChat auto-selects after mode switch
      pendingSelectionRef.current = movedId;

      // Switch to target mode
      handleStorageToggle(targetMode);
    } catch (e) {
      console.error("[handleMoveConversation] error:", e);
      cancelMove();
    }
  };

  const handleExportWorkspace = async (scope: "local" | "cloud" | "both") => {
    try {
      const exportData: {
        local?: { conversations: Conversation[]; messages: Message[] };
        cloud?: { conversations: Conversation[]; messages: Message[] };
        settings: Record<string, string>;
        systemPrompts?: SystemPrompt[];
      } = {
        settings: {
          default_model: localStorage.getItem(DEFAULT_MODEL_KEY) || "",
        },
        systemPrompts: systemPrompts,
      };

      if (scope === "cloud" || scope === "both") {
        const res = await fetch("/api/export");
        if (!res.ok) throw new Error("Failed to export from cloud");
        const cloudData = (await res.json()) as {
          conversations: Conversation[];
          messages: Message[];
          settings: Record<string, string>;
        };
        exportData.cloud = { conversations: cloudData.conversations, messages: cloudData.messages };
        // Merge cloud settings into exportData
        exportData.settings = { ...exportData.settings, ...cloudData.settings };
      }

      if (scope === "local" || scope === "both") {
        const currentStorage = createStorage("local");
        const conversations = await currentStorage.getConversations();

        // Fetch conversation details in batches to avoid overwhelming the adapter
        const messages: Message[] = [];
        const BATCH_SIZE = 10;
        for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
          const chunk = conversations.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(chunk.map((c) => currentStorage.getConversation(c.id)));
          results.forEach((data) => {
            if (data) messages.push(...data.messages);
          });
        }

        exportData.local = { conversations, messages };
      }

      await exportWorkspace(scope, exportData);
    } catch (e) {
      console.error(e);
      toast.error("Failed to export workspace");
    }
  };

  const handleImportWorkspace = async (file: File, onProgress: (msg: string) => void) => {
    try {
      const data = await parseImportFile(file);

      const importToMode = async (
        mode: StorageMode,
        convs: Conversation[],
        msgs: Message[],
        prefix: string,
      ) => {
        const adapter = createStorage(mode);
        const messagesByConv = msgs.reduce(
          (acc, m) => {
            if (!acc[m.conversation_id]) acc[m.conversation_id] = [];
            acc[m.conversation_id].push(m);
            return acc;
          },
          {} as Record<string, Message[]>,
        );

        const total = convs.length;
        const BATCH_SIZE = 5; // Import 5 conversations at once
        for (let i = 0; i < total; i += BATCH_SIZE) {
          const chunk = convs.slice(i, i + BATCH_SIZE);
          await Promise.all(
            chunk.map(async (conv, index) => {
              const currentIdx = i + index;
              const convMessages = messagesByConv[conv.id] || [];
              onProgress(`${prefix} ${currentIdx + 1}/${total}...`);
              // adapter.importConversation is now an upsert
              await adapter.importConversation(conv, convMessages);
            }),
          );
        }
      };

      if (data.scope === "both") {
        if (data.local)
          await importToMode(
            "local",
            data.local.conversations,
            data.local.messages,
            "Importing Local",
          );
        if (data.cloud)
          await importToMode(
            "cloud",
            data.cloud.conversations,
            data.cloud.messages,
            "Importing Cloud",
          );
      } else if (data.scope === "local" && data.local) {
        await importToMode(
          "local",
          data.local.conversations,
          data.local.messages,
          "Importing Local",
        );
      } else if (data.scope === "cloud" && data.cloud) {
        await importToMode(
          "cloud",
          data.cloud.conversations,
          data.cloud.messages,
          "Importing Cloud",
        );
      } else if (data.scope === "external" && data.external) {
        await importToMode(
          storageMode,
          data.external.conversations,
          data.external.messages,
          "Importing",
        );
      }

      // Apply imported settings if they exist
      if (data.settings) {
        if (data.settings.default_model) {
          await handleDefaultModelChange(data.settings.default_model, syncSettings);
        }
      }

      // Restore system prompt library — merge by updated_at so newer imported versions win
      if (data.systemPrompts && Array.isArray(data.systemPrompts) && data.systemPrompts.length > 0) {
        const existingMap = new Map(systemPrompts.map((p) => [p.id, p]));
        const mergedMap = new Map(systemPrompts.map((p) => [p.id, p]));
        const toSync: SystemPrompt[] = [];

        for (const p of data.systemPrompts as SystemPrompt[]) {
          const existing = existingMap.get(p.id);
          if (!existing || (p.updated_at ?? p.created_at) > (existing.updated_at ?? existing.created_at)) {
            mergedMap.set(p.id, p);
            toSync.push(p);
          }
        }

        if (toSync.length > 0) {
          const merged = Array.from(mergedMap.values());
          savePromptsLocally(merged);
          setSystemPrompts(merged);
          if (syncSettings) {
            await Promise.all(
              toSync.map(async (p) => {
                try {
                  const res = await fetch("/api/system-prompts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(p),
                  });
                  if (!res.ok) throw new Error(`Failed to sync imported prompt: ${p.name}`);
                } catch (err) {
                  console.error("Failed to sync imported prompt:", err);
                }
              }),
            );
          }
        }
      }

      await loadConversations();
    } catch (e: any) {
      console.error(e);
      throw e;
    }
  };

  return (
    <div className="relative flex h-screen w-full overflow-hidden font-sans text-gray-900 dark:text-white/95">
      {/* Full-screen base layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-200 dark:from-transparent dark:to-transparent z-0 transition-colors duration-300" />
      <div
        className="absolute inset-0 z-0 hidden dark:block transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(circle at 15% 50%, #1a1e36, #000 50%), radial-gradient(circle at 85% 30%, #2a1635, #000 50%)",
          backgroundColor: "#000",
        }}
      />

      {/* Full-screen glassmorphism base layer */}
      <div className="absolute inset-0 bg-white/40 dark:bg-[#1e1e20]/75 backdrop-blur-[40px] backdrop-saturate-[180%] pointer-events-none z-0 transition-colors duration-300" />

      {/* Interactive Content Wrapper */}
      <div className="relative z-10 flex h-full w-full">
        {/* Mobile Backdrop Overlay */}
        {sidebarOpen && (
          <div
            className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-20 md:hidden transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar
          conversations={conversations}
          activeId={activeConversation?.id ?? null}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onSelect={handleSelectConversation}
          onNew={handleNew}
          onDelete={deleteConversation}
          onMove={handleMoveConversation}
          onRename={renameConversation}
          onSearch={(q, signal) => createStorage(storageMode).searchConversations(q, signal)}
          onSettingsOpen={() => setSettingsOpen(true)}
          onModeChange={handleStorageToggle}
          currentMode={storageMode}
          tempExpiry={tempExpiry}
          onTempExpiryChange={handleTempExpiryChange}
          savedMode={savedStorageMode}
          streamingConversationId={streamingConversationId}
          streamingStorageMode={streamingStorageMode}
          movingConversationId={transferState.conversationId}
        />

        <main className="flex flex-col flex-1 min-w-0 h-full relative">
          {/* TOPBAR */}
          <header className="flex items-center justify-between px-5 py-4 border-b-[0.5px] border-black/5 dark:border-white/10 shrink-0 transition-colors duration-300">
            <div className="flex items-center gap-3">
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-white/65 dark:hover:text-white/95 dark:hover:bg-white/5 transition-colors focus:outline-none"
                  aria-label="Open sidebar"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    className="w-5 h-5 stroke-2"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="3" x2="9" y2="21"></line>
                  </svg>
                </button>
              )}

              <div
                className={`flex items-center gap-2 border-[0.5px] border-black/5 dark:border-white/10 rounded-full pl-3 pr-2 py-1.5 transition-all ${
                  isTemporaryChat
                    ? "bg-slate-500/10 hover:bg-slate-500/20 dark:bg-slate-500/15 dark:hover:bg-slate-500/25"
                    : storageMode === "cloud"
                      ? "bg-brand-cloud/10 hover:bg-brand-cloud/20 dark:bg-brand-cloud/15 dark:hover:bg-brand-cloud/25"
                      : "bg-brand-local/10 hover:bg-brand-local/20 dark:bg-brand-local/15 dark:hover:bg-brand-local/25"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    isTemporaryChat
                      ? "bg-slate-500 shadow-sm shadow-slate-500/50"
                      : storageMode === "cloud"
                        ? "bg-brand-cloud"
                        : "bg-brand-local"
                  }`}
                ></div>
                <div className="flex-1 min-w-0">
                  <ModelPicker
                    models={models}
                    value={activeConversation?.model ?? defaultModel}
                    onChange={handleModelChange}
                    disabled={isStreaming}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative storage-dropdown-container shrink-0">
                <button
                  onClick={() => setStorageDropdownOpen(!storageDropdownOpen)}
                  className={`flex items-center gap-2 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 border-[0.5px] border-black/5 dark:border-white/10 rounded-full px-3 py-1.5 text-gray-700 hover:text-gray-900 dark:text-white/65 dark:hover:text-white/95 text-xs md:text-sm font-medium transition-all focus:outline-none cursor-pointer`}
                  aria-expanded={storageDropdownOpen}
                >
                  {isTemporaryChat ? (
                    <div className="w-2 h-2 rounded-full bg-slate-500 shadow-sm shadow-slate-500/30 dark:shadow-slate-500/50"></div>
                  ) : storageMode === "cloud" ? (
                    <div className="w-2 h-2 rounded-full bg-brand-cloud shadow-sm shadow-brand-cloud/30 dark:shadow-brand-cloud/50"></div>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-brand-local shadow-sm shadow-brand-local/30 dark:shadow-brand-local/50"></div>
                  )}
                  {isTemporaryChat ? "Temporary" : storageMode === "cloud" ? "Cloud" : "Local"}
                  <svg className="w-3 h-3 ml-1" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M6 8L1 3h10z" />
                  </svg>
                </button>

                <div
                  role="menu"
                  className={`absolute right-0 top-full mt-2 w-60 p-1.5 bg-white/95 dark:bg-[#1e1e20]/95 backdrop-blur-xl border-[0.5px] border-black/10 dark:border-white/10 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-200 z-50 origin-top-right ${
                    storageDropdownOpen
                      ? "opacity-100 scale-100 visible"
                      : "opacity-0 scale-95 invisible"
                  }`}
                >
                  {(["cloud", "local", "temporary"] as StorageMode[]).map((mode) => (
                    <button
                      key={mode}
                      role="menuitem"
                      onClick={() => handleStorageToggle(mode)}
                      className={`w-full flex flex-col items-start px-3 py-2.5 text-left rounded-xl transition-all duration-200 cursor-pointer ${
                        storageMode === mode
                          ? mode === "cloud"
                            ? "bg-brand-cloud/10 dark:bg-brand-cloud/20"
                            : mode === "local"
                              ? "bg-brand-local/10 dark:bg-brand-local/20"
                              : "bg-slate-500/10 dark:bg-slate-500/20"
                          : "hover:bg-black/5 dark:hover:bg-white/10"
                      }`}
                    >
                      <p
                        className={`text-[13px] md:text-sm font-medium ${
                          storageMode === mode
                            ? mode === "cloud"
                              ? "text-brand-cloud"
                              : mode === "local"
                                ? "text-brand-local"
                                : "text-slate-500"
                            : "text-gray-900 dark:text-white/95"
                        }`}
                      >
                        {mode === "cloud"
                          ? "Cloud (D1)"
                          : mode === "local"
                            ? "Local (Browser)"
                            : "Temporary (Memory)"}
                      </p>
                      <p
                        className={`text-[11px] md:text-xs mt-0.5 ${
                          storageMode === mode
                            ? mode === "cloud"
                              ? "text-brand-cloud/70"
                              : mode === "local"
                                ? "text-brand-local/70"
                                : "text-slate-500/70"
                            : "text-gray-500 dark:text-white/40"
                        }`}
                      >
                        {mode === "cloud"
                          ? "Syncs across devices"
                          : mode === "local"
                            ? "Stays in your browser"
                            : "Won't be saved"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleStorageToggle("temporary")}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-slate-600 hover:bg-slate-50 dark:text-white/65 dark:hover:text-slate-400 dark:hover:bg-slate-500/10 transition-colors focus:outline-none"
                  title="Temporary Chat"
                >
                  <HatGlasses size={18} strokeWidth={2} />
                </button>
                <button
                  onClick={() => handleNew(storageMode)}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-white/65 dark:hover:text-white/95 dark:hover:bg-white/5 transition-colors focus:outline-none"
                  title="New Chat"
                >
                  <SquarePen size={18} strokeWidth={2} />
                </button>
              </div>
            </div>
          </header>

          {!activeConversation && systemPrompts.length > 0 && (
            <div className="flex items-center justify-center gap-2 px-5 pt-4 shrink-0">
              <label className="text-[11px] md:text-xs font-medium text-gray-500 dark:text-white/40 shrink-0">
                System Prompt
              </label>
              <select
                value={selectedPromptId ?? ""}
                onChange={(e) => setSelectedPromptId(e.target.value || null)}
                className="text-[11px] md:text-xs bg-black/5 dark:bg-black/20 border-[0.5px] border-black/10 dark:border-white/10 rounded-full px-3 py-1.5 text-gray-700 dark:text-white/80 outline-none focus:border-[#0A84FF] transition-colors cursor-pointer"
              >
                <option value="">None</option>
                {systemPrompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <MessageList
            messages={messages}
            activeBranch={activeBranch}
            isStreaming={isStreaming}
            isStreamingHere={isStreamingHere}
            onSelectPrompt={setPendingPrompt}
            onRetry={(messageId) =>
              retryMessage(
                messageId,
                activeConversation?.model ?? defaultModel,
                storageMode,
                effectiveSystemPrompt,
              )
            }
            onEdit={(messageId, content) =>
              activeConversation &&
              editMessage(
                activeConversation.id,
                activeConversation.model ?? defaultModel,
                content,
                messageId,
                storageMode,
                effectiveSystemPrompt,
              )
            }
            onDelete={(messageId) => deleteMessage(messageId)}
            activeVersions={activeVersions}
            onVersionChange={setActiveVersion}
          />
          <ChatInput
            onSend={handleSend}
            value={inputValue}
            onChange={handleInputChange}
            isGenerating={isStreaming}
            isStreamingHere={isStreamingHere}
            streamingStorageMode={streamingStorageMode}
            disabled={false}
            initialValue={pendingPrompt}
            onClearInitialValue={() => setPendingPrompt("")}
            onAbort={stopGeneration}
          />
        </main>

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          storageMode={storageMode}
          onStorageModeChange={handleStorageToggle}
          defaultModel={defaultModel}
          onDefaultModelChange={handleDefaultModelChange}
          systemPrompts={systemPrompts}
          syncSettings={syncSettings}
          onSyncSettingsChange={(sync) => {
            setSyncSettings(sync);
            localStorage.setItem(SYNC_SETTINGS_KEY, String(sync));
          }}
          onAddSystemPrompt={handleAddSystemPrompt}
          onUpdateSystemPrompt={handleUpdateSystemPrompt}
          onDeleteSystemPrompt={handleDeleteSystemPrompt}
          models={models}
          onClearConversations={handleClearConversations}
          onExportWorkspace={handleExportWorkspace}
          onImportWorkspace={handleImportWorkspace}
          theme={theme}
          onThemeChange={setTheme}
          refreshModels={refreshModels}
          tempExpiry={tempExpiry}
          onTempExpiryChange={handleTempExpiryChange}
        />
      </div>
      <ToastContainer />
    </div>
  );
}
