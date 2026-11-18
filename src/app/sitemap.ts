import type { MetadataRoute } from "next";
import { featurePages, SEO_ORIGIN } from "../lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/plans", ...featurePages.map((page) => `/${page.slug}`)].map(
    (path) => ({
      url: new URL(path, SEO_ORIGIN).href,
    }),
  );
}
