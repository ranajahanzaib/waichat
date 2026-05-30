import {
  ArrowUpRight,
  ChevronDown,
  Cloud,
  Database,
  HatGlasses,
  Loader2,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Conversation, ConversationSearchResult, StorageMode } from "../storage";
import ConfirmModal from "./ConfirmModal";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: (mode?: StorageMode) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, targetMode?: StorageMode) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onSettingsOpen: () => void;
  onModeChange: (mode: StorageMode) => void;
  onSearch: (query: string, signal?: AbortSignal) => Promise<ConversationSearchResult[]>;
  currentMode: StorageMode;
  tempExpiry: string;
  onTempExpiryChange: (value: string) => void;
  savedMode: StorageMode;
  streamingConversationId: string | null;
  streamingStorageMode: StorageMode | null;
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
  onRename,
  onSettingsOpen,
  onModeChange,
  onSearch,
  currentMode,
  tempExpiry,
  onTempExpiryChange,
  savedMode, // Kept in props to satisfy the interface and App.tsx
  streamingConversationId,
  streamingStorageMode,
  movingConversationId,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    q: string;
    results: ConversationSearchResult[];
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  useEffect(() => {
    setSearchQuery("");
    setSearchResults(null);
  }, [currentMode]);

  const [expiryDropdownOpen, setExpiryDropdownOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const [pendingMove, setPendingMove] = useState<Conversation | null>(null);
  const [pendingMoveTarget, setPendingMoveTarget] = useState<StorageMode | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const expiryDropdownRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [isMobileMenu, setIsMobileMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; left?: number }>({});
  const MENU_HEIGHT_ESTIMATE = 160;
  const menuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const justOpenedRef = useRef(false);
  const targetMode: StorageMode = currentMode === "cloud" ? "local" : "cloud";

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const id = e.currentTarget.getAttribute("data-id");
    if (!id) return;

    isLongPressRef.current = false;
    const rect = e.currentTarget.getBoundingClientRect();
    if (longPressTimer.current) clearTimeout(longPressTimer.current);

    longPressTimer.current = setTimeout(() => {
      const viewportHeight = window.innerHeight;
      const hasSpaceBelow = rect.bottom + MENU_HEIGHT_ESTIMATE < viewportHeight;

      setIsMobileMenu(true);
      if (hasSpaceBelow) {
        setMenuPos({ top: rect.bottom + 8, left: 16 });
      } else {
        setMenuPos({ bottom: viewportHeight - rect.top + 8, left: 16 });
      }

      justOpenedRef.current = true;
      setOpenMenuId(id);
      isLongPressRef.current = true;
      longPressTimer.current = null;
    }, 500);
  }, []);

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
      const target = event.target as Node;
      if (justOpenedRef.current) {
        justOpenedRef.current = false;
        return;
      }

      // Handle Context Menu click-away
      if (menuRef.current && !menuRef.current.contains(target)) {
        setOpenMenuId(null);
      }

      // Handle Expiry Dropdown click-away
      if (expiryDropdownRef.current && !expiryDropdownRef.current.contains(target)) {
        setExpiryDropdownOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuId(null);
        setExpiryDropdownOpen(false);
      }
    };

    if (openMenuId || expiryDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, [openMenuId, expiryDropdownOpen]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Debounced search via StorageAdapter — tagged with the query so stale results are never shown.
  // onSearch is accessed via ref so inline arrow function re-renders in App don't reset the debounce.
  // active flag discards responses from races where a slower request resolves after a newer one.
  useEffect(() => {
    if (!searchQuery) {
      setSearchResults(null);
      return;
    }

    let active = true;
    const captured = searchQuery;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const results = await onSearchRef.current(captured, controller.signal);
        if (active) setSearchResults({ q: captured, results });
      } catch (err: any) {
        if (err.name !== "AbortError") console.error(err);
      }
    }, 300);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const displayResults = useMemo(() => {
    if (!searchQuery) return null;
    // Only use stored results if they belong to the current query — no async clear needed
    if (searchResults?.q === searchQuery) return searchResults.results;
    // While debounce is pending, show instant title matches (synchronous, no flash)
    const lowerQ = searchQuery.toLowerCase();
    return conversations
      .filter((c) => c.title.toLowerCase().includes(lowerQ))
      .map((c) => ({ id: c.id, title: c.title, snippet: "", updated_at: c.updated_at }));
  }, [searchQuery, searchResults, conversations]);

  const handleRenameClick = (c: Conversation) => {
    setEditTitle(c.title);
    setEditingId(c.id);
    setOpenMenuId(null);
  };

  const handleSaveRename = async (id: string) => {
    if (isRenaming) return;
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }

    setIsRenaming(true);
    try {
      await onRename(id, trimmed);
      setEditingId(null);
    } catch (err) {
      // Keep the input open on error so the user doesn't lose their changes.
      // The error message is handled by useChat's error state.
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <>
      <aside
        className={`absolute md:relative z-30 flex flex-col w-[280px] h-full bg-white/60 dark:bg-[#141416]/60 border-r-[0.5px] border-r-black/10 dark:border-r-white/10 border-l-[3px] shrink-0 transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          currentMode === "cloud"
            ? "border-l-brand-cloud"
            : currentMode === "temporary"
              ? "border-l-slate-500"
              : "border-l-brand-local"
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

        {/* Workspace Storage Switcher (3 Pill Tabs) */}
        <div className="px-4 pb-3">
          <div className="flex rounded-full bg-black/5 dark:bg-black/20 p-1 border-[0.5px] border-black/5 dark:border-white/10">
            {(["cloud", "local", "temporary"] as StorageMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  if (currentMode !== mode) onModeChange(mode);
                }}
                className={`flex-1 py-1.5 rounded-full transition-all duration-200 flex items-center justify-center gap-1.5 ${
                  currentMode === mode
                    ? mode === "cloud"
                      ? "bg-brand-cloud text-white shadow-sm cursor-default"
                      : mode === "temporary"
                        ? "bg-slate-500 text-white shadow-sm cursor-default"
                        : "bg-brand-local text-gray-900 shadow-sm cursor-default"
                    : "text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-white/65 dark:hover:text-white/95 dark:hover:bg-white/5 cursor-pointer"
                }`}
                title={
                  currentMode === mode
                    ? `${mode.charAt(0).toUpperCase() + mode.slice(1)} Workspace`
                    : `Switch to ${mode.charAt(0).toUpperCase() + mode.slice(1)} Workspace`
                }
              >
                {mode === "cloud" && (
                  <>
                    <Cloud size={14} strokeWidth={2.5} />
                    <span className="text-[11px] font-bold tracking-tight">Cloud</span>
                  </>
                )}
                {mode === "local" && (
                  <>
                    <Database size={14} strokeWidth={2.5} />
                    <span className="text-[11px] font-bold tracking-tight">Local</span>
                  </>
                )}
                {mode === "temporary" && <HatGlasses size={16} strokeWidth={2.5} />}
              </button>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 pb-3">
          <div className="relative flex items-center">
            <Search
              size={14}
              className="absolute left-2.5 text-gray-400 dark:text-white/30 pointer-events-none shrink-0"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && searchQuery) {
                  e.preventDefault();
                  e.stopPropagation();
                  setSearchQuery("");
                  setSearchResults(null);
                }
              }}
              placeholder="Search conversations…"
              className="w-full bg-black/5 dark:bg-white/5 border border-black/8 dark:border-white/10 rounded-lg pl-8 pr-7 py-1.5 text-[13px] text-gray-700 dark:text-white/80 placeholder:text-gray-400 dark:placeholder:text-white/25 outline-none focus:ring-1 focus:ring-black/15 dark:focus:ring-white/15 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults(null);
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2 text-gray-400 hover:text-gray-700 dark:text-white/30 dark:hover:text-white/70 transition-colors"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-black/10 dark:[&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className="px-4 py-3 pb-2 text-[10px] md:text-[11px] font-semibold text-gray-400 dark:text-white/30 tracking-[0.05em] flex items-center justify-between">
            {currentMode === "temporary" ? (
              <div className="flex items-center gap-1.5 w-full relative group">
                <span className="flex-shrink-0">Chats auto-expire</span>
                <div className="relative inline-block text-left">
                  <button
                    onClick={() => setExpiryDropdownOpen(!expiryDropdownOpen)}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 -mx-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white font-bold"
                  >
                    {tempExpiry === "24h"
                      ? "within 24 hours"
                      : tempExpiry === "6h"
                        ? "within 6 hours"
                        : tempExpiry === "instant"
                          ? "instantly"
                          : "within 1 hour"}
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </button>

                  {expiryDropdownOpen && (
                    <div
                      ref={expiryDropdownRef}
                      className="absolute left-0 mt-1 w-32 rounded-lg bg-white dark:bg-[#1a1a1a] shadow-xl border border-black/5 dark:border-white/10 z-20 py-1 overflow-hidden backdrop-blur-xl"
                    >
                      {(["instant", "1h", "6h", "24h"] as const).map((option) => (
                        <button
                          key={option}
                          onClick={() => {
                            onTempExpiryChange(option);
                            setExpiryDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-[11px] font-medium transition-colors ${
                            tempExpiry === option
                              ? "bg-black/5 dark:bg-white/5 text-gray-900 dark:text-white"
                              : "text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                          }`}
                        >
                          {option === "instant"
                            ? "Instantly"
                            : option === "1h"
                              ? "1 Hour"
                              : option === "6h"
                                ? "6 Hours"
                                : "24 Hours"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              conversations.length > 0 && <span className="uppercase text-[11px]">Recent</span>
            )}
          </div>
          {!displayResults && conversations.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-white/40 text-center mt-10">
              No conversations yet
            </p>
          )}
          {displayResults !== null && displayResults.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-white/40 text-center mt-10">
              No conversations found
            </p>
          )}
          {displayResults !== null &&
            displayResults.map((result) => (
              <div
                key={result.id}
                className={`group relative flex flex-col rounded-lg pl-3 pr-3 py-2 cursor-pointer text-[13px] md:text-sm transition-all duration-150 ${
                  activeId === result.id
                    ? currentMode === "cloud"
                      ? "bg-brand-cloud text-white font-medium"
                      : currentMode === "temporary"
                        ? "bg-slate-500 text-white font-medium"
                        : "bg-brand-local text-gray-900 font-medium"
                    : "text-gray-600 dark:text-white/65 hover:bg-black/5 hover:text-gray-900 dark:hover:bg-white/5 dark:hover:text-white/95"
                }`}
                onClick={() => onSelect(result.id)}
              >
                <span className="truncate font-medium">{result.title}</span>
                {result.snippet && (
                  <span
                    className={`text-[11px] mt-0.5 line-clamp-2 ${
                      activeId === result.id
                        ? currentMode === "local"
                          ? "text-gray-900/70"
                          : "text-white/70"
                        : "text-gray-400 dark:text-white/35"
                    }`}
                  >
                    {result.snippet}
                  </span>
                )}
              </div>
            ))}
          {displayResults === null &&
            conversations.map((c) => {
              const isMoving = movingConversationId === c.id;
              const isThisStreaming =
                c.id === streamingConversationId && currentMode === streamingStorageMode;
              const isMoveDisabled = isMoving || isThisStreaming;

              return (
                <div
                  key={c.id}
                  data-id={c.id}
                  className={`group relative flex items-center rounded-lg pl-3 pr-0 py-1.5 cursor-pointer text-[13px] md:text-sm transition-all duration-150 [--fade-size:1.1rem] hover:[--fade-size:2rem] ${
                    openMenuId === c.id ? "[--fade-size:2rem]" : ""
                  } ${
                    activeId === c.id
                      ? currentMode === "cloud"
                        ? "bg-brand-cloud text-white font-medium"
                        : currentMode === "temporary"
                          ? "bg-slate-500 text-white font-medium"
                          : "bg-brand-local text-gray-900 font-medium"
                      : `${
                          openMenuId === c.id
                            ? "bg-black/8 dark:bg-white/10 text-gray-900 dark:text-white"
                            : "text-gray-600 dark:text-white/65"
                        } hover:bg-black/5 hover:text-gray-900 dark:hover:bg-white/5 dark:hover:text-white/95`
                  }`}
                  onClick={() => {
                    if (isLongPressRef.current) {
                      isLongPressRef.current = false;
                      return;
                    }
                    onSelect(c.id);
                  }}
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={handleTouchMove}
                  onContextMenu={(e) => {
                    if (window.innerWidth < 768) e.preventDefault();
                  }}
                >
                  {editingId === c.id ? (
                    <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveRename(c.id);
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setEditingId(null);
                          }
                        }}
                        onBlur={() => !isRenaming && setEditingId(null)}
                        disabled={isRenaming}
                        className={`w-full bg-white/50 dark:bg-black/20 border border-black/10 dark:border-white/20 rounded px-1.5 py-0.5 outline-none text-[13px] md:text-sm focus:ring-1 ${
                          currentMode === "cloud"
                            ? "focus:ring-brand-cloud/50"
                            : "focus:ring-brand-local/50"
                        }`}
                      />
                    </div>
                  ) : (
                    <div
                      className="flex-1 relative flex items-center gap-2 overflow-hidden min-w-0 w-full transition-all duration-200"
                      title={isThisStreaming ? "Generation in progress..." : undefined}
                      style={{
                        maskImage:
                          "linear-gradient(to right, black calc(100% - var(--fade-size)), transparent 100%)",
                        WebkitMaskImage:
                          "linear-gradient(to right, black calc(100% - var(--fade-size)), transparent 100%)",
                      }}
                    >
                      {isThisStreaming && (
                        <div
                          className={`shrink-0 w-1.5 h-1.5 rounded-full animate-pulse ${
                            activeId === c.id
                              ? currentMode === "cloud"
                                ? "bg-white"
                                : "bg-gray-900"
                              : currentMode === "cloud"
                                ? "bg-brand-cloud"
                                : "bg-brand-local"
                          }`}
                        />
                      )}
                      <span className="whitespace-nowrap">{c.title}</span>
                    </div>
                  )}
                  <div
                    className={`hidden md:flex items-center shrink-0 transition-all duration-200 overflow-hidden ${
                      openMenuId === c.id
                        ? "w-8 ml-2 opacity-100"
                        : "w-0 opacity-0 group-hover:w-8 group-hover:ml-2 group-hover:opacity-100"
                    }`}
                  >
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsMobileMenu(false);
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
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === c.id}
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
                    </div>
                  </div>

                  {openMenuId === c.id && (
                    <div
                      ref={menuRef}
                      role="menu"
                      className={`${
                        isMobileMenu ? "fixed" : "absolute right-2 mt-8"
                      } w-44 rounded-xl bg-white dark:bg-[#1c1c1e] shadow-xl border border-black/5 dark:border-white/10 py-1.5 z-[100] overflow-hidden backdrop-blur-xl`}
                      style={
                        isMobileMenu
                          ? {
                              top: menuPos.top,
                              bottom: menuPos.bottom,
                              left: menuPos.left,
                            }
                          : {}
                      }
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRenameClick(c);
                        }}
                        disabled={isMoveDisabled}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-gray-700 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        role="menuitem"
                      >
                        <Pencil size={14} />
                        Rename
                      </button>
                      <div className="h-[0.5px] bg-black/5 dark:bg-white/10 mx-2 my-1" />
                      {c.is_temporary ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(null);
                              setPendingMoveTarget("cloud");
                              setPendingMove(c);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-gray-700 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            role="menuitem"
                          >
                            <Cloud size={14} />
                            Save Chat to Cloud
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(null);
                              setPendingMoveTarget("local");
                              setPendingMove(c);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-gray-700 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            role="menuitem"
                          >
                            <Database size={14} />
                            Save Chat to Local
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(null);
                            if (!isMoveDisabled) onMove(c.id);
                          }}
                          disabled={isMoveDisabled}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-gray-700 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          role="menuitem"
                        >
                          {isMoving ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <ArrowUpRight size={14} />
                          )}
                          Move Chat to {targetMode === "cloud" ? "Cloud" : "Local"}
                        </button>
                      )}
                      <div className="h-[0.5px] bg-black/5 dark:bg-white/10 mx-2 my-1" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(null);
                          setPendingDelete(c);
                        }}
                        disabled={isMoveDisabled}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        role="menuitem"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  )}
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
        title={`${pendingMove?.is_temporary ? "Save" : "Move"} to ${
          pendingMoveTarget
            ? pendingMoveTarget === "cloud"
              ? "Cloud"
              : "Local"
            : targetMode === "cloud"
              ? "Cloud"
              : "Local"
        }?`}
        description={
          pendingMove
            ? pendingMove.is_temporary
              ? `"${pendingMove.title}" will be saved to ${
                  (pendingMoveTarget || targetMode) === "cloud" ? "Cloud (D1)" : "Local (Browser)"
                } storage.`
              : `"${pendingMove.title}" will be moved to ${
                  targetMode === "cloud" ? "Cloud (D1)" : "Local (Browser)"
                } storage and removed from ${currentMode === "cloud" ? "Cloud" : "Local"}.`
            : ""
        }
        confirmLabel={pendingMove?.is_temporary ? "Save" : "Move"}
        variant="neutral"
        onConfirm={() => {
          if (pendingMove) {
            onMove(pendingMove.id, pendingMoveTarget || undefined);
          }
          setPendingMove(null);
          setPendingMoveTarget(null);
        }}
        onCancel={() => {
          setPendingMove(null);
          setPendingMoveTarget(null);
        }}
      />
    </>
  );
}
