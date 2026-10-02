const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('ethers');
const R=require('../scripts/pons-pool-batch-buy.cjs'),B=require('../scripts/pons-batch-buy.cjs'),D=require('../scripts/direct-buy.cjs');
const source=require('../docs/evidence/PONS_POOL_TERMINAL_2026-10-02.json');
function fixture(pay='USDG'){
 const m={...structuredClone(source.terminal.manifest),schema:R.SCHEMA,routeVersion:R.ID};
 const row=structuredClone(source.terminal.scenarios.find(s=>s.pay===pay&&s.mode==='batch').steps[0]);
 const block={number:row.tx.blockNumber,hash:row.tx.blockHash,parentHash:E.id('synthetic parent'),timestamp:1,transactions:[row]};
 block.batchAccounts={[row.tx.from.toLowerCase()]:{parentHash:block.parentHash,code:'0xef0100'+m.batchExecutor.slice(2)}};
 return {m,...row,block};
}
function editCalls(f,fn){const a=B.EXEC.decodeFunctionData('execute',f.tx.input);const [decoded]=E.AbiCoder.defaultAbiCoder().decode(B.TYPES,a.executionCalldata);const calls=decoded.map(c=>({target:c.target,value:c.value,callData:c.callData}));fn(calls);f.tx.input=B.EXEC.encodeFunctionData('execute',[a.mode,E.AbiCoder.defaultAbiCoder().encode(B.TYPES,[calls])]);}
test('executed terminal USDG/ETH batches admit only under new genesis',()=>{
 for(const pay of ['USDG','ETH']){const f=fixture(pay);D.validateManifest(f.m);const d=D.decodeTransaction(f.m,f.tx,f.receipt,f.block);assert.equal(d.length,1);assert.equal(d[0].status,'ELIGIBLE',JSON.stringify(d));assert.equal(d[0].reason,'SUPPORTED_POOL_SELF_BATCH_BUY');assert.equal(d[0].netQuoteDebitRaw,source.terminal.scenarios.find(s=>s.pay===pay&&s.mode==='batch').capture.amountIn);assert.equal(D.decodeTransaction(source.terminal.manifest,f.tx,f.receipt,f.block)[0].status,'UNSUPPORTED_ROUTE');}
});

test('fresh admitted fork evidence has one purchase and stable API balances in all four independent branches',()=>{
 const saved=require('../docs/evidence/PONS_POOL_BATCH_INDEX_API_2026-10-02.json').run;
 assert.equal(saved.status,'PONS_POOL_TERMINAL_MATRIX_PASSED');assert.equal(saved.publicSends,false);
 assert.equal(saved.terminal.scenarios.length,4);
 for(const s of saved.terminal.scenarios){
  assert.equal(s.indexApi.status,'PONS_POOL_BATCH_INDEX_API_PASSED');const [a,b]=s.indexApi.api.results;
  assert.deepEqual(a,b);assert.equal(a.purchases,1);assert.equal(a.rewards,0);
  const amount=BigInt(s.capture.amountIn),tickets=String(amount/100000000n);
  assert.equal(a.balances.SHORT.open,tickets);assert.equal(a.balances.MONTHLY.open,tickets);assert.equal(a.balances.carryRaw,String(amount%100000000n));
 }
});
test('wrong approvals, extra calls, outer value, missing delegation and contaminated receipts never mint',()=>{
 const mutations=[
  f=>f.tx.value='0x1',f=>f.block.batchAccounts={},f=>f.block.batchAccounts[f.tx.from.toLowerCase()].code='0x',
  f=>editCalls(f,c=>c.push(c[0])),f=>editCalls(f,c=>c[0].target=f.m.token),
  f=>editCalls(f,c=>c[0].callData=B.APPROVE.encodeFunctionData('approve',[f.m.router,E.MaxUint256])),
  f=>editCalls(f,c=>c.at(-2).callData=R.PERMIT.encodeFunctionData('approve',[f.m.quote,f.tx.from,2n**160n-1n,9999999999])),
  f=>f.receipt.logs.push({...f.receipt.logs.at(-1),logIndex:'0xffff'}),f=>f.receipt.blockHash=E.id('wrong block'),
 ];
 for(const change of mutations){const f=fixture();change(f);assert(R.decode(f.m,f.tx,f.receipt,f.block).every(d=>d.status!=='ELIGIBLE'));}
 const funded=fixture('ETH');editCalls(funded,c=>c[0].value+=1n);assert.equal(R.decode(funded.m,funded.tx,funded.receipt,funded.block)[0].status,'UNSUPPORTED_ROUTE');
});
test('ignored EIP-7702 authorization cannot deny another purchase; valid payer change still blocks',async()=>{
 const X=require('../scripts/pons-batch-route.cjs'),f=fixture();
 const wallet=new E.Wallet(E.id('public authorization regression key'));
 f.tx.from=wallet.address;f.block.batchAccounts={[wallet.address.toLowerCase()]:{parentHash:f.block.parentHash,code:'0xef0100'+f.m.batchExecutor.slice(2)}};
 const signed=await wallet.authorize({address:f.m.batchExecutor,chainId:f.m.chainId,nonce:1});
 const a={address:signed.address,chainId:E.toQuantity(signed.chainId),nonce:E.toQuantity(signed.nonce),r:signed.signature.r,s:signed.signature.s,yParity:E.toQuantity(signed.signature.yParity)};
 f.block.transactions.push({tx:{authorizationList:[{...a,r:E.ZeroHash,s:E.ZeroHash}]}});
 assert.doesNotThrow(()=>X.execution(f.m,f.tx,f.block));
 f.block.transactions.at(-1).tx.authorizationList=[a];assert.throws(()=>X.execution(f.m,f.tx,f.block),/In-block delegation change/);
 f.block.transactions.at(-1).tx.authorizationList=[{...a,chainId:'0x1'}];assert.doesNotThrow(()=>X.execution(f.m,f.tx,f.block));
});
