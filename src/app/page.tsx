import LandingPage from "./landing-page";
import { SEO_ORIGIN, SITE_DESCRIPTION } from "../lib/seo";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SEO_ORIGIN}/#organization`,
      name: "Countiva",
      url: SEO_ORIGIN,
      logo: `${SEO_ORIGIN}/brand/countiva-512.png?v=4`,
      description: SITE_DESCRIPTION,
    },
    {
      "@type": "WebSite",
      "@id": `${SEO_ORIGIN}/#website`,
      name: "Countiva",
      url: `${SEO_ORIGIN}/`,
      description: SITE_DESCRIPTION,
      inLanguage: "en-NG",
      publisher: { "@id": `${SEO_ORIGIN}/#organization` },
    },
  ],
};
export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <LandingPage />
    </>
  );
}
