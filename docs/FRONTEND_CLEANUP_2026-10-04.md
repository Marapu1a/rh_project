# Frontend cleanup — 4 October 2026

Status: local review complete; not deployed to production.

Main HK page follows participation → draws → wallet → funding → rules. Footer has grouped navigation, no duplicate rules link or repeated connect band. Wallet data provenance and prize balances remain available in disclosures. Purchase statuses retain pending/confirmed distinctions. Transparency now describes the launched token and pending draws without local development diary text. Product rules and the published late-purchase notice were not changed.

Validation: `SITE_TEST_PATH=/concepts/hk/ node --test web/site.test.cjs web/wallet.test.cjs web/overview.test.cjs`: 19/20 initially; the history test's selector assumed only one disclosure. Scoped it to draw history and reran overview: 3/3. All 20 unique targeted cases passed across these runs. No full suite claimed.

Playwright screenshots and overflow checks at 1440, 768, 390, 320 px passed. Footer and mobile page visually inspected. Local transparency, notice and evidence pages return HTTP 200. `git diff --check` passed. Screenshots in `.local/logs/frontend-*.png`.

Preview: http://127.0.0.1:4180/concepts/hk/ . Static preview proxies the public read-only API; data availability remains dependent on that API. No financial automation or production files changed. Production transfer is a separate next step.
