import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { prism, vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import type { Message } from "../storage";
import ConfirmModal from "./ConfirmModal";

interface MessageListProps {
  messages: Message[];
  activeBranch: Message[];
  isStreaming: boolean;
  onSelectPrompt: (prompt: string) => void;
  onRetry?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  activeVersions: Record<string, string>;
  onVersionChange?: (parentId: string, messageId: string) => void;
}

function ThoughtParser({ content }: { content: string }) {
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);

  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("waichat:thought-open") !== "false";
    }
    return true;
  });

  const THINK_START = "<think>";
  const THINK_END = "</think>";
  const lowerContent = content.toLowerCase();
  const thinkStartIndex = lowerContent.indexOf(THINK_START);
  const thinkEndIndex = lowerContent.indexOf(THINK_END);

  const hasThought = thinkStartIndex !== -1;
  const isThinking = hasThought && thinkEndIndex === -1;

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isThinking) {
      interval = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isThinking]);

  if (!hasThought) {
    return <MarkdownRenderer content={content} />;
  }

  const precedingContent = content.substring(0, thinkStartIndex).trim();

  const thoughtContent = isThinking
    ? content.substring(thinkStartIndex + THINK_START.length).trim()
    : content.substring(thinkStartIndex + THINK_START.length, thinkEndIndex).trim();

  const remainingContent = isThinking
    ? ""
    : content.substring(thinkEndIndex + THINK_END.length).trim();

  // Handlers
  const handleCopyThought = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevents the <details> block from toggling when clicking the button
    try {
      await navigator.clipboard.writeText(thoughtContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy thought: ", err);
    }
  };

  const handleToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const newState = e.currentTarget.open;
    setIsOpen(newState);
    if (typeof window !== "undefined") {
      localStorage.setItem("waichat:thought-open", String(newState));
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Render any text that the model output before the <think> block */}
      {precedingContent && <MarkdownRenderer content={precedingContent} />}

      <details
        open={isOpen}
        onToggle={handleToggle}
        className="group border-[0.5px] border-black/10 dark:border-white/10 rounded-lg bg-black/5 dark:bg-white/5"
      >
        <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer text-[13px] md:text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-white/65 dark:hover:text-white/95 select-none list-none">
          <svg
            className="w-5 h-5 transition-transform group-open:rotate-90"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          <span className="flex-1">
            {isThinking ? "Thinking..." : "Thought Process"}
            {/* Only show the timer if it actually counted (live), hide for historical DB loads */}
            {/*
              TODO: For better accuracy, move thinking time measurement to the backend (Cloudflare Worker).
              Record <think>...</think> stream `start_time` and `end_time` and save the duration to a `thought_duration` column in D1/local DB.
            */}
            {!isThinking && elapsed > 0 && (
              <span className="ml-2 font-normal opacity-70">({elapsed}s)</span>
            )}
          </span>

          {isThinking ? (
            <span className="flex gap-1 ml-1">
              <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-white/40 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-white/40 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-white/40 rounded-full animate-bounce [animation-delay:300ms]" />
            </span>
          ) : (
            <button
              onClick={handleCopyThought}
              className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs uppercase tracking-wider px-2.5 py-1 rounded bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
        </summary>
        <div className="px-4 pb-4 pt-2 text-xs md:text-sm text-gray-600 dark:text-white/65 whitespace-pre-wrap border-t-[0.5px] border-black/10 dark:border-white/10 italic leading-relaxed">
          {thoughtContent}
        </div>
      </details>

      {/* Render the actual markdown response below the thought block */}
      {remainingContent && <MarkdownRenderer content={remainingContent} />}
    </div>
  );
}

let globalIsDark = true;
const themeListeners = new Set<(isDark: boolean) => void>();
let observerInitialized = false;

function useGlobalTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return true;
  });

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleThemeChange = (dark: boolean) => setIsDark(dark);
    themeListeners.add(handleThemeChange);
    setIsDark(document.documentElement.classList.contains("dark"));

    if (!observerInitialized) {
      observerInitialized = true;
      globalIsDark = document.documentElement.classList.contains("dark");
      const observer = new MutationObserver(() => {
        const newIsDark = document.documentElement.classList.contains("dark");
        if (globalIsDark !== newIsDark) {
          globalIsDark = newIsDark;
          themeListeners.forEach((l) => l(newIsDark));
        }
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    }

    return () => {
      themeListeners.delete(handleThemeChange);
    };
  }, []);

  return isDark;
}

// Code block renderer with language bar and copy button
function CodeBlockWrapper({ codeString, language }: { codeString: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const isDark = useGlobalTheme();

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-lg overflow-hidden border-[0.5px] border-black/10 dark:border-white/10 bg-[#f8f8f8] dark:bg-[#1e1e1e] shadow-sm group">
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#eaeaeb] dark:bg-[#2d2d2d] text-gray-600 dark:text-gray-300 text-xs font-mono border-b border-black/10 dark:border-white/10">
        <span>{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center justify-center p-1.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label="Copy code"
        >
          {copied ? (
            <span className="text-[#34C759] text-[10px] font-bold">✓</span>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        style={isDark ? vscDarkPlus : prism}
        language={language === "text" ? "text" : language}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: "1rem",
          background: "transparent",
          fontSize: "0.875rem",
        }}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
}

// Extracted Markdown renderer
function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children }: React.ComponentPropsWithoutRef<"pre">) => {
          let codeString = "";
          let language = "text";

          if (children && React.isValidElement(children)) {
            const childProps = children.props as { children?: React.ReactNode; className?: string };
            codeString = String(childProps.children).replace(/\n$/, "");
            const match = /language-(\w+)/.exec(childProps.className || "");
            if (match) {
              language = match[1];
            }
          } else {
            codeString = String(children).replace(/\n$/, "");
          }

          return <CodeBlockWrapper codeString={codeString} language={language} />;
        },
        code: ({ children, className, ...props }: React.ComponentPropsWithoutRef<"code">) => (
          <code
            className="bg-black/5 dark:bg-white/10 rounded px-1.5 py-0.5 text-sm font-mono text-[#0A84FF]"
            {...props}
          >
            {children}
          </code>
        ),
        p: ({ children }) => (
          <p className="mb-4 last:mb-0 leading-[1.75] text-[15px] md:text-[16px]">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-outside ml-6 mb-4 space-y-2 text-[15px] md:text-[16px]">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-outside ml-6 mb-4 space-y-2 text-[15px] md:text-[16px]">
            {children}
          </ol>
        ),
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0A84FF] hover:underline"
          >
            {children}
          </a>
        ),
        hr: () => <hr className="my-8 border-black/10 dark:border-white/10" />,
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-black/20 dark:border-white/20 pl-4 py-1 my-3 text-gray-700 dark:text-white/70 italic">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-6 border-[0.5px] border-black/10 dark:border-white/10 rounded-lg">
            <table className="min-w-full divide-y divide-black/10 dark:divide-white/10 text-sm">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-black/5 dark:bg-white/5">{children}</thead>,
        tbody: ({ children }) => (
          <tbody className="divide-y divide-black/10 dark:divide-white/10">{children}</tbody>
        ),
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children }) => (
          <th className="px-4 py-3 text-left font-medium text-gray-900 dark:text-white/95">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-3 text-gray-600 dark:text-white/80">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

interface DisplayEntry {
  message: Message;
  siblings: Message[];
  activeIndex: number;
}

export default function MessageList({
  messages,
  activeBranch,
  isStreaming,
  onSelectPrompt,
  onRetry,
  onEdit,
  onDelete,
  activeVersions,
  onVersionChange,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrolled = useRef(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    role: "user" | "assistant";
    isLastVersion: boolean;
  } | null>(null);

  // Auto-focus edit input
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      // Move cursor to end
      editInputRef.current.selectionStart = editInputRef.current.value.length;
      editInputRef.current.selectionEnd = editInputRef.current.value.length;
    }
  }, [editingId]);

  // Keep track of how many message blocks exist
  const prevMessageCount = useRef(messages.length);

  // Build the display list: map activeBranch and attach siblings
  const displayItems = useMemo((): DisplayEntry[] => {
    const items: DisplayEntry[] = [];

    // Pre-calculate siblings by parent_id
    const siblingMap = new Map<string | null, Message[]>();
    for (const m of messages) {
      if (m.deleted_at) continue;
      const pId = m.parent_id || null;
      const group = siblingMap.get(pId) || [];
      group.push(m);
      siblingMap.set(pId, group);
    }

    for (const m of activeBranch) {
      const pId = m.parent_id || null;
      const siblings = siblingMap.get(pId) || [];
      const activeIndex = siblings.findIndex((s) => s.id === m.id);

      items.push({
        message: m,
        siblings,
        activeIndex: activeIndex >= 0 ? activeIndex : 0,
      });
    }

    return items;
  }, [messages, activeBranch]);

  // Detects when the user scrolls away from the bottom
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

    const distanceToBottom = scrollHeight - scrollTop - clientHeight;

    // If the user is more than 20px away from the bottom, they scrolled up. Lock auto-scroll.
    isUserScrolled.current = distanceToBottom > 20;
  };

  useEffect(() => {
    // If a brand new message block was added, a new turn just started.
    // This safely catches both new user prompts and model retries.
    if (messages.length > prevMessageCount.current) {
      isUserScrolled.current = false; // Break the lock!
    }

    // Update the ref for the next render
    prevMessageCount.current = messages.length;

    // Scroll down if we aren't locked
    if (!isUserScrolled.current) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages]);

  const handleCopy = async (id: string, content: string) => {
    // Strip <think> tags (even unclosed ones) before copying to clipboard
    const cleanContent = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();

    try {
      await navigator.clipboard.writeText(cleanContent);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  // Pre-calculate the index of the last assistant entry to avoid O(N²) lookups
  const lastAssistantIndex = useMemo(() => {
    for (let i = displayItems.length - 1; i >= 0; i--) {
      if (displayItems[i].message.role === "assistant") return i;
    }
    return -1;
  }, [displayItems]);

  // Empty State Hero Design
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto w-full">
        <img width="100" height="100" src="/waichat.webp" alt="WaiChat Logo" className="m-4" />
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white/95 tracking-tight text-center mb-3">
          Let's explore an idea.
        </h1>
        <p className="text-sm md:text-base text-gray-600 dark:text-white/65 text-center mb-12 max-w-[450px] leading-relaxed">
          Lightning-fast AI at the edge. Powered by Cloudflare for limitless, zero-latency
          conversations.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-4xl mb-10">
          <button
            type="button"
            onClick={() =>
              onSelectPrompt(
                "Can you help me refactor this code snippet to be more efficient and readable?\n\n[Paste code here]",
              )
            }
            className="bg-white/60 dark:bg-white/5 border-[0.5px] border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 hover:bg-white/80 dark:hover:bg-white/10 rounded-xl p-5 text-left cursor-pointer backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
          >
            <div className="text-[#0A84FF] mb-4">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="w-6 h-6 stroke-[1.5]"
              >
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
              </svg>
            </div>
            <div className="text-[15px] md:text-base font-medium text-gray-900 dark:text-white/95 mb-1.5">
              Refactor Code
            </div>
            <div className="text-xs md:text-sm text-gray-500 dark:text-white/40 leading-relaxed">
              Debug, explain, or improve your programming snippets.
            </div>
          </button>
          <button
            type="button"
            onClick={() =>
              onSelectPrompt(
                "Please provide a concise summary of the following text, highlighting the key takeaways:\n\n[Paste text here]",
              )
            }
            className="bg-white/60 dark:bg-white/5 border-[0.5px] border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 hover:bg-white/80 dark:hover:bg-white/10 rounded-xl p-5 text-left cursor-pointer backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
          >
            <div className="text-[#0A84FF] mb-4">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="w-6 h-6 stroke-[1.5]"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div className="text-[15px] md:text-base font-medium text-gray-900 dark:text-white/95 mb-1.5">
              Summarize Texts
            </div>
            <div className="text-xs md:text-sm text-gray-500 dark:text-white/40 leading-relaxed">
              Quickly distill long documents or articles down to the essentials.
            </div>
          </button>
          <button
            type="button"
            onClick={() =>
              onSelectPrompt(
                "I'm curious about [Topic]. Can you explain the core concepts and why they matter?",
              )
            }
            className="bg-white/60 dark:bg-white/5 border-[0.5px] border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 hover:bg-white/80 dark:hover:bg-white/10 rounded-xl p-5 text-left cursor-pointer backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
          >
            <div className="text-[#0A84FF] mb-4">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="w-6 h-6 stroke-[1.5]"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
            </div>
            <div className="text-[15px] md:text-base font-medium text-gray-900 dark:text-white/95 mb-1.5">
              Explore Concepts
            </div>
            <div className="text-xs md:text-sm text-gray-500 dark:text-white/40 leading-relaxed">
              Dive into science, physics, history, or anything else you're curious about.
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-black/10 dark:[&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full"
    >
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-10 space-y-12">
        {displayItems.map((item, idx) => {
          const isLast = idx === displayItems.length - 1;
          const { message: m, siblings, activeIndex } = item;
          const totalVersions = siblings.length;
          const versionKey = m.parent_id || `${m.conversation_id}_root`;

          if (m.role === "user") {
            const isEditing = editingId === m.id;
            return (
              <div key={m.id} className="group flex flex-col items-end w-full">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-white/40">
                    You
                  </span>
                  <div className="w-6 h-6 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      className="w-3.5 h-3.5 stroke-[2.5] text-gray-500 dark:text-white/80"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"
                      />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                </div>

                {isEditing ? (
                  <div className="w-full max-w-3xl bg-white dark:bg-[#2d2d2d] border border-black/10 dark:border-white/10 rounded-2xl p-3 shadow-lg">
                    <textarea
                      ref={editInputRef}
                      value={editContent}
                      onChange={(e) => {
                        setEditContent(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      className="w-full bg-transparent text-[15px] md:text-[16px] text-gray-900 dark:text-white/95 border-none outline-none resize-none min-h-[100px] max-h-[500px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-black/10 dark:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full"
                      placeholder="Edit your message..."
                    />
                    <div className="flex justify-end gap-2 mt-3">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-4 py-1.5 rounded-full text-sm font-medium text-gray-600 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (editContent.trim() !== m.content && onEdit) {
                            onEdit(m.id, editContent.trim());
                          }
                          setEditingId(null);
                        }}
                        disabled={!editContent.trim() || editContent.trim() === m.content}
                        className="px-4 py-1.5 rounded-full text-sm font-medium bg-black/5 dark:bg-white/10 text-gray-600 dark:text-white/80 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black disabled:opacity-50 disabled:hover:bg-black/5 disabled:hover:text-gray-600 dark:disabled:hover:bg-white/10 dark:disabled:hover:text-white/80 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        Save & Submit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#f4f4f5] dark:bg-white/10 rounded-2xl rounded-tr-sm px-5 py-3.5 max-w-[85%] sm:max-w-[75%] text-[15px] md:text-[16px] leading-relaxed text-gray-900 dark:text-white/95">
                    <MarkdownRenderer content={m.content} />
                  </div>
                )}

                {!isEditing && (
                  <div className="mt-2 flex items-center gap-1">
                    {totalVersions > 1 && (
                      <div className="flex items-center gap-0.5 mr-2 bg-black/5 dark:bg-white/5 rounded-md px-1 py-0.5">
                        <button
                          onClick={() => {
                            if (activeIndex > 0) {
                              onVersionChange?.(versionKey, siblings[activeIndex - 1].id);
                            }
                          }}
                          disabled={activeIndex === 0}
                          className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 dark:text-white/40 dark:hover:text-white/80 disabled:opacity-30 transition-colors cursor-pointer"
                        >
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth="2.5"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 19l-7-7 7-7"
                            />
                          </svg>
                        </button>
                        <span className="text-[10px] text-gray-400 dark:text-white/40 font-bold tabular-nums min-w-[2rem] text-center uppercase">
                          {activeIndex + 1} / {totalVersions}
                        </span>
                        <button
                          onClick={() => {
                            if (activeIndex < totalVersions - 1) {
                              onVersionChange?.(versionKey, siblings[activeIndex + 1].id);
                            }
                          }}
                          disabled={activeIndex === totalVersions - 1}
                          className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 dark:text-white/40 dark:hover:text-white/80 disabled:opacity-30 transition-colors cursor-pointer"
                        >
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth="2.5"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {!isStreaming && (
                      <button
                        onClick={() => {
                          setEditContent(m.content);
                          setEditingId(m.id);
                        }}
                        className={`p-1.5 text-gray-400 hover:text-gray-600 dark:text-white/40 dark:hover:text-white/80 transition-opacity flex items-center justify-center cursor-pointer ${isLast ? "md:opacity-100" : "md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"}`}
                        aria-label="Edit message"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                    )}

                    {m.content && (
                      <button
                        onClick={() => handleCopy(m.id, m.content)}
                        className={`p-1.5 text-gray-400 hover:text-gray-600 dark:text-white/40 dark:hover:text-white/80 transition-opacity flex items-center justify-center cursor-pointer ${isLast ? "md:opacity-100" : "md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"}`}
                        aria-label="Copy message"
                      >
                        {copiedId === m.id ? (
                          <span className="text-[#34C759] text-[10px] font-bold">✓</span>
                        ) : (
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                        )}
                      </button>
                    )}
                    {!isStreaming && onDelete && (
                      <button
                        onClick={() =>
                          setDeleteTarget({ id: m.id, role: "user", isLastVersion: false })
                        }
                        className={`p-1.5 text-gray-400 hover:text-red-500 dark:text-white/40 dark:hover:text-red-400 transition-opacity flex items-center justify-center cursor-pointer ${isLast ? "md:opacity-100" : "md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"}`}
                        aria-label="Delete message"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }

          // Assistant group
          const isCurrentlyStreaming =
            isStreaming && m.content === "" && idx === lastAssistantIndex;

          return (
            <div key={m.id} className="group flex flex-col items-start w-full">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center">
                  <img src="/waichat.webp" alt="WaiChat" className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-white/40">
                  {m.model ? m.model.split("/").pop()?.replaceAll("-", " ") : "WaiChat"}
                </span>
              </div>

              <div className="w-full text-[15px] md:text-[16px] leading-relaxed text-gray-900 dark:text-white/95">
                {isCurrentlyStreaming ? (
                  <span className="inline-flex gap-1 mt-2">
                    <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-white/40 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-white/40 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-white/40 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                ) : (
                  <ThoughtParser content={m.content} />
                )}
              </div>

              <div className="mt-4 flex items-center gap-1 flex-wrap">
                {totalVersions > 1 && (
                  <div className="flex items-center gap-0.5 mr-2 bg-black/5 dark:bg-white/5 rounded-md px-1 py-0.5">
                    <button
                      onClick={() => {
                        if (activeIndex > 0) {
                          onVersionChange?.(versionKey, siblings[activeIndex - 1].id);
                        }
                      }}
                      disabled={activeIndex === 0}
                      className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 dark:text-white/40 dark:hover:text-white/80 disabled:opacity-30 disabled:cursor-default transition-colors cursor-pointer"
                      aria-label="Previous version"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth="2.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-[10px] text-gray-400 dark:text-white/40 font-bold tabular-nums min-w-[2rem] text-center select-none uppercase">
                      {activeIndex + 1} / {totalVersions}
                    </span>
                    <button
                      onClick={() => {
                        if (activeIndex < totalVersions - 1) {
                          onVersionChange?.(versionKey, siblings[activeIndex + 1].id);
                        }
                      }}
                      disabled={activeIndex === totalVersions - 1}
                      className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 dark:text-white/40 dark:hover:text-white/80 disabled:opacity-30 disabled:cursor-default transition-colors cursor-pointer"
                      aria-label="Next version"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth="2.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}

                {m.content && (
                  <button
                    onClick={() => handleCopy(m.id, m.content)}
                    className={`p-1.5 text-gray-400 hover:text-gray-600 dark:text-white/40 dark:hover:text-white/80 transition-opacity flex items-center justify-center cursor-pointer ${isLast ? "md:opacity-100" : "md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"}`}
                    aria-label="Copy message"
                  >
                    {copiedId === m.id ? (
                      <span className="text-[#34C759] text-[10px] font-bold">✓</span>
                    ) : (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    )}
                  </button>
                )}

                {m.content && !isStreaming && onRetry && (
                  <button
                    onClick={() => onRetry(m.id)}
                    className={`p-1.5 text-gray-400 hover:text-gray-600 dark:text-white/40 dark:hover:text-white/80 transition-opacity flex items-center justify-center cursor-pointer ${isLast ? "md:opacity-100" : "md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"}`}
                    aria-label="Retry response"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </button>
                )}

                {m.content && !isStreaming && onDelete && (
                  <button
                    onClick={() =>
                      setDeleteTarget({
                        id: m.id,
                        role: "assistant",
                        isLastVersion: totalVersions === 1 && !!m.parent_id,
                      })
                    }
                    className={`p-1.5 text-gray-400 hover:text-red-500 dark:text-white/40 dark:hover:text-red-400 transition-opacity flex items-center justify-center cursor-pointer ${isLast ? "md:opacity-100" : "md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"}`}
                    aria-label="Delete response"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div ref={bottomRef} className="h-4" />

      {/* Delete confirmation modal */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete message"
        description={
          deleteTarget?.role === "user"
            ? "Delete this message? The response below it will also be removed."
            : deleteTarget?.isLastVersion
              ? "Delete this response? This is the only version left."
              : "Delete this response?"
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget && onDelete) {
            onDelete(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
