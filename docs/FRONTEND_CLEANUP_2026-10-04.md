# Frontend cleanup — 4 October 2026

Status: local review complete; not deployed to production.

Main HK page follows participation → draws → wallet → funding → rules. Footer has grouped navigation, no duplicate rules link or repeated connect band. Wallet data provenance and prize balances remain available in disclosures. Purchase statuses retain pending/confirmed distinctions. Transparency now describes the launched token and pending draws without local development diary text. Product rules and the published late-purchase notice were not changed.

Validation: `SITE_TEST_PATH=/concepts/hk/ node --test web/site.test.cjs web/wallet.test.cjs web/overview.test.cjs`: 19/20 initially; the history test's selector assumed only one disclosure. Scoped it to draw history and reran overview: 3/3. All 20 unique targeted cases passed across these runs. No full suite claimed.

Playwright screenshots and overflow checks at 1440, 768, 390, 320 px passed. Footer and mobile page visually inspected. Local transparency, notice and evidence pages return HTTP 200. `git diff --check` passed. Screenshots in `.local/logs/frontend-*.png`.

Preview: http://127.0.0.1:4180/concepts/hk/ . Static preview proxies the public read-only API; data availability remains dependent on that API. No financial automation or production files changed. Production transfer is a separate next step.

## Market chart and token balance follow-up

Removed draw-card bottom strips; Monthly probabilities remain correctly explained in rules (75% payout / 25% rollover, not a money split). Added prominent Pons links in hero and market section, and connected the existing buy dialog to the published token address. No swap execution was added.

GeckoTerminal official embed: https://about.geckoterminal.com/embed-charts . API search verified Robinhood pool 0x12ba58b5455fdbc15165e0e8b2096498d2c684f1 against QIANQI token 0x6EA39A23AA46E51CA6CD2d1cbc0B5bfb29ECB216. Real chart rendered in browser; screenshot `.local/logs/market-chart.png`. External availability is outside our control; direct chart link remains visible. Local server and nginx template allow only GeckoTerminal in frame-src. Apply this CSP change with the future production deployment.

Connected wallet balance uses read-only eth_call balanceOf and decimals against the fixed published QIANQI address on chain4663. Exact integer formatting, network/account/disconnect guards, timeout/error display; no signature or transaction. Test deployment does not query the production token. Ticket API failure does not erase an independently read token balance.

Validation: site/wallet/overview/token-balance tests: 19/21 initially; two old wallet assertions assumed no eth_call and were adjusted to retain checks on connection/permission methods. Those two reran 2/2 PASS. 21 unique cases passed across runs. New test covers exact large balance, read error, obsolete account response and disconnect. Mobile overflow checks320/390 passed. Production unchanged. Updated preview runs at http://127.0.0.1:4181/concepts/hk/ .

Fee-copy follow-up: removed decorative link/button arrows. Public funding copy now shows the 3% creator fee as 2.7% prizes + 0.15% gas/operations + 0.15% team, including rules and transparency. Accounting unchanged; collected-funds qualification retained. Visual check found longer percentages overflowed320px; funding cards now stack on mobile. Desktop screenshot reviewed;320px recheck passed. No runtime logic changed.

## USDG display — 5 October 2026

Published to production: pool/reserve/history/reward amounts show at most two decimals, truncated so the display does not overstate available funds. Positive sub-cent amounts show <0.01. Remaining spend for tickets rounds up to cents. Raw accounting and transaction amounts and QIANQI token balances retain precision. Draw cards stack below650px; amounts no longer wrap inside digits.

Validation: `SITE_TEST_PATH=/concepts/hk/ node --test web/site.test.cjs web/overview.test.cjs` 6/6 PASS. Browser checks320/390/650/768/1440px passed with real-sized amounts. Live320px shows135.12 and90.08USDG with no page overflow and a single card column; screenshot `.local/logs/usdg-mobile-live.png`. Published app.js, overview.js and concepts/hk/style.css; originals backed up at `/opt/qianqi/backups/usdg-display-20261005`. No financial runtime changes.

Scroll regression follow-up05.10: removed overflow-x:auto from draw amounts (it implicitly made overflow-y:auto and exposed font ink overflow); set line-height1.2. Local browser checks at320/390/650/768/1024/1552/1920px passed, with no internal scroll or page overflow. Desktop screenshot reviewed. Published CSS only; live320/1552px verified. Backup: usdg-display-20261005/style.css.before-scroll-fix.

Wallet Buy follow-up05.10: coral BUY ON PONS link added immediately after the remaining-ticket-spend text, before wallet controls. Reuses existing styles and official hero/market destination, no arrows or wallet transaction handler. Browser checks320/390/768/1552px and live390px passed; mobile screenshot reviewed. Published root index.html; backup /opt/qianqi/backups/wallet-buy-20261005/index.html.before.
