import type { Metadata } from "next";
import type { ReactNode } from "react";
export const metadata: Metadata = {
  title: "Platform administration | Countiva",
  robots: { index: false, follow: false },
  manifest: "/admin-manifest.webmanifest",
  applicationName: "Countiva Admin",
  appleWebApp: {
    capable: true,
    title: "Countiva Admin",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/brand/admin-icon.svg?v=1", type: "image/svg+xml" }],
    apple: [
      { url: "/brand/admin-180.png?v=1", sizes: "180x180", type: "image/png" },
    ],
  },
};
export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
