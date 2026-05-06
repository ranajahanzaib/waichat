import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, type: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const MAX_TOASTS = 3;
const DEFAULT_DURATION = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType, duration?: number) => {
    const generateId = () =>
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 11);

    setToasts((prev) => {
      // Deduplication: Check if same message already exists
      const existingIndex = prev.findIndex((t) => t.message === message && t.type === type);

      if (existingIndex !== -1) {
        const updated = [...prev];
        const existing = updated[existingIndex];
        updated.splice(existingIndex, 1);
        return [{ ...existing, id: generateId() }, ...updated];
      }

      const newToast: Toast = {
        id: generateId(),
        message,
        type,
        duration:
          duration ?? (type === "error" ? 8000 : type === "warning" ? 6000 : DEFAULT_DURATION),
      };

      const next = [newToast, ...prev];
      if (next.length > MAX_TOASTS) {
        return next.slice(0, MAX_TOASTS);
      }
      return next;
    });
  }, []);

  const success = useCallback((msg: string, d?: number) => addToast(msg, "success", d), [addToast]);
  const error = useCallback((msg: string, d?: number) => addToast(msg, "error", d), [addToast]);
  const warning = useCallback((msg: string, d?: number) => addToast(msg, "warning", d), [addToast]);
  const info = useCallback((msg: string, d?: number) => addToast(msg, "info", d), [addToast]);

  const value = useMemo(
    () => ({ toasts, addToast, removeToast, success, error, warning, info }),
    [toasts, addToast, removeToast, success, error, warning, info],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
