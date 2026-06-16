import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";

export const metadata: Metadata = {
  title: "5S Daily",
  description: "Ứng dụng chụp & theo dõi 5S nội bộ (PWA)",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "5S Daily",
  },
  icons: {
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-192.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F6CBD",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
