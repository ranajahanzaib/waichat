import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastActionsContextType {
  addToast: (message: string, type: ToastType, duration?: number, action?: Toast["action"]) => void;
  removeToast: (id: string) => void;
  success: (message: string, duration?: number, action?: Toast["action"]) => void;
  error: (message: string, duration?: number, action?: Toast["action"]) => void;
  warning: (message: string, duration?: number, action?: Toast["action"]) => void;
  info: (message: string, duration?: number, action?: Toast["action"]) => void;
}

const ToastStateContext = createContext<Toast[] | undefined>(undefined);
const ToastActionsContext = createContext<ToastActionsContextType | undefined>(undefined);

const MAX_TOASTS = 3;
const DEFAULT_DURATION = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType, duration?: number, action?: Toast["action"]) => {
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
          return [{ ...existing, id: generateId(), action }, ...updated];
        }

        const newToast: Toast = {
          id: generateId(),
          message,
          type,
          action,
          duration:
            duration ?? (type === "error" ? 8000 : type === "warning" ? 6000 : DEFAULT_DURATION),
        };

        const next = [newToast, ...prev];
        if (next.length > MAX_TOASTS) {
          return next.slice(0, MAX_TOASTS);
        }
        return next;
      });
    },
    [],
  );

  const success = useCallback(
    (msg: string, d?: number, a?: Toast["action"]) => addToast(msg, "success", d, a),
    [addToast],
  );
  const error = useCallback(
    (msg: string, d?: number, a?: Toast["action"]) => addToast(msg, "error", d, a),
    [addToast],
  );
  const warning = useCallback(
    (msg: string, d?: number, a?: Toast["action"]) => addToast(msg, "warning", d, a),
    [addToast],
  );
  const info = useCallback(
    (msg: string, d?: number, a?: Toast["action"]) => addToast(msg, "info", d, a),
    [addToast],
  );

  const actions = useMemo(
    () => ({ addToast, removeToast, success, error, warning, info }),
    [addToast, removeToast, success, error, warning, info],
  );

  return (
    <ToastStateContext.Provider value={toasts}>
      <ToastActionsContext.Provider value={actions}>{children}</ToastActionsContext.Provider>
    </ToastStateContext.Provider>
  );
}

/** Returns the current list of toasts (state) */
export function useToasts() {
  const context = useContext(ToastStateContext);
  if (context === undefined) {
    throw new Error("useToasts must be used within a ToastProvider");
  }
  return context;
}

/** Returns the stable action functions for triggering toasts */
export function useToast() {
  const context = useContext(ToastActionsContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
