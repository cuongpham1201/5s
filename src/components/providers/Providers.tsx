"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import { SessionCaptureProvider } from "@/features/capture/session-context";
import { SyncRunner } from "@/components/system/SyncRunner";
import { OfflineBanner } from "@/components/system/OfflineBanner";

/** Client providers wrapper (auth session + capture session + PWA SW + sync). */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SessionCaptureProvider>
        <PwaRegister />
        <SyncRunner />
        <OfflineBanner />
        {children}
      </SessionCaptureProvider>
    </SessionProvider>
  );
}
