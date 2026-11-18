# Countiva search setup

The public pages target Countiva brand searches and inventory management, sales tracking, customer credit and business receipt topics. Descriptions focus on small shops, retailers and wholesalers in Nigeria, matching the current NGN product pricing.

The canonical search host is https://www.countiva.shop, matching the live redirect from countiva.shop. The application’s public address can still be entered as countiva.shop. Keep that redirect in place so the canonical pages and sitemap resolve directly on the preferred host.

## Deploy

Merge the SEO update into the production branch and let Vercel finish deployment. Confirm that the following URLs return successfully.

- https://www.countiva.shop/
- https://www.countiva.shop/plans
- https://www.countiva.shop/inventory-management
- https://www.countiva.shop/sales-tracking
- https://www.countiva.shop/receipts
- https://www.countiva.shop/robots.txt
- https://www.countiva.shop/sitemap.xml
- https://www.countiva.shop/opengraph-image

Public pages include distinct titles, descriptions, canonical links and social sharing metadata. The home page includes Organization and WebSite structured data with the Countiva name and logo. Account and private workspace pages use noindex. The sitemap lists the five public content pages.

## Google Search Console

1. Open https://search.google.com/search-console.
2. Add a Domain property for countiva.shop.
3. Copy the TXT verification record Google supplies into the domain’s DNS provider, then choose Verify.
4. Submit https://www.countiva.shop/sitemap.xml in Sitemaps.
5. Use URL Inspection for the homepage and the three feature pages. Check the live URL and request indexing.

DNS verification establishes access to the domain. It does not require a database migration or a Google password in the application. The sitemap and metadata become live after deployment. Search Console provides indexing status and search queries once Google has processed the site.

Indexing and rankings depend on Google’s crawling and evaluation. Search snippets may differ from the supplied titles and descriptions. This implementation adds discovery and descriptive metadata without claiming a ranking or indexing date.

Google references include [sitemap submission](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [requesting a recrawl](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl), and [indexing guidance](https://developers.google.com/search/help/crawling-index-faq).
