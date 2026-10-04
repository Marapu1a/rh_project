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

## Layout and load audit

4 October: inspected heading hierarchy (one H1, H2 sections, H3 steps), HTML content without JS, native links/details, table, iframe title, alt text and responsive layout. Added keyboard skip link, named main sections, column scopes and reduced-motion CSS. No claim that this is a full WCAG or HTML validator audit.

Measured initial local mobile viewport390x844, 2.5s after DOMContentLoaded, no network/CPU throttling, read-only API unavailable fixture. Before: first-party subresources1,287,739 bytes; after490,849 bytes, about62% less. Excludes main HTML and later external iframe traffic. Removed eager ethers526,551B + claim7,260B by loading those only for a configured local Claim deployment; hidden error illustration263,683B now lazy. Main mascot remains440,953B: a possible later image optimization, not changed here.

Local observations: LCP112ms before /116ms after, CLS0 in both. These localhost measurements do NOT establish production speed or field Core Web Vitals; no INP conclusion. Chart did not request on the initial mobile viewport, but native lazy loading can preload it earlier on larger screens. CSP and real external chart rendering were checked in the earlier frontend package.

Verified skip-link keyboard focus and target, all local fragment links and aria-labelledby targets, no horizontal overflow320/390/768/1440. Next production step: measure deployed build with mobile throttling/PageSpeed and check compression/cache headers; field Core Web Vitals require real traffic. Reference: https://developers.google.com/search/docs/appearance/page-experience .

Affected-path checks: `SITE_TEST_PATH=/concepts/hk/ node --test web/site.test.cjs web/token-balance.test.cjs web/claim.test.cjs` passed8/8, including browser test deployment Claim through actual local vault, reload and stale-data controls after lazy loading. Full suite not run.

## Production deployment — 4 October 2026

User explicitly authorized transfer. Published frontend3852a99 to `/var/www/qianqi/releases/frontend-3852a99` by cloning prior release and overlaying only reviewed HTML/CSS/JS/SEO files. Current symlink switched atomically. Prior release `/var/www/qianqi/releases/data-20260930` retained; nginx backup and previous target at `/opt/qianqi/backups/frontend-3852a99`.

Nginx CSP now permits GeckoTerminal frames. Initial index.html301 caused root internal-index redirect loop; detected immediately by external checks, removed that rule and reloaded validated nginx config. Final home and index.html200 with canonical root; concept URLs redirect home. No ongoing loop.

Post-deploy: home/transparency/robots/sitemap/llms/API200, missing page404, no X-Robots-Tag noindex. Home/app/SEO bytes match reviewed local files. Published notice SHA256 remains f1d1d7dd9bf685e2086d72fcb9f0cc2c30bf7132883a0a987a811f4321704c3d. Real GeckoTerminal chart visually inspected at `.local/logs/live-market.png`; no top-level browser errors, no overflow1440/390/320. Overview loads real API. Indexer active, financial automation inactive. No wallet transaction sent. Field Core Web Vitals and search-console ownership remain outstanding.

Rollback: restore current symlink to previous release and nginx from the backup; validate nginx then reload. Do not alter API service/config or financial state.
