// Local-only unsigned purchase planner. No public wallet sender or admission.
const { Interface, AbiCoder, keccak256, isAddress, ZeroAddress } = require('ethers');
const V = require('./pons-v4-buy.cjs'), P = require('./pons-curve-buy.cjs');
const { FAB } = require('./integrations/pons-v2.cjs');
const QUOTER = '0xe202BB8dd524eE9C5E679e5B5809f7A373a982Ef';
const ERC = new Interface(['function allowance(address,address) view returns(uint256)', 'function approve(address,uint256) returns(bool)', 'function balanceOf(address) view returns(uint256)']);
const PERMIT = new Interface(['function allowance(address,address,address) view returns(uint160,uint48,uint48)', 'function approve(address,address,uint160,uint48)']);
const QUOTE = new Interface([`function quoteExactInputSingle((${V.KEY} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData)) returns(uint256 amountOut,uint256 gasEstimate)`]);
const low = s => s.toLowerCase(), check = (x, message) => { if (!x) throw Error(message); };
async function guard(rpc, instanceId) {
  check(typeof instanceId === 'string' && instanceId.length > 0, 'Local instance required');
  check(Number(BigInt(await rpc('eth_chainId', []))) === 4663, 'Expected local fork chain 4663');
  const meta = await rpc('hardhat_metadata', []);
  check(meta.instanceId === instanceId && Number(meta.chainId) === 4663, 'Local fork instance mismatch');
}
async function prepare({ rpc, instanceId, manifest: m, account, amountRaw, slippageBps = 100 }) {
  await guard(rpc, instanceId);
  const profile=require('./pons-profiles.cjs').pool(m.schema);check(profile,'Expected Pons pool-capable profile');profile.validate(m);
  check(Number(m.chainId) === 4663, 'Expected manifest chain 4663');
  check(isAddress(account) && low(account) !== ZeroAddress && !profile.FIELDS.some(k => low(m[k]) === low(account)), 'Invalid buyer');
  check(typeof amountRaw === 'string' && /^[1-9][0-9]*$/.test(amountRaw), 'Positive raw USDG amount required');
  const amount = BigInt(amountRaw);
  check(amount < 1n << 128n, 'Amount exceeds route limit');
  check(Number.isInteger(slippageBps) && slippageBps >= 1 && slippageBps <= 500, 'Slippage must be 1..500 bps');
  const block = await rpc('eth_getBlockByNumber', ['latest', false]), tag = block.number;
  const now = BigInt(block.timestamp), deadline = now + 1200n;
  const read = async (to, abi, name, args = []) => abi.decodeFunctionResult(name, await rpc('eth_call', [{ from: account, to, data: abi.encodeFunctionData(name, args) }, tag]));
  for (const field of profile.FIELDS) check(keccak256(await rpc('eth_getCode', [m[field], tag])) === m.codeHashes[field], 'Runtime mismatch: ' + field);
  // A batch-capable profile also pins the exact delegated account implementation.
  const buyerCode=await rpc('eth_getCode',[account,tag]);
  check(buyerCode==='0x'||profile.FIELDS.includes('batchExecutor')&&buyerCode.toLowerCase()==='0xef0100'+m.batchExecutor.toLowerCase().slice(2),'Smart/delegated account not admitted');
  await profile.validateBindings(m, rpc, tag);
  const [record] = await read(m.factory, new Interface(FAB), 'getLaunchedToken', [m.token]);
  check(record.phase === 0n || record.phase === 2n, 'Market transitioning; refresh after graduation');
  check((await read(m.quote, ERC, 'balanceOf', [account]))[0] >= amount, 'Insufficient USDG');
  const venue = record.phase === 0n ? 'curve' : 'pool';
  let kind, to, data, quoteOut = null, minimumOut = null;
  const spender = venue === 'curve' ? m.curve : m.permit2;
  const [allowance] = await read(m.quote, ERC, 'allowance', [account, spender]);
  if (allowance < amount) {
    kind = allowance > 0n ? 'reset-usdg-approval' : 'approve-usdg'; to = m.quote;
    data = ERC.encodeFunctionData('approve', [spender, allowance > 0n ? 0n : amount]);
  } else if (venue === 'pool') {
    const [allowed, expiration] = await read(m.permit2, PERMIT, 'allowance', [account, m.quote, m.router]);
    if (allowed < amount || expiration <= now + 60n) {
      kind = 'approve-router'; to = m.permit2;
      data = PERMIT.encodeFunctionData('approve', [m.quote, m.router, amount, deadline]);
    }
  }
  if (!kind) {
    kind = 'buy';
    if (venue === 'curve') {
      [quoteOut] = await read(m.curve, P.CALL, 'buy', [amount, 0n, account]);
      const [remaining] = await read(m.curve, new Interface(['function sellableTokens() view returns(uint256)']), 'sellableTokens');
      // Curve scales minTokensOut on a partial fill. Do not claim the same
      // absolute floor across graduation until that case has its own planner.
      check(quoteOut < remaining, 'Purchase reaches graduation; partial-fill route not admitted');
      minimumOut = quoteOut * BigInt(10000 - slippageBps) / 10000n;
      to = m.curve; data = P.CALL.encodeFunctionData('buy', [amount, minimumOut, account]);
    } else {
      check(await rpc('eth_getCode', [QUOTER, tag]) !== '0x', 'Quoter unavailable');
      [quoteOut] = await read(QUOTER, QUOTE, 'quoteExactInputSingle', [[m.poolKey, low(m.poolKey[0]) === low(m.quote), amount, '0x']]);
      minimumOut = quoteOut * BigInt(10000 - slippageBps) / 10000n;
      const coder = AbiCoder.defaultAbiCoder();
      const params = [coder.encode([V.SPEC], [[m.poolKey, low(m.poolKey[0]) === low(m.quote), amount, minimumOut, 0, '0x']]),
        coder.encode(['address', 'uint256'], [m.quote, amount]), coder.encode(['address', 'uint256'], [m.token, minimumOut])];
      to = m.router;
      data = V.CALL.encodeFunctionData('execute', ['0x10', [coder.encode(['bytes', 'bytes[]'], ['0x060c0f', params])], deadline]);
    }
    check(minimumOut > 0n, 'Quote too small');
  }
  const transaction = { from: account, to, data, value: '0x0', chainId: '0x1237' };
  // Simulate the precise next call. Re-prepare after every approval receipt.
  await rpc('eth_call', [{ from: account, to, data, value: '0x0' }, tag]);
  check((await rpc('eth_getBlockByNumber', [tag, false])).hash === block.hash, 'Quote block changed');
  return { schema: 'pons-local-direct-purchase-v1', localOnly: true, instanceId, venue, kind, amountRaw,
    slippageBps, snapshot: { number: Number(BigInt(tag)), hash: block.hash },
    quoteOut: quoteOut?.toString() ?? null, minimumOut: minimumOut?.toString() ?? null,
    expiresAt: Number(deadline), request: { method: 'eth_sendTransaction', params: [transaction] } };
}
module.exports = { prepare, guard, ERC, PERMIT, QUOTE, QUOTER };
