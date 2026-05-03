import { useEffect, useRef, useState } from "react";
import type { Model } from "../hooks/useModels";
import type { StorageMode } from "../storage";
import ModelPicker from "./ModelPicker";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  storageMode: StorageMode;
  onStorageModeChange: (mode: StorageMode) => void;
  defaultModel: string;
  onDefaultModelChange: (model: string, sync: boolean) => void;
  systemPrompt: string;
  syncSettings: boolean;
  onSystemPromptChange: (prompt: string, sync: boolean) => void;
  models: Model[];
  onClearConversations: (mode: StorageMode) => void;
  onExportWorkspace: (scope: "local" | "cloud" | "both") => Promise<void>;
  onImportWorkspace: (file: File, onProgress: (msg: string) => void) => Promise<void>;
  theme: "system" | "light" | "dark";
  onThemeChange: (theme: "system" | "light" | "dark") => void;
}

export default function SettingsModal({
  open,
  onClose,
  storageMode,
  onStorageModeChange,
  defaultModel,
  onDefaultModelChange,
  systemPrompt,
  syncSettings,
  onSystemPromptChange,
  models,
  onClearConversations,
  onExportWorkspace,
  onImportWorkspace,
  theme,
  onThemeChange,
}: SettingsModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local draft state — only committed on Save
  const [draftStorageMode, setDraftStorageMode] = useState<StorageMode>(storageMode);
  const [draftModel, setDraftModel] = useState(defaultModel);
  const [draftSystemPrompt, setDraftSystemPrompt] = useState(systemPrompt);
  const [draftSyncSettings, setDraftSyncSettings] = useState(syncSettings);
  const [isExporting, setIsExporting] = useState(false);
  const [exportScope, setExportScope] = useState<"local" | "cloud" | "both">("both");
  const [showExportSelector, setShowExportSelector] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  // Sync draft with props when modal opens
  useEffect(() => {
    if (open) {
      setDraftStorageMode(storageMode);
      setDraftModel(defaultModel);
      setDraftSystemPrompt(systemPrompt);
      setDraftSyncSettings(syncSettings);
    }
  }, [open, storageMode, defaultModel, systemPrompt, syncSettings]);

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
    onSystemPromptChange(draftSystemPrompt, draftSyncSettings);
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
      alert("Workspace imported successfully!");
    } catch (e: any) {
      setImportProgress(null);
      setPendingImportFile(null);
      alert(e.message || "Failed to import workspace");
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
      <div className="w-full max-w-3xl bg-white/95 dark:bg-[#1e1e20]/95 backdrop-blur-2xl border-[0.5px] border-black/10 dark:border-white/10 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.5)] overflow-hidden max-h-[90vh] flex flex-col">
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

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-black/10 dark:[&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className="flex flex-col md:flex-row gap-10">
            {/* Left Column: Preferences */}
            <div className="flex-[1.3] space-y-8">
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
                    Preferences
                  </h3>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={draftSyncSettings}
                        onChange={(e) => setDraftSyncSettings(e.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="w-8 h-4 bg-black/10 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#0A84FF]"></div>
                    </div>
                    <span className="text-[11px] md:text-xs font-medium text-gray-500 dark:text-white/40 group-hover:text-gray-900 dark:group-hover:text-white/80 transition-colors">
                      Sync Settings to Cloud
                    </span>
                  </label>
                </div>
                <div className="space-y-5">
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
                      Storage Mode
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

                  {/* System prompt */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[13px] md:text-sm font-medium text-gray-700 dark:text-white/80">
                        System Prompt
                      </label>
                    </div>
                    <textarea
                      value={draftSystemPrompt}
                      onChange={(e) => setDraftSystemPrompt(e.target.value)}
                      placeholder="You are a helpful assistant..."
                      rows={10}
                      className="w-full text-base md:text-sm bg-black/5 dark:bg-black/20 border-[0.5px] border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-gray-900 dark:text-white/95 placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none focus:border-[#0A84FF] focus:bg-white dark:focus:bg-black/30 transition-colors resize-none [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-black/10 dark:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full"
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-white/40">
                      Applied to all new conversations.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* Vertical Divider */}
            <div className="hidden md:block w-[1px] bg-black/10 dark:bg-white/10 shrink-0" />

            {/* Right Column: Model, Conversations & Data Management */}
            <div className="flex-1 space-y-8">
              {/* Default Model */}
              <section>
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
                <p className="mt-1.5 text-xs text-gray-500 dark:text-white/40">
                  Fallback for existing chats and default for new ones.
                </p>
              </section>

              {/* Conversations */}
              <section>
                <h3 className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40 mb-4">
                  Conversations
                </h3>
                <div className="space-y-3">
                  {/* Cloud */}
                  <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-white/60 dark:bg-white/5 border-[0.5px] border-black/10 dark:border-white/10">
                    <div>
                      <p className="text-[13px] md:text-sm font-medium text-gray-900 dark:text-white/95">
                        Cloud (D1)
                      </p>
                      <p className="text-[11px] md:text-xs text-gray-500 dark:text-white/40 mt-0.5">
                        Stored in Cloudflare D1
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
                        Stored in browser localStorage
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
              </section>

              {/* Data Management */}
              <section>
                <h3 className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40 mb-4">
                  Data Management
                </h3>
                <div className="space-y-3">
                  <div className="flex flex-col py-3 px-4 rounded-xl bg-white/60 dark:bg-white/5 border-[0.5px] border-black/10 dark:border-white/10">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[13px] md:text-sm font-medium text-gray-900 dark:text-white/95">
                          Export Workspace
                        </p>
                        <p className="text-[11px] md:text-xs text-gray-500 dark:text-white/40 mt-0.5">
                          Download all data as a ZIP file
                        </p>
                      </div>
                      <button
                        onClick={handleExportClick}
                        disabled={isExporting || importProgress !== null}
                        className="text-[11px] md:text-xs font-medium text-gray-700 dark:text-white/80 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 border-[0.5px] border-black/10 dark:border-white/20 rounded-full px-3 py-1.5 transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
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

                  <div className="flex flex-col py-3 px-4 rounded-xl bg-white/60 dark:bg-white/5 border-[0.5px] border-black/10 dark:border-white/10">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[13px] md:text-sm font-medium text-gray-900 dark:text-white/95">
                          Import Workspace
                        </p>
                        <p className="text-[11px] md:text-xs text-gray-500 dark:text-white/40 mt-0.5">
                          Restore from WaiChat or ChatGPT ZIP
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
                          className="text-[11px] md:text-xs font-medium text-gray-700 dark:text-white/80 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 border-[0.5px] border-black/10 dark:border-white/20 rounded-full px-3 py-1.5 transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
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
              </section>
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
    </div>
  );
}
