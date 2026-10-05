# Controlled automation activation — 5 October 2026

User authorized the separate production transfer after the local scanner/sender
package passed. Recognition remains independently disabled; its notice window
is not bypassed. This report records real execution, not the earlier fork tests.

## Deployment

Installed `/opt/qianqi/releases/payout-sender-eb74ac9` from verified
`funding-paced-20261004`, overlaying the six hash-checked files prepared in
[the readiness package](PAYOUT_SENDER_READINESS_2026-10-05.md). All327 manifest
entries verified before and after installation. Contracts, profile and config
were not changed. Original financial state, public config/profile, service
override and backup script are preserved in
`/opt/qianqi/backups/payout-sender-eb74ac9`.

New service override `80-payout-sender.conf` selects this working directory and
its integrity precheck; existing credentials and execution parameters remain.
Preflight matched100 checks, executor nonce latest/pending/finalized3, balance
0.000990438702004ETH. No pending intent or stale financial lock was present.

## Controlled passes

Each trial uses the production CLI as qianqi, systemd credentials, the same
config/profile/journal and maxTransactions2, without watch. No journal reset or
manual transaction replacement was used.

First trial exited0, waiting without failures, after two successful transactions:

| Action | Nonce | Transaction | Block |
|---|---:|---|---:|
| sweepCurve | 3 | 0x8357f2480c9a67ccbfcd716d044488d601f7cc62ddd525780b752c858f09c484 | 80561696 |
| pull | 4 | 0xdd15b63b5a9c3abc9ed48f350ca5634396cb485a762273c87fe71b1610a47b6f | 80562318 |

Both receipts were independently re-read through QuickNode, with matching
executor, collector and canonical block. Receipt success does not itself assert
finality. Payout discovery advanced from79379859 to79579859; no pending intent
or lock remained at process exit. Second trial resumes that exact journal.

Second trial exited0 with two successful pay transactions:

| Recipient | Nonce | Transaction | Block |
|---|---:|---|---:|
| Prize vault | 5 | 0x86181d8c79f32042f167944613bc74d087c6b8aeaf4e60a1322b02ac2d8a392a | 80563745 |
| Common operations/team recipient | 6 | 0xdfc3cc07cd4b022065fe64e6d955c1218b3669d0d597c7cedf79aef2d28b996a | 80564439 |

All four receipts were rechecked against sender, target, nonce and canonical
block. Vault received5.342039USDG, reaching275.598728USDG; both collector credits
are0. Executor nonce latest/pending7; balance0.000979283091124ETH at observation.

Third trial sent0 transactions and exited0. A one-time return-value observer
(no execution changes, no raw transaction/provider data emitted) identified
the normalized `otherWait`: Short=`empty`, Monthly=`schedule`. These are ordinary
waiting conditions, not failed admissions. No new draw or winner payment is
claimed. The four receipts are funding operations.

## Operations

Backup script now takes its helper and release manifest from the actual
automation service working directory and records both workers' runtime
manifests. The old `/opt/qianqi/prepared` reference would describe a stale
release after this isolated deployment. Bash syntax and offline backup test1/1
passed; systemd unit verification passed apart from existing unrelated XFS
CPUAccounting warnings. Rollback keeps all financial journals and reconciles
any pending transaction before changing executable code.

Offline backup `/var/backups/qianqi-public/20261005T061126Z` succeeded, restarting
the previously active indexer. The archive was pulled to Windows with verified
SHA-256 and restored into a new local directory:12 files, no activation. Daily
backup timer is enabled; next scheduled run6 October04:00:32UTC. Windows hourly
off-server pull remains installed. Backup and monitor have their existing
limitations (same-server monitor cannot report a completely lost VPS).

At06:15:26UTC enabled and started `qianqi-public-automation.service` on the verified
release, retaining maxTransactions2/pollSeconds10 and Restart=no. Created the
explicit activation marker only after the three trials. Monitor timer resumed;
its first check reported `healthy`. First regular pass completed with0 sends,
and the service remained active without restarts. At06:18:26UTC two regular
passes had completed with0 sends and the third was running. Nonce latest/pending
remained7, no pending journal, payout cursor80568974 versus head80569025 (51
blocks of ordinary live lag, down from over1.1million). Indexer health was ready,
lag0 and no failures after its backup restart. Config/profile and all
transaction journals retain their original identities. Recognition publishing
is still false; earliest separate confirm remains05 October11:30UTC.

[Machine-readable evidence](evidence/AUTOMATION_ACTIVATION_2026-10-05.json) contains
preflight, receipts, balance snapshot, activation and off-server backup digest.
