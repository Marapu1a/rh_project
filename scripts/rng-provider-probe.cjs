// Read-only, public endpoints only. No signer, transactions, or service registration.
const fs = require('node:fs');
const path = require('node:path');
const { Interface, keccak256 } = require('ethers');
const chains = [
  { id: 4663, rpc: 'https://rpc.mainnet.chain.robinhood.com', contracts: {
    quiver: '0x8cF4f562301fA966F153eE1e3D46D975DF21C9a3',
    rhVrf: '0x1637195a674630E475ACD18B3D27b13C0EefDac1',
    dice: '0xd8a0680e7699526b57140ed4eafdcc7219dc0a0c',
  }, provider: '0xeB8E79d3495638Dde48336D01A1f1229822bB016' },
  { id: 46630, rpc: 'https://rpc.testnet.chain.robinhood.com', contracts: {
    quiver: '0x1da30d6465f657F11B4D7F6Db0B16aD79152fb40',
    dice: '0x43c8A7B1a85384cabf3D3Fd45a15C01F5b51A42D',
  }, provider: '0xc84CC91131b63d9BECFDe7b2DB3D0C653B690541' },
];
async function json(url, body) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), ...(body ? {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  } : {}) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function attempt(fn) { try { return await fn(); } catch (e) { return { error: e.message }; } }
async function probe(c) {
  const rpc = async (method, params = []) => {
    const r = await json(c.rpc, { jsonrpc: '2.0', id: 1, method, params });
    if (r.error) throw new Error(JSON.stringify(r.error));
    return r.result;
  };
  const actualChainId = Number(BigInt(await rpc('eth_chainId')));
  if (actualChainId !== c.id) throw new Error('Chain ID mismatch');
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  const contracts = {};
  for (const [name, address] of Object.entries(c.contracts)) {
    contracts[name] = await attempt(async () => {
      const code = await rpc('eth_getCode', [address.toLowerCase(), block.number]);
      return { address, codeBytes: (code.length - 2) / 2, codeHash: keccak256(code) };
    });
  }
  const abi = new Interface(['function getFee(address) view returns (uint128)']);
  const quiverFeeWei = await attempt(async () => {
    const raw = await rpc('eth_call', [{ to: c.contracts.quiver.toLowerCase(), data:
      abi.encodeFunctionData('getFee', [c.provider.toLowerCase()]) }, block.number]);
    return abi.decodeFunctionResult('getFee', raw)[0].toString();
  });
  const pairingEmpty = await attempt(() => rpc('eth_call', [{
    to: '0x0000000000000000000000000000000000000008', data: '0x',
  }, block.number]));
  const after = await rpc('eth_getBlockByNumber', [block.number, false]);
  if (after.hash !== block.hash) throw new Error('Pinned block changed during probe');
  return { chainId: actualChainId, rpc: c.rpc, block: { number: block.number, hash: block.hash,
    timestamp: block.timestamp }, contracts, quiverProvider: c.provider, quiverFeeWei,
    pairingEmpty, note: 'Code existence and empty pairing are not a service liveness or signature verification test.' };
}
(async () => {
  const hash = '04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3';
  const result = { checkedAt: new Date().toISOString(), chains: [], drand: { chainHash: hash } };
  result.chains = await Promise.all(chains.map(c => attempt(() => probe(c))));
  result.drand.info = await attempt(() => json(`https://api.drand.sh/${hash}/info`));
  result.drand.latest = await attempt(() => json(`https://api.drand.sh/${hash}/public/latest`));
  result.drand.note = 'HTTP observations only; signature has NOT been cryptographically verified.';
  const out = path.join(__dirname, '../research/rng-provider-study/observations.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
