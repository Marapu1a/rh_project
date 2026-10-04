# Search and AI discovery preparation — 4 October 2026

Status: prepared and checked locally; production unchanged.

Added unique title/description, absolute canonical and Open Graph metadata to the production HK template and transparency page. Existing social image inspected. Added robots.txt, sitemap.xml (home, transparency, immutable notice) and concise llms.txt with official token identity and links, avoiding duplicated live status. Local server serves text/XML with correct MIME. Runtime builder already copies all web files and promotes HK to root.

Read-only live check: home200 with no X-Robots-Tag; robots.txt and sitemap.xml404. This does not establish crawl/index status. Local preview nginx intentionally has noindex and deny-all robots: retain those staging protections, do not deploy that entire config as production.

Validation: all three discovery files HTTP200 with correct MIME from fresh local server; home/transparency each have one canonical, description and H1 and readable main content with JavaScript disabled. XML parsed and three absolute HTTPS URLs confirmed. git diff --check passed. Published notice bytes unchanged. No runtime financial logic or product rules changed.

Production follow-up, as a separate deployment:
- Publish the complete reviewed frontend and discovery files together, retain preview noindex protections on preview hosts.
- Verify final HTTPS hostname/redirects,200 for canonical pages and robots/sitemap/llms,404 for unknown pages, no production noindex or bot challenge. Canonical home is https://qianqi.site/; old concept pages must not become separate search landing pages.
- Verify domain ownership in Google Search Console and Bing Webmaster Tools; submit https://qianqi.site/sitemap.xml and inspect home/transparency. User/account or DNS verification required; no verification tokens invented or submissions performed.
- Inspect indexing and crawler access after deployment. Keep dated project status accurate as automation goes live. Sitemap contains no synthetic change dates or priority claims.

Sources:
- https://developers.google.com/search/docs/fundamentals/ai-optimization-guide — ordinary crawlable useful content; llms.txt is not required or specially used by Google Search.
- https://llmstxt.org/ — proposed agent navigation convention, not an indexing guarantee.

No promises of rankings, AI citations, rich results or security endorsements. robots.txt governs cooperative crawling, not access control. Public page bodies already expose substantive rules without requiring a wallet or JavaScript. No SEO plugin, extra tracking or external submissions added.
