# Bounded RPC / timing evidence, 29.09.2026

Read-only observations, not deployment or archive qualification. No credentials.
See [interpretation and limits](../../docs/OPERATIONAL_LAUNCH_PROFILE.md).

From repository root (PowerShell), with new output filenames:

```powershell
$env:RH_RPC_URL='https://rpc.mainnet.chain.robinhood.com'
node scripts/public-rpc-qualification.cjs research/operational-profile/ops-rpc-config.json .local/logs/new-official-first.json
node scripts/public-rpc-qualification.cjs research/operational-profile/ops-rpc-repeat-official-config.json .local/logs/new-official-repeat.json
$env:RH_RPC_URL='https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public'
node scripts/public-rpc-qualification.cjs research/operational-profile/ops-rpc-config.json .local/logs/new-blockreq-first.json
node scripts/public-rpc-qualification.cjs research/operational-profile/ops-rpc-repeat-blockreq-config.json .local/logs/new-blockreq-repeat.json
node scripts/rng-timing-survey.cjs .local/logs/new-timing.json https://rpc.mainnet.chain.robinhood.com https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public
```

Repeat configs reference the saved first observation, retaining its exact block numbers.
For a new independent pair, copy the config and set previous to that new first report.
Original execution used equivalent .local/logs paths; saved configs change only that path.

ops-rpc-*-first/repeat.json: blocks/receipts/logs/state and fresh-process repetition;
no admitted project manifest, therefore BUY replay not run. Both providers failed
complete sampled availability. ops-timing.json:6 rounds x2endpoints,12 observations;
not a worst-case bound, authenticated BLS evidence, or a production timing decision.
