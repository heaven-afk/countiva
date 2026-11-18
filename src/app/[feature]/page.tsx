import { notFound } from "next/navigation";
import { featurePages, publicMetadata } from "../../lib/seo";
import Brand from "../brand";
import ThemeControl from "../theme-control";

export const dynamicParams = false;
export function generateStaticParams() {
  return featurePages.map(({ slug }) => ({ feature: slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  const { feature } = await params;
  const page = featurePages.find(({ slug }) => slug === feature);
  if (!page) notFound();
  return publicMetadata(page.title, page.description, `/${page.slug}`);
}
export default async function FeaturePage({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  const { feature } = await params;
  const page = featurePages.find(({ slug }) => slug === feature);
  if (!page) notFound();
  return (
    <main className="landing-page seo-feature">
      <header className="landing-header">
        <Brand />
        <div className="landing-header-actions">
          <ThemeControl />
          <a className="button secondary" href="/plans">
            View plans
          </a>
          <a className="button primary" href="/signup">
            Get started
          </a>
        </div>
      </header>
      <article className="landing-section">
        <a className="text-button" href="/">
          Countiva home
        </a>
        <h1>{page.heading}</h1>
        <p className="seo-introduction">{page.introduction}</p>
        {page.sections.map((section) => (
          <section className="seo-content-section" key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.text}</p>
          </section>
        ))}
        <div className="landing-hero-actions">
          <a className="button primary" href="/signup">
            Create your Countiva account
          </a>
          <a className="button secondary" href="/plans">
            Compare subscription plans
          </a>
        </div>
      </article>
      <nav
        className="landing-section seo-related"
        aria-label="Explore Countiva features"
      >
        {featurePages
          .filter(({ slug }) =>
            page.related.some((related) => related === slug),
          )
          .map((related) => (
            <a href={`/${related.slug}`} key={related.slug}>
              {related.heading}
            </a>
          ))}
      </nav>
      <footer className="landing-footer">
        <Brand />
        <a href="/login">Log in to Countiva</a>
      </footer>
    </main>
  );
}
