"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import { SessionCaptureProvider } from "@/features/capture/session-context";

/** Client providers wrapper (auth session + capture session + PWA SW). */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SessionCaptureProvider>
        <PwaRegister />
        {children}
      </SessionCaptureProvider>
    </SessionProvider>
  );
}
