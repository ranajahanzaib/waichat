import { useEffect, useRef } from "react";
import type { Model } from "../hooks/useModels";
import type { StorageMode } from "../storage";
import ModelPicker from "./ModelPicker";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled: boolean;
  value: string;
  onChange: (value: string) => void;
  isGenerating?: boolean;
  isStreamingHere?: boolean;
  streamingStorageMode?: StorageMode | null;
  initialValue?: string;
  onClearInitialValue?: () => void;
  onAbort?: () => void;
  models: Model[];
  modelValue: string;
  onModelChange: (model: string) => void;
}

export default function ChatInput({
  onSend,
  disabled,
  value,
  onChange,
  isGenerating = false,
  isStreamingHere = false,
  streamingStorageMode,
  initialValue,
  onClearInitialValue,
  onAbort,
  models,
  modelValue,
  onModelChange,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialValue) {
      onChange(initialValue);
      onClearInitialValue?.();
      textareaRef.current?.focus();
    }
  }, [initialValue, onClearInitialValue, onChange]);

  // Auto-resize the textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled || isGenerating) return;
    onSend(trimmed);
    onChange("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-full flex justify-center pb-6 pt-2 px-4 md:px-8 shrink-0">
      <div className="w-full max-w-[720px] relative">
        {isStreamingHere && onAbort && (
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
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isGenerating && !isStreamingHere
                ? "Another generation is in progress" +
                  (streamingStorageMode
                    ? " in " + (streamingStorageMode === "cloud" ? "Cloud" : "Local") + " mode"
                    : "") +
                  "..."
                : "Message WaiChat..."
            }
            disabled={disabled || (isGenerating && !isStreamingHere)}
            rows={1}
            className="w-full bg-transparent border-none text-gray-900 dark:text-white/95 text-base outline-none resize-none leading-relaxed min-h-[24px] max-h-[200px] placeholder:text-gray-400 dark:placeholder:text-white/40 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-black/10 dark:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full"
          />

          <div className="flex items-center justify-between mt-2 pt-2 border-t-[0.5px] border-black/5 dark:border-white/5">
            <ModelPicker
              models={models}
              value={modelValue}
              onChange={onModelChange}
              disabled={disabled || isGenerating}
              className="max-w-[200px]"
            />

            <button
              type="submit"
              disabled={disabled || isGenerating || !value.trim()}
              className="w-8 h-8 bg-black/5 dark:bg-white/10 border-[0.5px] border-black/10 dark:border-white/10 rounded-full flex items-center justify-center text-gray-500 dark:text-white/80 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black hover:scale-105 disabled:opacity-40 disabled:hover:bg-black/5 disabled:hover:text-gray-500 dark:disabled:hover:bg-white/10 dark:disabled:hover:text-white/80 disabled:hover:scale-100 transition-all duration-200 cursor-pointer shrink-0"
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
          </div>
        </form>

        <div className="text-center text-xs text-gray-400 dark:text-white/40 mt-3 hidden md:block tracking-wide">
          Press Enter to send · Shift + Enter for new line
        </div>
      </div>
    </div>
  );
}
