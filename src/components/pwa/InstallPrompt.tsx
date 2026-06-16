"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Lightweight A2HS (Add to Home Screen) prompt for PWA install. */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferred || hidden) return null;

  return (
    <div className="mx-5 mt-4 flex items-center gap-3 rounded-md bg-primary-100 p-3 text-[13px]">
      <span className="text-lg">📲</span>
      <span className="flex-1">Cài 5S Daily vào màn hình chính để mở nhanh hơn.</span>
      <button
        className="font-semibold text-primary-700"
        onClick={async () => {
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
        }}
      >
        Cài đặt
      </button>
      <button className="text-ink-muted" onClick={() => setHidden(true)} aria-label="Bỏ qua">
        ✕
      </button>
    </div>
  );
}
