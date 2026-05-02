import { useEffect, useRef, useState } from "react";
import type { Conversation, StorageMode } from "../storage";
import ConfirmModal from "./ConfirmModal";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: (mode?: StorageMode) => void;
  onDelete: (id: string) => void;
  onMove: (id: string) => void;
  onSettingsOpen: () => void;
  currentMode: StorageMode;
  savedMode: StorageMode;
  isStreaming: boolean;
  movingConversationId: string | null;
}

export default function Sidebar({
  conversations,
  activeId,
  isOpen,
  onClose,
  onSelect,
  onNew,
  onDelete,
  onMove,
  onSettingsOpen,
  currentMode,
  savedMode, // Kept in props to satisfy the interface and App.tsx
  isStreaming,
  movingConversationId,
}: SidebarProps) {
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const [pendingMove, setPendingMove] = useState<Conversation | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetMode: StorageMode = currentMode === "cloud" ? "local" : "cloud";

  const handleTouchStart = (cId: string) => {
    longPressTimer.current = setTimeout(() => {
      setOpenMenuId(cId);
      longPressTimer.current = null;
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuId(null);
    };

    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openMenuId]);

  return (
    <>
      <aside
        className={`absolute md:relative z-30 flex flex-col w-[280px] h-full bg-white/60 dark:bg-[#141416]/60 border-r-[0.5px] border-r-black/10 dark:border-r-white/10 border-l-[3px] shrink-0 transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          currentMode === "cloud" ? "border-l-brand-cloud" : "border-l-brand-local"
        } ${
          isOpen
            ? "translate-x-0"
            : "-translate-x-full md:-ml-[280px] opacity-0 invisible md:visible md:border-l-0 border-r-0"
        }`}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-2 text-base md:text-lg font-semibold text-gray-900 dark:text-white/95 tracking-tight">
            <img width="35" height="35" src="/waichat.webp" alt="WaiChat Logo" />
            WaiChat
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-white/65 dark:hover:text-white/95 dark:hover:bg-white/5 transition-colors focus:outline-none"
            title="Hide Sidebar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 stroke-2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
          </button>
        </div>

        {/* Workspace Storage Switcher (Pill Tabs) */}
        <div className="px-4 pb-4">
          <div className="flex rounded-full bg-black/5 dark:bg-black/20 p-1 border-[0.5px] border-black/5 dark:border-white/10">
            {(["cloud", "local"] as StorageMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  if (currentMode !== mode) onNew(mode);
                }}
                className={`flex-1 py-1.5 text-[13px] md:text-sm font-medium rounded-full transition-all duration-200 ${
                  currentMode === mode
                    ? mode === "cloud"
                      ? "bg-brand-cloud text-white shadow-sm cursor-default"
                      : "bg-brand-local text-gray-900 shadow-sm cursor-default"
                    : "text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-white/65 dark:hover:text-white/95 dark:hover:bg-white/5 cursor-pointer"
                }`}
                title={
                  currentMode === mode
                    ? `${mode === "cloud" ? "Cloud" : "Local"} Workspace`
                    : `Switch to ${mode === "cloud" ? "Cloud" : "Local"} Workspace`
                }
              >
                {mode === "cloud" ? "Cloud" : "Local"}
              </button>
            ))}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-black/10 dark:[&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
          {conversations.length > 0 && (
            <div className="px-4 py-3 pb-2 text-[11px] md:text-xs font-medium text-gray-500 dark:text-white/40 uppercase tracking-wider">
              Recent
            </div>
          )}
          {conversations.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-white/40 text-center mt-10">
              No conversations yet
            </p>
          )}
          {conversations.map((c) => {
            const isMoving = movingConversationId === c.id;
            const isMoveDisabled = isMoving || (activeId === c.id && isStreaming);

            return (
              <div
                key={c.id}
                className={`group flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer text-[13px] md:text-sm transition-all duration-150 ${
                  activeId === c.id
                    ? currentMode === "cloud"
                      ? "bg-brand-cloud text-white font-medium"
                      : "bg-brand-local text-gray-900 font-medium"
                    : "text-gray-600 hover:bg-black/5 hover:text-gray-900 dark:text-white/65 dark:hover:bg-white/5 dark:hover:text-white/95"
                }`}
                onClick={() => onSelect(c.id)}
                onTouchStart={() => handleTouchStart(c.id)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
                onContextMenu={(e) => {
                  if (window.innerWidth < 768) e.preventDefault();
                }}
              >
                <span className="truncate">{c.title}</span>
                <div className="flex items-center shrink-0 ml-2">
                  <div className="relative" ref={openMenuId === c.id ? menuRef : null}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === c.id ? null : c.id);
                      }}
                      className={`p-1.5 rounded-md focus:outline-none transition-all ${
                        openMenuId === c.id
                          ? activeId === c.id
                            ? "bg-white/20 text-white"
                            : "bg-black/5 text-gray-900 dark:bg-white/10 dark:text-white"
                          : activeId === c.id
                            ? currentMode === "cloud"
                              ? "text-white/70 hover:text-white opacity-100"
                              : "text-gray-900/60 hover:text-gray-900 opacity-100"
                            : "text-gray-400 hover:text-gray-900 dark:text-white/40 dark:hover:text-white/95 opacity-0 group-hover:opacity-100"
                      }`}
                      aria-label="Conversation actions"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        className="w-4 h-4"
                      >
                        <circle cx="12" cy="12" r="1" strokeWidth="2" />
                        <circle cx="12" cy="5" r="1" strokeWidth="2" />
                        <circle cx="12" cy="19" r="1" strokeWidth="2" />
                      </svg>
                    </button>

                    {openMenuId === c.id && (
                      <div className="absolute right-0 mt-1 w-44 rounded-xl bg-white dark:bg-[#1c1c1e] shadow-xl border border-black/5 dark:border-white/10 py-1.5 z-50 overflow-hidden backdrop-blur-xl">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(null);
                            if (!isMoveDisabled) setPendingMove(c);
                          }}
                          disabled={isMoveDisabled}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-gray-700 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isMoving ? (
                            <svg
                              className="w-3.5 h-3.5 animate-spin"
                              viewBox="0 0 24 24"
                              fill="none"
                            >
                              <circle
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="2"
                                opacity="0.25"
                              />
                              <path
                                d="M4 12a8 8 0 018-8"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              className="w-3.5 h-3.5"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M7 17L17 7M17 7H8M17 7v9"
                              />
                            </svg>
                          )}
                          Move Chat to {targetMode === "cloud" ? "Cloud" : "Local"}
                        </button>
                        <div className="h-[0.5px] bg-black/5 dark:bg-white/10 mx-2 my-1" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(null);
                            setPendingDelete(c);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            className="w-3.5 h-3.5"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t-[0.5px] border-black/10 dark:border-white/10 flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
            style={{ background: "linear-gradient(135deg, #4A5568, #2D3748)" }}
          >
            WC
          </div>
          <span className="flex-1 text-[13px] md:text-sm text-gray-900 dark:text-white/95 font-medium">
            WaiChat User
          </span>
          <button
            onClick={onSettingsOpen}
            className="w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-white/65 dark:hover:text-white/95 dark:hover:bg-white/5 transition-colors focus:outline-none cursor-pointer"
            title="Settings"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 stroke-2"
            >
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>
      </aside>

      <ConfirmModal
        open={pendingDelete !== null}
        title="Delete conversation?"
        description={pendingDelete ? `"${pendingDelete.title}" will be permanently deleted.` : ""}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmModal
        open={pendingMove !== null}
        title={`Move to ${targetMode === "cloud" ? "Cloud" : "Local"}?`}
        description={
          pendingMove
            ? `"${pendingMove.title}" will be moved to ${targetMode === "cloud" ? "Cloud (D1)" : "Local (Browser)"} storage and removed from ${currentMode === "cloud" ? "Cloud" : "Local"}.`
            : ""
        }
        confirmLabel="Move"
        variant="neutral"
        onConfirm={() => {
          if (pendingMove) onMove(pendingMove.id);
          setPendingMove(null);
        }}
        onCancel={() => setPendingMove(null)}
      />
    </>
  );
}
