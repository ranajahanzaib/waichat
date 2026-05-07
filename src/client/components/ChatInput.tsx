import { useEffect, useRef, useState } from "react";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled: boolean;
  isGenerating?: boolean;
  initialValue?: string;
  onClearInitialValue?: () => void;
  onAbort?: () => void;
}

export default function ChatInput({
  onSend,
  disabled,
  isGenerating,
  initialValue,
  onClearInitialValue,
  onAbort,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialValue) {
      setValue(initialValue);
      onClearInitialValue?.();
      textareaRef.current?.focus();
    }
  }, [initialValue, onClearInitialValue]);

  // Auto-resize the textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault(); // Prevent page reload if triggered via form submission
    const trimmed = value.trim();
    if (!trimmed || disabled || isGenerating) return;
    onSend(trimmed);
    setValue("");

    // Reset height after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (disabled || isGenerating) return;
      handleSend();
    }
  };

  return (
    <div className="w-full flex justify-center pb-6 pt-2 px-4 md:px-8 shrink-0">
      <div className="w-full max-w-[720px] relative">
        {isGenerating && onAbort && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20">
            <button
              type="button"
              onClick={onAbort}
              className="flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-[#1e1e20]/80 backdrop-blur-md border-[0.5px] border-black/10 dark:border-white/10 rounded-xl text-sm font-medium text-gray-700 dark:text-white/80 hover:bg-white dark:hover:bg-[#1e1e20] hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg cursor-pointer"
            >
              <div className="w-2.5 h-2.5 bg-gray-900 dark:bg-white rounded-[2px]" />
              Stop Generating
            </button>
          </div>
        )}

        <form
          onSubmit={handleSend}
          className="relative flex flex-col bg-white/60 dark:bg-black/25 focus-within:bg-white/80 dark:focus-within:bg-black/35 border-[0.5px] border-black/10 dark:border-white/10 focus-within:border-black/20 dark:focus-within:border-white/20 rounded-2xl p-3 shadow-[0_4px_24px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.6)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-200"
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message WaiChat..."
            disabled={disabled}
            rows={1}
            className="w-full bg-transparent border-none text-gray-900 dark:text-white/95 text-base outline-none resize-none leading-relaxed min-h-[24px] max-h-[200px] pr-12 placeholder:text-gray-400 dark:placeholder:text-white/40 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-black/10 dark:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full"
          />

          <button
            type="submit"
            disabled={disabled || isGenerating || !value.trim()}
            className="absolute right-3 top-2.5 w-8 h-8 bg-black/5 dark:bg-white/10 border-[0.5px] border-black/10 dark:border-white/10 rounded-full flex items-center justify-center text-gray-500 dark:text-white/80 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black hover:scale-105 disabled:opacity-40 disabled:hover:bg-black/5 disabled:hover:text-gray-500 dark:disabled:hover:bg-white/10 dark:disabled:hover:text-white/80 disabled:hover:scale-100 transition-all duration-200 cursor-pointer"
            aria-label="Send message"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              className="w-4 h-4 stroke-[2.5]"
            >
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>

          {/*<div className="flex justify-between items-center mt-3 border-t-[0.5px] border-black/5 dark:border-white/5 pt-2">
            <button
              type="button"
              className="flex items-center gap-2 bg-transparent border-none text-gray-500 hover:text-gray-900 dark:text-white/50 dark:hover:text-white/95 text-[13px] md:text-sm font-medium cursor-pointer transition-colors focus:outline-none"
              aria-label="Attach file"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="w-5 h-5 stroke-[1.5]"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
              Files
            </button>
          </div>*/}
        </form>

        <div className="text-center text-xs text-gray-400 dark:text-white/40 mt-3 hidden md:block tracking-wide">
          Press Enter to send · Shift + Enter for new line
        </div>
      </div>
    </div>
  );
}
