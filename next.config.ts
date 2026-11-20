import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating navigator occupies the indicator's default mobile position.
  devIndicators: false,
  env: {
    NEXT_PUBLIC_APP_VERSION:
      process.env.VERCEL_GIT_COMMIT_SHA || new Date().toISOString(),
  },
  // Vercel already redirects the apex host to www.countiva.shop.
  // Do not add the reverse redirect here: it would create a loop.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
