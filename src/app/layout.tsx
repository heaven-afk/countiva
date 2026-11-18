import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import "./countiva-ui.css";
import "./v2.css";
import "./landing-motion.css";
import "./subscription-management.css";
import "./auth-feedback.css";
import "./workspace-layout.css";
import "./seo.css";
import "./receipts.css";
import { publicMetadata, SEO_ORIGIN, SITE_DESCRIPTION } from "../lib/seo";
import AppearanceProvider from "./appearance-provider";
import AppInstallProvider from "./app-install-provider";
export const metadata: Metadata = {
  ...publicMetadata(
    "Countiva | Inventory & Sales Management for Small Businesses",
    SITE_DESCRIPTION,
    "/",
  ),
  metadataBase: new URL(SEO_ORIGIN),
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  applicationName: "Countiva",
  icons: {
    icon: [{ url: "/favicon.svg?v=4", type: "image/svg+xml", sizes: "any" }],
    apple: [
      {
        url: "/brand/apple-touch-icon.png?v=4",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: { capable: true, title: "Countiva", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f0ec" },
    { media: "(prefers-color-scheme: dark)", color: "#161616" },
  ],
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script
          id="countiva-initial-appearance"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('countiva-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'system'}catch(e){}})()`,
          }}
        />
        <AppearanceProvider>
          <AppInstallProvider>{children}</AppInstallProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
