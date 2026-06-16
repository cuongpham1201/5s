"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { PwaRegister } from "@/components/pwa/PwaRegister";

/** Client providers wrapper (session + PWA service worker registration). */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <PwaRegister />
      {children}
    </SessionProvider>
  );
}
