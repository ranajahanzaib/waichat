import { useEffect, useRef, useState } from "react";
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
const SYSTEM_PROMPT_KEY = "waichat:system-prompt";
const SYNC_SETTINGS_KEY = "waichat:sync-settings";
const DEFAULT_MODEL_KEY = "waichat:default-model";
export const THEME_KEY = "waichat:theme";
const MOBILE_BREAKPOINT = 768;

export type ThemeMode = "system" | "light" | "dark";

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
  } = useChat(storageMode, pendingSelectionRef);

  const { transferState, initiateMove, executeMove, cancelMove, retryPendingCloudDeletes } =
    useTransfer();

  const { models, refreshModels } = useModels();
  const [defaultModel, setDefaultModel] = useState(
    () => localStorage.getItem(DEFAULT_MODEL_KEY) ?? DEFAULT_MODEL_ID,
  );
  const [systemPrompt, setSystemPrompt] = useState(
    () => localStorage.getItem(SYSTEM_PROMPT_KEY) ?? "",
  );
  const [syncSettings, setSyncSettings] = useState(
    () =>
      (localStorage.getItem(SYNC_SETTINGS_KEY) ??
        localStorage.getItem("waichat:sync-system-prompt")) === "true",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Storage dropdown state for mobile-friendly click toggling
  const [storageDropdownOpen, setStorageDropdownOpen] = useState(false);

  // Sidebar state: Open by default on desktop, closed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return typeof window !== "undefined" ? window.innerWidth >= MOBILE_BREAKPOINT : true;
  });

  useEffect(() => {
    loadConversations();
    retryPendingCloudDeletes();
  }, [loadConversations, retryPendingCloudDeletes]);

  // Sync System Prompt from Cloud if enabled
  useEffect(() => {
    if (syncSettings) {
      fetch("/api/settings/system_prompt")
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch system prompt");
          return res.json() as Promise<{ value?: string }>;
        })
        .then((data) => {
          if (data.value != null && data.value !== systemPrompt) {
            setSystemPrompt(data.value);
            localStorage.setItem(SYSTEM_PROMPT_KEY, data.value);
          }
        })
        .catch((err) => console.error("Cloud sync error (system_prompt):", err));
    }
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
    const currentPath = window.location.pathname;
    if (activeConversation) {
      const expectedPath = `/c/${storageMode}/${activeConversation.id}`;
      if (currentPath !== expectedPath) {
        window.history.pushState({}, "", expectedPath);
      }
    } else if (currentPath !== "/") {
      window.history.pushState({}, "", "/");
    }
  }, [activeConversation, storageMode]);

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
    selectConversation(id);
    closeSidebarOnMobile();
  };

  const handleStorageToggle = (next: StorageMode) => {
    setStorageMode(next);
    setSavedStorageMode(next); // Sync saved mode when manually toggled
    localStorage.setItem(STORAGE_MODE_KEY, next);
    setStorageDropdownOpen(false);
  };

  // Wrapper for new chat with mode support
  const handleNew = async (targetMode: StorageMode = storageMode) => {
    if (targetMode !== storageMode) {
      // User opted to return to their default mode. We toggle state and reset home.
      handleStorageToggle(targetMode);
      clearConversation();
      window.history.pushState({}, "", "/");
    } else {
      // Standard new chat in the current mode
      // Prevent creating multiple empty chats if the current one is already empty
      if (activeConversation && messages.length === 0) {
        closeSidebarOnMobile();
        return;
      }
      await newConversation(defaultModel);
    }
    closeSidebarOnMobile();
  };

  const handleSend = async (content: string) => {
    if (isStreaming) return;
    const currentModel = activeConversation?.model ?? defaultModel;
    if (!activeConversation) {
      const convo = await newConversation(defaultModel);
      await sendMessage(content, defaultModel, convo.id, storageMode, systemPrompt);
    } else {
      await sendMessage(content, currentModel, activeConversation.id, storageMode, systemPrompt);
    }
  };

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

  const handleSystemPromptChange = async (prompt: string, sync: boolean) => {
    setSystemPrompt(prompt);
    localStorage.setItem(SYSTEM_PROMPT_KEY, prompt);

    setSyncSettings(sync);
    localStorage.setItem(SYNC_SETTINGS_KEY, String(sync));

    if (sync) {
      try {
        await fetch("/api/settings/system_prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: prompt }),
        });
      } catch (err) {
        console.error("Failed to sync system prompt to cloud:", err);
      }
    }
  };

  const handleClearConversations = async (mode: StorageMode) => {
    if (mode === "cloud") {
      await fetch("/api/conversations", { method: "DELETE" });
    } else {
      const keys = Object.keys(localStorage).filter(
        (k) => k.startsWith("waichat:conversations") || k.startsWith("waichat:messages:"),
      );
      keys.forEach((k) => localStorage.removeItem(k));
    }
    await loadConversations();
  };

  const handleMoveConversation = async (conversationId: string) => {
    const targetMode: StorageMode = storageMode === "cloud" ? "local" : "cloud";

    try {
      // Prefetch the source data
      await initiateMove(conversationId, storageMode);

      // Execute the move
      const movedId = await executeMove(storageMode, targetMode);

      toast.success(`Chat moved to ${targetMode === "cloud" ? "Cloud" : "Local"} successfully!`);

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
      } = {
        settings: {
          system_prompt: localStorage.getItem(SYSTEM_PROMPT_KEY) || "",
          default_model: localStorage.getItem(DEFAULT_MODEL_KEY) || "",
        },
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
        if (data.settings.system_prompt) {
          await handleSystemPromptChange(data.settings.system_prompt, syncSettings);
        }
        if (data.settings.default_model) {
          await handleDefaultModelChange(data.settings.default_model, syncSettings);
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
          onSettingsOpen={() => setSettingsOpen(true)}
          currentMode={storageMode}
          savedMode={savedStorageMode}
          isStreaming={isStreaming}
          movingConversationId={transferState.conversationId}
        />

        <main className="flex flex-col flex-1 min-w-0 h-full">
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
                  storageMode === "cloud"
                    ? "bg-brand-cloud/10 hover:bg-brand-cloud/20 dark:bg-brand-cloud/15 dark:hover:bg-brand-cloud/25"
                    : "bg-brand-local/10 hover:bg-brand-local/20 dark:bg-brand-local/15 dark:hover:bg-brand-local/25"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${storageMode === "cloud" ? "bg-brand-cloud" : "bg-brand-local"}`}
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
                  className="flex items-center gap-2 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 border-[0.5px] border-black/5 dark:border-white/10 rounded-full px-3 py-1.5 text-gray-700 hover:text-gray-900 dark:text-white/65 dark:hover:text-white/95 text-xs md:text-sm font-medium cursor-pointer transition-all focus:outline-none"
                  aria-expanded={storageDropdownOpen}
                >
                  {storageMode === "cloud" ? (
                    <div className="w-2 h-2 rounded-full bg-brand-cloud shadow-sm shadow-brand-cloud/30 dark:shadow-brand-cloud/50"></div>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-brand-local shadow-sm shadow-brand-local/30 dark:shadow-brand-local/50"></div>
                  )}
                  {storageMode === "cloud" ? "Cloud" : "Local"}
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
                  {(["cloud", "local"] as StorageMode[]).map((mode) => (
                    <button
                      key={mode}
                      role="menuitem"
                      onClick={() => handleStorageToggle(mode)}
                      className={`w-full flex flex-col items-start px-3 py-2.5 text-left rounded-xl transition-all duration-200 cursor-pointer ${
                        storageMode === mode
                          ? mode === "cloud"
                            ? "bg-brand-cloud/10 dark:bg-brand-cloud/20"
                            : "bg-brand-local/10 dark:bg-brand-local/20"
                          : "hover:bg-black/5 dark:hover:bg-white/10"
                      }`}
                    >
                      <p
                        className={`text-[13px] md:text-sm font-medium ${
                          storageMode === mode
                            ? mode === "cloud"
                              ? "text-brand-cloud"
                              : "text-brand-local"
                            : "text-gray-900 dark:text-white/95"
                        }`}
                      >
                        {mode === "cloud" ? "Cloud (D1)" : "Local (Browser)"}
                      </p>
                      <p
                        className={`text-[11px] md:text-xs mt-0.5 ${
                          storageMode === mode
                            ? mode === "cloud"
                              ? "text-brand-cloud/70"
                              : "text-brand-local/70"
                            : "text-gray-500 dark:text-white/40"
                        }`}
                      >
                        {mode === "cloud" ? "Syncs across devices" : "Stays in your browser"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleNew(storageMode)}
                className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-white/65 dark:hover:text-white/95 dark:hover:bg-white/5 transition-colors focus:outline-none"
                title="New Chat"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  className="w-5 h-5 stroke-2"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
            </div>
          </header>

          <MessageList
            messages={messages}
            activeBranch={activeBranch}
            isStreaming={isStreaming}
            onSelectPrompt={setPendingPrompt}
            onRetry={(messageId) =>
              retryMessage(
                messageId,
                activeConversation?.model ?? defaultModel,
                storageMode,
                systemPrompt,
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
                systemPrompt,
              )
            }
            onDelete={(messageId) => deleteMessage(messageId)}
            activeVersions={activeVersions}
            onVersionChange={setActiveVersion}
          />
          <ChatInput
            onSend={handleSend}
            disabled={isStreaming}
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
          systemPrompt={systemPrompt}
          syncSettings={syncSettings}
          onSystemPromptChange={handleSystemPromptChange}
          models={models}
          onClearConversations={handleClearConversations}
          onExportWorkspace={handleExportWorkspace}
          onImportWorkspace={handleImportWorkspace}
          theme={theme}
          onThemeChange={setTheme}
          refreshModels={refreshModels}
        />
      </div>
      <ToastContainer />
    </div>
  );
}
