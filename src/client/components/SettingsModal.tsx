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
  theme,
  onThemeChange,
}: SettingsModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Local draft state — only committed on Save
  const [draftStorageMode, setDraftStorageMode] = useState<StorageMode>(storageMode);
  const [draftModel, setDraftModel] = useState(defaultModel);
  const [draftSystemPrompt, setDraftSystemPrompt] = useState(systemPrompt);
  const [draftSyncSettings, setDraftSyncSettings] = useState(syncSettings);

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

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-sm p-4 transition-opacity"
      onClick={(e) => {
        if (e.target === overlayRef.current) handleCancel();
      }}
    >
      <div className="w-full max-w-md bg-white/95 dark:bg-[#1e1e20]/95 backdrop-blur-2xl border-[0.5px] border-black/10 dark:border-white/10 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.5)] overflow-hidden max-h-[90vh] flex flex-col">
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
        <div className="overflow-y-auto flex-1 px-6 py-6 space-y-8 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-black/10 dark:[&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
          {/* Preferences */}
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

              {/* Default model */}
              <div>
                <label className="block text-[13px] md:text-sm font-medium text-gray-700 dark:text-white/80 mb-2">
                  Default Model
                </label>
                {/* Wrapper provides the input-box styling, ModelPicker stays transparent inside! */}
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
                  rows={4}
                  className="w-full text-base md:text-sm bg-black/5 dark:bg-black/20 border-[0.5px] border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-gray-900 dark:text-white/95 placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none focus:border-[#0A84FF] focus:bg-white dark:focus:bg-black/30 transition-colors resize-none [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-black/10 dark:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full"
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-white/40">
                  Applied to all new conversations.
                </p>
              </div>
            </div>
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
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t-[0.5px] border-black/10 dark:border-white/10 flex gap-3 shrink-0 bg-black/[0.02] dark:bg-white/[0.02]">
          <button
            onClick={handleCancel}
            className="flex-1 py-2.5 text-[13px] md:text-sm font-medium text-gray-700 dark:text-white/80 bg-white/60 dark:bg-white/5 border-[0.5px] border-black/10 dark:border-white/10 hover:bg-white dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white/95 rounded-full transition-all focus:outline-none"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 text-[13px] md:text-sm font-medium text-white bg-[#0A84FF] hover:bg-[#0070E0] rounded-full shadow-[0_2px_8px_rgba(10,132,255,0.2)] dark:shadow-[0_2px_8px_rgba(10,132,255,0.3)] transition-all focus:outline-none"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
