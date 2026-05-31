import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wco = () => (navigator as any).windowControlsOverlay ?? null;

export function usePWA() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [wcoActive, setWcoActive] = useState<boolean>(() => !!wco()?.visible);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    const overlay = wco();
    if (!overlay) return;
    const handler = () => setWcoActive(!!overlay.visible);
    overlay.addEventListener("geometrychange", handler);
    return () => overlay.removeEventListener("geometrychange", handler);
  }, []);

  useEffect(() => {
    const setOnline = () => setIsOffline(false);
    const setOffline = () => setIsOffline(true);
    window.addEventListener("online", setOnline);
    window.addEventListener("offline", setOffline);
    return () => {
      window.removeEventListener("online", setOnline);
      window.removeEventListener("offline", setOffline);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted" || outcome === "dismissed") {
      setInstallPrompt(null);
    }
  }, [installPrompt]);

  const dismissInstall = useCallback(() => {
    setInstallPrompt(null);
  }, []);

  return { canInstall: !!installPrompt, triggerInstall, dismissInstall, isOffline, wcoActive };
}
