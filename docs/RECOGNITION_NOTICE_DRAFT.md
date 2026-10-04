# Late purchase confirmation — draft

Status: NOT PUBLISHED. No announcement clock has started.

## Public copy

Verified buys earn tickets. Every 100 USDG in qualifying purchases adds one Short
ticket and one Monthly ticket. Smaller qualifying amounts carry forward.

Some purchase routes are still being checked. If an earlier purchase is confirmed
later, its tickets become available for future draws. Draws already locked or
completed stay unchanged. A confirmed purchase is counted once; its original
transaction and confirmation date remain visible.

This update covers verified purchases through the Pons router
`0x65050a9b7e5075a2ba5ced7b1b64ee66262c40dc`: the supported direct USDG route and
the supported ETH → WETH → USDG route into the QIANQI curve. Other routes remain
under review; using the Pons interface alone does not guarantee eligibility.
For these USDG purchases, the qualifying amount is the verified net USDG debit
from the buyer, including the route fee and accounting for refunds. For these
ETH purchases, it is the verified USDG delivered to the curve; ETH gas and
native route fees do not count toward tickets.

QIANQI on Robinhood Chain (4663):
`0x6EA39A23AA46E51CA6CD2d1cbc0B5bfb29ECB216`.

We use QuickNode for blockchain receipts, execution traces and historical code.
Our checks reproduce ticket accounting from this evidence. They are not an
independent execution audit. Evidence bundles will be available by their
on-chain hash before confirmations are published.

## Publication record to complete

Before publishing, add the current launch status, canonical source address,
evidence location and earliest confirmation time. Record the public URL, exact
content hash and publication timestamp. First confirmation must wait until both
24 hours after this announcement and the contract's availableAt have elapsed.
A draft or a Git commit alone is not the project's public announcement.
