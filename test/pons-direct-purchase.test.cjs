const { test } = require('node:test'), assert = require('node:assert/strict');
const { ethers } = require('ethers');
const { prepare, guard } = require('../scripts/pons-direct-purchase.cjs');
const V = require('../scripts/pons-v4-buy.cjs'), P = require('../scripts/pons-curve-buy.cjs');
const address = n => ethers.getAddress('0x' + BigInt(n).toString(16).padStart(40, '0'));
function fixture() {
  const m = { schema: V.SCHEMA, routeVersion: V.ID, chainId: 4663, eligibility: 'automatic-buy-v1', quoteBasis: 'wallet-net-debit-v1', quoteDecimals: 6, entryThresholdRaw: '100000000', anchor: {number: 1, hash: ethers.id('anchor')}, hookFeeBps: 100, creatorTaxBps: 300, codeHashes: {} };
  for (const [i, k] of P.FIELDS.entries()) { m[k] = address(i + 10); m.codeHashes[k] = ethers.id(k); }
  m.quote = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
  for (const [k, [a, h]] of Object.entries(V.PINS)) { m[k] = a; m.codeHashes[k] = h; }
  m.poolKey = [...[m.token, m.quote].sort((a,b) => BigInt(a)<BigInt(b)?-1:1), 0, 200, m.hook]; m.poolId = V.poolId(m.poolKey);
  return m;
}
const local = async method => {
  if (method === 'eth_chainId') return '0x1237';
  if (method === 'hardhat_metadata') return { instanceId: 'local', chainId: 4663 };
  throw Error('Unexpected RPC: ' + method);
};
test('purchase planner refuses public RPC and a different local instance before state reads', async () => {
  await assert.rejects(guard(async m => { if(m==='eth_chainId')return '0x1237'; throw Error('method not found'); }, 'local'), /method not found/);
  await assert.rejects(guard(local, 'other'), /instance mismatch/);
  await assert.rejects(guard(local, ''), /instance required/);
  await assert.rejects(guard(async () => '0x1', 'local'), /4663/);
});
test('unsigned purchase rejects malformed amounts, excessive slippage and service recipients', async () => {
  const opts = { rpc: local, instanceId: 'local', manifest: fixture(), account: address(100), amountRaw: '101000000' };
  for(const amountRaw of ['0','-1','1.5','1e8','01',101000000]) await assert.rejects(prepare({...opts, amountRaw}), /raw USDG/);
  await assert.rejects(prepare({...opts,amountRaw:String(1n<<128n)}), /route limit/);
  for(const slippageBps of [0,501,10000,1.5,NaN]) await assert.rejects(prepare({...opts,slippageBps}), /Slippage/);
  await assert.rejects(prepare({...opts,account:opts.manifest.router}), /buyer/);
  await assert.rejects(prepare({...opts,account:ethers.ZeroAddress}), /buyer/);
  await assert.rejects(prepare({...opts,manifest:{...opts.manifest,router:address(99)}}), /pin/);
});
test('runtime drift blocks the unsigned request; no signing or sending RPC is used', async () => {
  const calls=[];
  const rpc=async(method,args)=>{calls.push(method);if(method==='eth_getBlockByNumber')return {number:'0x2',timestamp:'0x1000',hash:ethers.id('block')};if(method==='eth_getCode')return '0x';return local(method,args);};
  await assert.rejects(prepare({rpc,instanceId:'local',manifest:fixture(),account:address(100),amountRaw:'101000000'}), /Runtime mismatch/);
  assert(!calls.some(m=>/send|sign/i.test(m)));
});
