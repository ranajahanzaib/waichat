import React, { useEffect, useRef, useState } from "react";
import { Toast, ToastType, useToast } from "../hooks/useToast";

export function ToastContainer() {
  const { toasts } = useToast();

  return (
    <div
      className="fixed top-0 right-0 left-0 md:left-auto md:w-[400px] z-[9999] pointer-events-none flex flex-col items-center md:items-end p-4 gap-3"
      style={{
        paddingTop: "calc(max(1rem, env(safe-area-inset-top)))",
      }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useToast();
  const [isVisible, setIsVisible] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef<number>(toast.duration || 4000);
  const startTimeRef = useRef<number>(Date.now());
  const isPausedRef = useRef(false);

  const startTimer = (duration: number) => {
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      handleDismiss();
    }, duration);
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setIsRemoving(true);
    setTimeout(() => {
      removeToast(toast.id);
    }, 400); // Wait for transition
  };

  useEffect(() => {
    // Small delay to trigger entry animation
    const raf = requestAnimationFrame(() => setIsVisible(true));

    startTimer(remainingRef.current);

    return () => {
      cancelAnimationFrame(raf);
      clearTimer();
    };
  }, []);

  const handleMouseEnter = () => {
    isPausedRef.current = true;
    clearTimer();
    const elapsed = Date.now() - startTimeRef.current;
    remainingRef.current = Math.max(0, remainingRef.current - elapsed);
  };

  const handleMouseLeave = () => {
    isPausedRef.current = false;
    if (remainingRef.current > 0) {
      startTimer(remainingRef.current);
    } else {
      handleDismiss();
    }
  };

  const icons: Record<ToastType, React.ReactNode> = {
    success: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 text-green-500">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 text-red-500">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
        />
      </svg>
    ),
    warning: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 text-amber-500">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 12.376zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>
    ),
    info: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 text-blue-500">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12v-.008z"
        />
      </svg>
    ),
  };

  const variantStyles: Record<ToastType, string> = {
    success:
      "bg-green-50/90 dark:bg-green-500/10 border-green-200 dark:border-green-500/20 text-green-900 dark:text-green-100",
    error:
      "bg-red-50/90 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-900 dark:text-red-100",
    warning:
      "bg-amber-50/90 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-900 dark:text-amber-100",
    info: "bg-blue-50/90 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-900 dark:text-blue-100",
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`
        pointer-events-auto
        w-full max-w-[calc(100vw-2rem)] md:w-full
        flex items-start gap-3 p-4
        backdrop-blur-xl
        border-[0.5px] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)]
        transition-all duration-400 cubic-bezier(0.4, 0, 0.2, 1)
        ${isVisible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-4 scale-95"}
        ${isRemoving ? "opacity-0 scale-90" : ""}
        ${variantStyles[toast.type]}
      `}
    >
      <div className="shrink-0 mt-0.5">{icons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] md:text-sm font-medium leading-relaxed break-words">
          {toast.message}
        </p>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 ml-2 p-1 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white/90 hover:bg-black/5 dark:hover:bg-white/5 transition-all focus:outline-none"
        aria-label="Close"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4 stroke-2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
