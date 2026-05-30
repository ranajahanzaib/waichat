import { useEffect, useRef, useState } from "react";
import type { SystemPrompt } from "../App";
import type { Model } from "../hooks/useModels";
import { useToast } from "../hooks/useToast";
import type { StorageMode } from "../storage";
import CloudflareHelpModal from "./CloudflareHelpModal";
import ModelPicker from "./ModelPicker";
import SecretKeyGuideModal from "./SecretKeyGuideModal";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  storageMode: StorageMode;
  onStorageModeChange: (mode: StorageMode) => void;
  defaultModel: string;
  onDefaultModelChange: (model: string, sync: boolean) => void;
  systemPrompts: SystemPrompt[];
  syncSettings: boolean;
  onSyncSettingsChange: (sync: boolean) => void;
  onAddSystemPrompt: (name: string, content: string) => Promise<void>;
  onUpdateSystemPrompt: (id: string, name: string, content: string) => Promise<void>;
  onDeleteSystemPrompt: (id: string) => Promise<void>;
  models: Model[];
  onClearConversations: (mode: StorageMode) => void;
  onExportWorkspace: (scope: "local" | "cloud" | "both") => Promise<void>;
  onImportWorkspace: (file: File, onProgress: (msg: string) => void) => Promise<void>;
  theme: "system" | "light" | "dark";
  onThemeChange: (theme: "system" | "light" | "dark") => void;
  refreshModels: (newModels?: Model[]) => void;
  tempExpiry: string;
  onTempExpiryChange: (expiry: string) => void;
}

interface SecretsStatus {
  accountId: string | null;
  hasToken: boolean;
  isConfigurable: boolean;
}

export default function SettingsModal({
  open,
  onClose,
  storageMode,
  onStorageModeChange,
  defaultModel,
  onDefaultModelChange,
  systemPrompts,
  syncSettings,
  onSyncSettingsChange,
  onAddSystemPrompt,
  onUpdateSystemPrompt,
  onDeleteSystemPrompt,
  models,
  onClearConversations,
  onExportWorkspace,
  onImportWorkspace,
  theme,
  onThemeChange,
  refreshModels,
  tempExpiry,
  onTempExpiryChange,
}: SettingsModalProps) {
  const toast = useToast();
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local draft state — only committed on Save
  const [draftStorageMode, setDraftStorageMode] = useState<StorageMode>(storageMode);
  const [draftModel, setDraftModel] = useState(defaultModel);
  const [draftSyncSettings, setDraftSyncSettings] = useState(syncSettings);

  // Prompt library state
  const [newPromptName, setNewPromptName] = useState("");
  const [newPromptContent, setNewPromptContent] = useState("");
  const [editingPrompt, setEditingPrompt] = useState<SystemPrompt | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeletePromptId, setConfirmDeletePromptId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [isDeletingPromptId, setIsDeletingPromptId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportScope, setExportScope] = useState<"local" | "cloud" | "both">("both");
  const [showExportSelector, setShowExportSelector] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  // Cloudflare AI Secrets State
  const [secretsStatus, setSecretsStatus] = useState<SecretsStatus>({
    accountId: null,
    hasToken: false,
    isConfigurable: false,
  });
  const [cfAccountId, setCfAccountId] = useState("");
  const [cfApiToken, setCfApiToken] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showKeyGuideModal, setShowKeyGuideModal] = useState(false);
  const [showAccountHelp, setShowAccountHelp] = useState(false);
  const [showTokenHelp, setShowTokenHelp] = useState(false);

  const fetchSecretsStatus = async () => {
    try {
      const res = await fetch("/api/secrets");
      if (res.ok) {
        const data = (await res.json()) as SecretsStatus;
        setSecretsStatus(data);
      }
    } catch (e) {
      console.error("Failed to fetch secrets status:", e);
    }
  };

  const handleConnect = async () => {
    if (!cfAccountId || !cfApiToken) {
      toast.warning("Account ID and API Token are required");
      return;
    }
    setIsConnecting(true);
    try {
      const res = await fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: cfAccountId, apiToken: cfApiToken }),
      });
      const data = (await res.json()) as { error?: string; models?: Model[] };
      if (!res.ok) throw new Error(data.error || "Failed to connect");

      toast.success("Connected successfully! Models updated.");
      setCfAccountId("");
      setCfApiToken("");
      await fetchSecretsStatus();
      if (data.models) {
        refreshModels(data.models);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleReset = async () => {
    if (
      !confirm(
        "Are you sure you want to reset Cloudflare AI credentials? This will revert to the default model list.",
      )
    ) {
      return;
    }
    setIsResetting(true);
    try {
      const res = await fetch("/api/secrets", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to reset");

      toast.success("Credentials reset successfully.");
      await fetchSecretsStatus();
      refreshModels(); // Force-fetch static list
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsResetting(false);
    }
  };
  const [activeTab, setActiveTab] = useState<"general" | "models" | "prompt" | "data">("general");

  const tabs = [
    { id: "general", label: "General" },
    { id: "models", label: "Models" },
    { id: "prompt", label: "System Prompt" },
    { id: "data", label: "Data" },
  ] as const;

  // Sync draft with props when modal opens
  useEffect(() => {
    if (open) {
      setDraftStorageMode(storageMode);
      setDraftModel(defaultModel);
      setDraftSyncSettings(syncSettings);
      fetchSecretsStatus();
      setActiveTab("general");
      setNewPromptName("");
      setNewPromptContent("");
      setEditingPrompt(null);
      setConfirmDeletePromptId(null);
    }
  }, [open, storageMode, defaultModel, syncSettings]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
    };
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    onStorageModeChange(draftStorageMode);
    onDefaultModelChange(draftModel, draftSyncSettings);
    onSyncSettingsChange(draftSyncSettings);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const handleExportClick = () => {
    setShowExportSelector(true);
  };

  const confirmExport = async () => {
    setShowExportSelector(false);
    setIsExporting(true);
    try {
      await onExportWorkspace(exportScope);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingImportFile(file);
      setShowImportConfirm(true);
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (!pendingImportFile) return;
    setShowImportConfirm(false);
    setImportProgress("Starting import...");
    try {
      await onImportWorkspace(pendingImportFile, setImportProgress);
      setImportProgress(null);
      setPendingImportFile(null);
      toast.success("Workspace imported successfully!");
    } catch (e: any) {
      setImportProgress(null);
      setPendingImportFile(null);
      toast.error(e.message || "Failed to import workspace");
    }
  };

  const cancelImport = () => {
    setShowImportConfirm(false);
    setPendingImportFile(null);
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-sm p-4 transition-opacity"
      onClick={(e) => {
        if (e.target === overlayRef.current) handleCancel();
      }}
    >
      <div className="w-full max-w-4xl bg-white/95 dark:bg-[#1e1e20]/95 backdrop-blur-2xl border-[0.5px] border-black/10 dark:border-white/10 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.5)] overflow-hidden h-[600px] max-h-[90vh] flex flex-col transition-all">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-[0.5px] border-black/10 dark:border-white/10 shrink-0">
          <h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white/95 tracking-tight">
            Settings
          </h2>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-900 dark:text-white/40 dark:hover:text-white/95 transition-colors focus:outline-none"
            aria-label="Close settings"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 stroke-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main Body with Sidebar/Tabs */}
        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden bg-black/[0.02] dark:bg-white/[0.02]">
          {/* Sidebar / Top Nav */}
          <div className="flex sm:flex-col overflow-x-auto sm:overflow-x-visible sm:w-48 shrink-0 border-b-[0.5px] sm:border-b-0 sm:border-r-[0.5px] border-black/10 dark:border-white/10 scrollbar-none">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 sm:flex-none px-6 py-4 sm:py-3.5 text-[13px] md:text-sm font-medium transition-all text-center sm:text-left relative whitespace-nowrap ${
                  activeTab === tab.id
                    ? "text-[#0A84FF] sm:bg-[#0A84FF]/10"
                    : "text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white/80 hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <>
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0A84FF] sm:hidden" />
                    <div className="absolute top-0 bottom-0 left-0 w-1 bg-[#0A84FF] hidden sm:block" />
                  </>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content Area */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-black/10 dark:[&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="max-w-2xl">
              {activeTab === "general" && (
                <section className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div>
                    <h3 className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40 mb-4">
                      Preferences
                    </h3>
                    <div className="space-y-6">
                      {/* Theme Segmented Control */}
                      <div>
                        <label className="block text-[13px] md:text-sm font-medium text-gray-700 dark:text-white/80 mb-2">
                          Theme
                        </label>
                        <div className="flex rounded-full bg-black/5 dark:bg-black/20 p-1 border-[0.5px] border-black/5 dark:border-white/10">
                          {(["system", "light", "dark"] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => onThemeChange(t)}
                              className={`flex-1 py-1.5 text-[13px] md:text-sm font-medium rounded-full transition-all duration-200 capitalize ${
                                theme === t
                                  ? "bg-white dark:bg-white/15 text-gray-900 dark:text-white/95 shadow-sm"
                                  : "text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-white/65 dark:hover:text-white/95 dark:hover:bg-white/5"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Storage mode Segmented Control */}
                      <div>
                        <label className="block text-[13px] md:text-sm font-medium text-gray-700 dark:text-white/80 mb-2">
                          Default Storage Mode
                        </label>
                        <div className="flex rounded-full bg-black/5 dark:bg-black/20 p-1 border-[0.5px] border-black/5 dark:border-white/10">
                          {(["cloud", "local"] as StorageMode[]).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setDraftStorageMode(mode)}
                              className={`flex-1 py-1.5 text-[13px] md:text-sm font-medium rounded-full transition-all duration-200 ${
                                draftStorageMode === mode
                                  ? "bg-white dark:bg-white/15 text-gray-900 dark:text-white/95 shadow-sm"
                                  : "text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-white/65 dark:hover:text-white/95 dark:hover:bg-white/5"
                              }`}
                            >
                              {mode === "cloud" ? "Cloud (D1)" : "Local (Browser)"}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-gray-500 dark:text-white/40 leading-relaxed">
                          {draftStorageMode === "cloud"
                            ? "Conversations saved to Cloudflare D1. Persists across devices."
                            : "Conversations saved in your browser. Never leaves your device."}
                        </p>
                      </div>

                      {/* Temporary Chat Expiration */}
                      <div>
                        <label className="block text-[13px] md:text-sm font-medium text-gray-700 dark:text-white/80 mb-2">
                          Temporary Chat Expiration
                        </label>
                        <div className="flex rounded-full bg-black/5 dark:bg-black/20 p-1 border-[0.5px] border-black/5 dark:border-white/10">
                          {(["instant", "1h", "6h", "24h"] as const).map((expiry) => (
                            <button
                              key={expiry}
                              onClick={() => {
                                onTempExpiryChange(expiry);
                              }}
                              className={`flex-1 py-1.5 text-[13px] md:text-sm font-medium rounded-full transition-all duration-200 capitalize ${
                                tempExpiry === expiry
                                  ? "bg-white dark:bg-white/15 text-gray-900 dark:text-white/95 shadow-sm"
                                  : "text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-white/65 dark:hover:text-white/95 dark:hover:bg-white/5"
                              }`}
                            >
                              {expiry === "instant"
                                ? "Instant"
                                : expiry === "1h"
                                  ? "1 Hour"
                                  : expiry === "6h"
                                    ? "6 Hours"
                                    : "24 Hours"}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-gray-500 dark:text-white/40 leading-relaxed">
                          {tempExpiry === "24h"
                            ? "Temporary chats expire and are deleted after 24 hours."
                            : tempExpiry === "6h"
                              ? "Temporary chats expire and are deleted after 6 hours."
                              : tempExpiry === "instant"
                                ? "Temporary chats are deleted as soon as the session ends."
                                : "Temporary chats expire and are deleted after 1 hour."}
                        </p>
                      </div>

                      {/* Sync Settings */}
                      <div className="flex items-center justify-between py-1">
                        <div>
                          <p className="text-[13px] md:text-sm font-medium text-gray-900 dark:text-white/95">
                            Sync Settings to Cloud
                          </p>
                          <p className="text-[11px] md:text-xs text-gray-500 dark:text-white/40 mt-0.5">
                            Auto-sync prompt and model preferences
                          </p>
                        </div>
                        <label className="relative flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draftSyncSettings}
                            onChange={(e) => setDraftSyncSettings(e.target.checked)}
                            className="peer sr-only"
                          />
                          <div className="w-9 h-5 bg-black/10 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0A84FF]"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === "models" && (
                <section className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Default Model */}
                  <div>
                    <h3 className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40 mb-4">
                      Default Model
                    </h3>
                    <div className="w-full bg-black/5 dark:bg-black/20 border-[0.5px] border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 focus-within:border-[#0A84FF] focus-within:bg-white dark:focus-within:bg-black/30 transition-colors">
                      <ModelPicker
                        models={models}
                        value={draftModel}
                        onChange={setDraftModel}
                        className="w-full"
                      />
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-white/40">
                      Fallback for existing chats and default for new ones.
                    </p>
                  </div>

                  {/* Model Source Configuration */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                        Model Source
                      </h3>
                      {secretsStatus.hasToken && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-green-500 uppercase tracking-tighter bg-green-500/10 px-1.5 py-0.5 rounded">
                          <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse"></div>
                          Connected
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-white/30 mb-4 italic">
                      Access the full Workers AI model catalog with a read-only API token.
                    </p>

                    {!secretsStatus.isConfigurable ? (
                      <div className="flex items-center justify-between py-2 px-1">
                        <div className="flex items-center gap-2 text-red-500 dark:text-red-400">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            className="w-4 h-4 stroke-[2.5]"
                          >
                            <path
                              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <p className="text-[13px] font-medium tracking-tight">
                            SECRET_KEY is not configured.
                          </p>
                        </div>
                        <button
                          onClick={() => setShowKeyGuideModal(true)}
                          className="text-[12px] font-semibold text-gray-500 hover:text-gray-900 dark:text-white/40 dark:hover:text-white/90 transition-colors focus:outline-none"
                        >
                          How to fix this →
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between ml-1">
                            <label className="block text-[11px] font-medium text-gray-500 dark:text-white/40">
                              Account ID
                            </label>
                            <button
                              onClick={() => setShowAccountHelp(true)}
                              className="text-[10px] font-semibold text-[#0A84FF] hover:underline"
                            >
                              Where do I find this?
                            </button>
                          </div>
                          <input
                            type="text"
                            value={cfAccountId}
                            onChange={(e) => setCfAccountId(e.target.value)}
                            placeholder={secretsStatus.accountId || "Your Cloudflare Account ID"}
                            className="w-full text-[13px] bg-black/5 dark:bg-black/20 border-[0.5px] border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-gray-900 dark:text-white/95 placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none focus:border-[#0A84FF] transition-colors"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between ml-1">
                            <label className="block text-[11px] font-medium text-gray-500 dark:text-white/40">
                              API Token (Workers AI Read)
                            </label>
                            <button
                              onClick={() => setShowTokenHelp(true)}
                              className="text-[10px] font-semibold text-[#0A84FF] hover:underline"
                            >
                              How to create this?
                            </button>
                          </div>
                          <input
                            type="password"
                            value={cfApiToken}
                            onChange={(e) => setCfApiToken(e.target.value)}
                            placeholder={
                              secretsStatus.hasToken ? "••••••••••••••••" : "Your API Token"
                            }
                            className="w-full text-[13px] bg-black/5 dark:bg-black/20 border-[0.5px] border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-gray-900 dark:text-white/95 placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none focus:border-[#0A84FF] transition-colors"
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={handleConnect}
                            disabled={isConnecting || !cfAccountId || !cfApiToken}
                            className="flex-1 text-[11px] md:text-xs font-medium text-white bg-[#0A84FF] hover:bg-[#0070E0] disabled:opacity-50 disabled:bg-gray-400 rounded-full px-3 py-2 transition-all focus:outline-none"
                          >
                            {isConnecting
                              ? "Validating..."
                              : secretsStatus.hasToken
                                ? "Update Credentials"
                                : "Connect & Refresh"}
                          </button>
                          {secretsStatus.hasToken && (
                            <button
                              onClick={handleReset}
                              disabled={isResetting}
                              className="text-[11px] md:text-xs font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 border-[0.5px] border-red-500/30 rounded-full px-3 py-2 transition-all focus:outline-none"
                            >
                              {isResetting ? "Resetting..." : "Reset"}
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500 dark:text-white/30 leading-tight px-1 italic">
                          Tokens are encrypted and stored in your D1 database. Ensure your token has{" "}
                          <strong>Workers AI Read</strong> permissions.
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {activeTab === "prompt" && (
                <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div>
                    <h3 className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40 mb-4">
                      Saved Prompts
                    </h3>

                    {systemPrompts.length === 0 ? (
                      <p className="text-[13px] text-gray-400 dark:text-white/30 italic">
                        No saved prompts yet. Add one below.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {systemPrompts.map((prompt) =>
                          editingPrompt?.id === prompt.id ? (
                            <div
                              key={prompt.id}
                              className="p-3 rounded-xl bg-white/60 dark:bg-white/5 border-[0.5px] border-[#0A84FF]/40 space-y-2"
                            >
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                maxLength={100}
                                className="w-full text-[13px] bg-black/5 dark:bg-black/20 border-[0.5px] border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-gray-900 dark:text-white/95 outline-none focus:border-[#0A84FF] transition-colors"
                                placeholder="Prompt name"
                              />
                              <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                rows={4}
                                maxLength={10000}
                                className="w-full text-[13px] bg-black/5 dark:bg-black/20 border-[0.5px] border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-gray-900 dark:text-white/95 placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none focus:border-[#0A84FF] transition-colors resize-none"
                                placeholder="Prompt content..."
                              />
                              <div className="flex gap-2">
                                <button
                                  disabled={isSavingPrompt || !editName.trim() || !editContent.trim()}
                                  onClick={async () => {
                                    setIsSavingPrompt(true);
                                    try {
                                      await onUpdateSystemPrompt(prompt.id, editName, editContent);
                                      setEditingPrompt(null);
                                    } catch {
                                      toast.error("Failed to update prompt");
                                    } finally {
                                      setIsSavingPrompt(false);
                                    }
                                  }}
                                  className="text-[11px] font-medium text-white bg-[#0A84FF] hover:bg-[#0070E0] disabled:opacity-50 rounded-full px-3 py-1.5 transition-all focus:outline-none"
                                >
                                  {isSavingPrompt ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={() => setEditingPrompt(null)}
                                  className="text-[11px] font-medium text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white/90 rounded-full px-3 py-1.5 transition-all focus:outline-none"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              key={prompt.id}
                              className="rounded-xl bg-white/60 dark:bg-white/5 border-[0.5px] border-black/10 dark:border-white/10 overflow-hidden"
                            >
                              <div className="flex items-start justify-between gap-3 py-3 px-4">
                                <div className="min-w-0 flex-1">
                                  <p className="text-[13px] md:text-sm font-medium text-gray-900 dark:text-white/95 truncate">
                                    {prompt.name}
                                  </p>
                                  <p className="text-[11px] md:text-xs text-gray-500 dark:text-white/40 mt-0.5 line-clamp-2">
                                    {prompt.content}
                                  </p>
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                  <button
                                    onClick={() => {
                                      setEditingPrompt(prompt);
                                      setEditName(prompt.name);
                                      setEditContent(prompt.content);
                                    }}
                                    className="text-[11px] font-medium text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white/90 hover:bg-black/5 dark:hover:bg-white/10 rounded-full px-2.5 py-1 transition-all focus:outline-none"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    disabled={isDeletingPromptId === prompt.id}
                                    onClick={() => setConfirmDeletePromptId(prompt.id)}
                                    className="text-[11px] font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 rounded-full px-2.5 py-1 transition-all focus:outline-none"
                                  >
                                    {isDeletingPromptId === prompt.id ? "Deleting..." : "Delete"}
                                  </button>
                                </div>
                              </div>
                              {confirmDeletePromptId === prompt.id && (
                                <div className="px-4 pb-3 pt-1 border-t-[0.5px] border-red-200 dark:border-red-500/20 bg-red-50/60 dark:bg-red-500/10">
                                  <p className="text-[11px] md:text-xs text-red-600 dark:text-red-400 font-medium mb-2">
                                    Delete &ldquo;{prompt.name}&rdquo;? This cannot be undone.
                                  </p>
                                  <div className="flex gap-2">
                                    <button
                                      disabled={isDeletingPromptId === prompt.id}
                                      onClick={async () => {
                                        setIsDeletingPromptId(prompt.id);
                                        try {
                                          await onDeleteSystemPrompt(prompt.id);
                                          setConfirmDeletePromptId(null);
                                          toast.success("Prompt deleted!");
                                        } catch {
                                          toast.error("Failed to delete prompt");
                                        } finally {
                                          setIsDeletingPromptId(null);
                                        }
                                      }}
                                      className="text-[11px] font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-full px-3 py-1 transition-colors focus:outline-none"
                                    >
                                      {isDeletingPromptId === prompt.id ? "Deleting..." : "Yes, delete"}
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeletePromptId(null)}
                                      className="text-[11px] font-medium text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white/90 hover:bg-black/5 dark:hover:bg-white/10 rounded-full px-3 py-1 transition-colors focus:outline-none"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40 mb-4">
                      Add Prompt
                    </h3>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={newPromptName}
                        onChange={(e) => setNewPromptName(e.target.value)}
                        maxLength={100}
                        placeholder="Name (e.g. Code Reviewer)"
                        className="w-full text-[13px] bg-black/5 dark:bg-black/20 border-[0.5px] border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-gray-900 dark:text-white/95 placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none focus:border-[#0A84FF] focus:bg-white dark:focus:bg-black/30 transition-colors"
                      />
                      <textarea
                        value={newPromptContent}
                        onChange={(e) => setNewPromptContent(e.target.value)}
                        placeholder="You are a helpful assistant..."
                        rows={5}
                        maxLength={10000}
                        className="w-full text-base md:text-sm bg-black/5 dark:bg-black/20 border-[0.5px] border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white/95 placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none focus:border-[#0A84FF] focus:bg-white dark:focus:bg-black/30 transition-colors resize-none [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-black/10 dark:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full"
                      />
                      <button
                        disabled={isSavingPrompt || !newPromptName.trim() || !newPromptContent.trim()}
                        onClick={async () => {
                          setIsSavingPrompt(true);
                          try {
                            await onAddSystemPrompt(newPromptName, newPromptContent);
                            setNewPromptName("");
                            setNewPromptContent("");
                            toast.success("Prompt saved!");
                          } catch {
                            toast.error("Failed to save prompt");
                          } finally {
                            setIsSavingPrompt(false);
                          }
                        }}
                        className="text-[11px] md:text-xs font-medium text-white bg-[#0A84FF] hover:bg-[#0070E0] disabled:opacity-50 disabled:bg-gray-400 rounded-full px-4 py-2 transition-all focus:outline-none"
                      >
                        {isSavingPrompt ? "Saving..." : "Add Prompt"}
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === "data" && (
                <section className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Conversations */}
                  <div>
                    <h3 className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40 mb-4">
                      Conversations
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Cloud */}
                      <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-white/60 dark:bg-white/5 border-[0.5px] border-black/10 dark:border-white/10">
                        <div>
                          <p className="text-[13px] md:text-sm font-medium text-gray-900 dark:text-white/95">
                            Cloud (D1)
                          </p>
                          <p className="text-[11px] md:text-xs text-gray-500 dark:text-white/40 mt-0.5">
                            Saved to Cloudflare
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm("Delete all cloud conversations? This cannot be undone.")) {
                              onClearConversations("cloud");
                            }
                          }}
                          className="text-[11px] md:text-xs font-medium text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 border-[0.5px] border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-full px-3 py-1.5 transition-all focus:outline-none"
                        >
                          Clear
                        </button>
                      </div>

                      {/* Local */}
                      <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-white/60 dark:bg-white/5 border-[0.5px] border-black/10 dark:border-white/10">
                        <div>
                          <p className="text-[13px] md:text-sm font-medium text-gray-900 dark:text-white/95">
                            Local (Browser)
                          </p>
                          <p className="text-[11px] md:text-xs text-gray-500 dark:text-white/40 mt-0.5">
                            Saved on device
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm("Delete all local conversations? This cannot be undone.")) {
                              onClearConversations("local");
                            }
                          }}
                          className="text-[11px] md:text-xs font-medium text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 border-[0.5px] border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-full px-3 py-1.5 transition-all focus:outline-none"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Data Management */}
                  <div>
                    <h3 className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40 mb-4">
                      Import / Export
                    </h3>
                    <div className="space-y-4">
                      {/* Export */}
                      <div className="flex flex-col py-3 px-4 rounded-xl bg-white/60 dark:bg-white/5 border-[0.5px] border-black/10 dark:border-white/10">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[13px] md:text-sm font-medium text-gray-900 dark:text-white/95">
                              Export Workspace
                            </p>
                            <p className="text-[11px] md:text-xs text-gray-500 dark:text-white/40 mt-0.5">
                              Download everything as ZIP
                            </p>
                          </div>
                          <button
                            onClick={handleExportClick}
                            disabled={isExporting || importProgress !== null}
                            className="text-[11px] md:text-xs font-medium text-gray-700 dark:text-white/80 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 border-[0.5px] border-black/10 dark:border-white/20 rounded-full px-4 py-1.5 transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isExporting ? "Exporting..." : "Export"}
                          </button>
                        </div>
                        {showExportSelector && (
                          <div className="mt-4 pt-3 border-t-[0.5px] border-black/5 dark:border-white/10">
                            <p className="text-xs text-gray-700 dark:text-white/80 font-medium mb-3">
                              Select export scope:
                            </p>
                            <div className="flex flex-col gap-2">
                              {(["local", "cloud", "both"] as const).map((scope) => (
                                <label
                                  key={scope}
                                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                                    exportScope === scope
                                      ? "bg-black/5 dark:bg-white/10"
                                      : "hover:bg-black/5 dark:hover:bg-white/5"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name="exportScope"
                                    value={scope}
                                    checked={exportScope === scope}
                                    onChange={() => setExportScope(scope)}
                                    className="w-3.5 h-3.5 accent-blue-500"
                                  />
                                  <span className="text-xs text-gray-900 dark:text-white/95">
                                    {scope === "local"
                                      ? "Local Only"
                                      : scope === "cloud"
                                        ? "Cloud Only"
                                        : "Both (Local & Cloud)"}
                                  </span>
                                </label>
                              ))}
                              <div className="flex justify-end gap-2 mt-2">
                                <button
                                  onClick={confirmExport}
                                  className="text-[11px] md:text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-full px-3 py-1 transition-colors"
                                >
                                  Confirm Export
                                </button>
                                <button
                                  onClick={() => setShowExportSelector(false)}
                                  className="text-[11px] md:text-xs font-medium text-gray-700 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/10 rounded-full px-3 py-1 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Import */}
                      <div className="flex flex-col py-3 px-4 rounded-xl bg-white/60 dark:bg-white/5 border-[0.5px] border-black/10 dark:border-white/10">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[13px] md:text-sm font-medium text-gray-900 dark:text-white/95">
                              Import Workspace
                            </p>
                            <p className="text-[11px] md:text-xs text-gray-500 dark:text-white/40 mt-0.5">
                              Restore from ZIP backup
                            </p>
                          </div>
                          <div>
                            <input
                              type="file"
                              accept=".zip"
                              className="hidden"
                              ref={fileInputRef}
                              onChange={handleFileChange}
                            />
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isExporting || importProgress !== null}
                              className="text-[11px] md:text-xs font-medium text-gray-700 dark:text-white/80 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 border-[0.5px] border-black/10 dark:border-white/20 rounded-full px-4 py-1.5 transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Import
                            </button>
                          </div>
                        </div>
                        {importProgress && (
                          <div className="mt-3">
                            <p className="text-[11px] md:text-xs text-[#0A84FF] font-medium animate-pulse">
                              {importProgress}
                            </p>
                          </div>
                        )}
                        {showImportConfirm && (
                          <div className="mt-3 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg">
                            <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-2">
                              This will overwrite any existing conversations with matching IDs.
                              Continue?
                            </p>
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={confirmImport}
                                className="text-[11px] md:text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-full px-3 py-1 transition-colors"
                              >
                                Yes, Import
                              </button>
                              <button
                                onClick={cancelImport}
                                className="text-[11px] md:text-xs font-medium text-gray-700 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/10 rounded-full px-3 py-1 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t-[0.5px] border-black/10 dark:border-white/10 flex justify-end gap-3 shrink-0 bg-black/[0.01] dark:bg-white/[0.01]">
          <button
            onClick={handleCancel}
            className="px-5 py-2 text-[13px] md:text-sm font-medium text-gray-700 dark:text-white/80 bg-white/60 dark:bg-white/5 border-[0.5px] border-black/10 dark:border-white/10 hover:bg-white dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white/95 rounded-full transition-all focus:outline-none"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-8 py-2 text-[13px] md:text-sm font-medium text-white bg-[#0A84FF] hover:bg-[#0070E0] rounded-full shadow-[0_2px_8px_rgba(10,132,255,0.2)] dark:shadow-[0_2px_8px_rgba(10,132,255,0.3)] transition-all focus:outline-none"
          >
            Save
          </button>
        </div>
      </div>

      <SecretKeyGuideModal open={showKeyGuideModal} onClose={() => setShowKeyGuideModal(false)} />

      <CloudflareHelpModal
        type="account_id"
        open={showAccountHelp}
        onClose={() => setShowAccountHelp(false)}
      />

      <CloudflareHelpModal
        type="api_token"
        open={showTokenHelp}
        onClose={() => setShowTokenHelp(false)}
      />
    </div>
  );
}
