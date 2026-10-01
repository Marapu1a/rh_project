// Test wallet bridge: sends only to the exact in-process Hardhat instance.
const assert = require('node:assert/strict');
const { prepare, guard } = require('./pons-direct-purchase.cjs');
async function purchase(options) {
  const { rpc, instanceId, account, onStep = () => {}, onSubmitted = () => {} } = options;
  // Impersonated accounts are not included in Hardhat eth_accounts. Model the
  // selected EIP-1193 account explicitly; every other method uses guarded RPC.
  const wallet = { request: ({method, params = []}) => method === 'eth_accounts'
    ? Promise.resolve([account]) : rpc(method, params) };
  for (let i = 0; i < 5; i++) {
    const plan = await prepare(options);
    await guard(rpc, instanceId);
    assert.equal(BigInt(await wallet.request({method:'eth_chainId',params:[]})), 4663n, 'Wallet chain changed');
    const accounts = await wallet.request({method:'eth_accounts',params:[]});
    assert.equal(accounts[0]?.toLowerCase(), account.toLowerCase(), 'Wallet account changed');
    // This bridge has no public RPC fallback, batch, signing, or automatic resend.
    const hash = await wallet.request(plan.request);
    await onSubmitted({plan,hash});
    const receipt = await rpc('eth_getTransactionReceipt', [hash]);
    assert(receipt, 'Transaction pending: stop, reconcile hash before continuing');
    assert.equal(BigInt(receipt.status), 1n, 'Transaction reverted');
    const tx = await rpc('eth_getTransactionByHash', [hash]);
    const expected = plan.request.params[0];
    assert.equal(tx.from.toLowerCase(), account.toLowerCase());
    assert.equal(tx.to.toLowerCase(), expected.to.toLowerCase());
    assert.equal(tx.input.toLowerCase(), expected.data.toLowerCase());
    assert.equal(BigInt(tx.value), 0n);
    await onStep({ plan, hash, receipt });
    if (plan.kind === 'buy') return { hash, wait: async () => ({ ...receipt, hash, status: Number(BigInt(receipt.status)) }) };
  }
  throw Error('Approval sequence did not converge');
}
module.exports = { purchase };
