import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeControl from "./theme-control";
export const metadata: Metadata = {
  title: "Countiva — Your business, in view",
  description: "Inventory, sales and useful insights for growing shops.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6fc" },
    { media: "(prefers-color-scheme: dark)", color: "#101827" },
  ],
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('countiva-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'system'}catch(e){}})()`,
          }}
        />
        <div className="appearance-bar">
          <ThemeControl />
        </div>
        {children}
      </body>
    </html>
  );
}
