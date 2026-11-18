import type { MetadataRoute } from "next";
import { SEO_ORIGIN } from "../lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SEO_ORIGIN}/sitemap.xml`,
  };
}
