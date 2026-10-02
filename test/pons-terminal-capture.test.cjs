const {test}=require('node:test'),assert=require('node:assert/strict'),{Interface}=require('ethers');
const evidence=require('../docs/evidence/PONS_TERMINAL_CAPTURE_2026-10-02.json');
const {CALL}=require('../scripts/pons-curve-buy.cjs');
const erc=new Interface(['function approve(address spender,uint256 amount)']);
test('captured terminal calls match successful local receipts and yield one BUY per scenario',()=>{
 const {capture,fork}=require('../docs/evidence/PONS_TERMINAL_FORK_2026-10-02.json');
 const P=require('../scripts/pons-curve-buy.cjs');
 const manifest=require('../docs/evidence/PONS_CHANNEL_RECEIPTS_2026-10-02.json').manifest;
 assert.equal(fork.status,'CAPTURED_CALLS_LOCAL_FORK_PASSED');
 for(const row of fork.steps){
  const calls=row.label==='USDG'?capture.out.usd.calls:capture.out.eth.calls;
  assert.equal(row.steps.length,calls.length);
  for(let i=0;i<calls.length;i++){
   const {tx,receipt}=row.steps[i];assert.equal(receipt.status,'0x1');
   assert.equal(receipt.transactionHash,tx.hash);
   assert.equal(tx.input.toLowerCase(),calls[i].data.toLowerCase());
   assert.equal(tx.to.toLowerCase(),calls[i].to.toLowerCase());
   assert.equal(BigInt(tx.value),BigInt(calls[i].value||0));
  }
  const buys=row.steps.flatMap(s=>P.decode(manifest,s.tx,s.receipt));
  assert.equal(buys.length,1);assert.equal(buys[0].status,'ELIGIBLE');
  assert.equal(buys[0].payer,capture.out.account.toLowerCase());
  assert.equal(buys[0].netQuoteDebitRaw,row.label==='USDG'?'101000000':capture.out.eth.funding.minOut);
 }
});
test('captured Pons USDG plan pays exactly 101 USDG to the curve for the same account',()=>{
 const {out}=evidence;assert.equal(out.usd.calls.length,2);
 const approval=erc.parseTransaction({data:out.usd.calls[0].data});
 assert.equal(approval.args.spender.toLowerCase(),out.details.curve.toLowerCase());
 assert.equal(approval.args.amount,101000000n);
 const call=out.usd.calls[1],buy=CALL.parseTransaction({data:call.data});
 assert.equal(call.to.toLowerCase(),out.details.curve.toLowerCase());
 assert.equal(buy.args.quoteIn,101000000n);assert.equal(buy.args.recipient.toLowerCase(),out.account.toLowerCase());
 assert(buy.args.minTokensOut>0n);assert.equal(BigInt(call.value),0n);
});
test('captured ETH funding feeds only minimum USDG output into the final BUY',()=>{
 const {out}=evidence,{calls,funding}=out.eth;assert.equal(calls.length,5);
 assert.equal(calls[0].data,'0xd0e30db0');assert.equal(calls[0].value,'1000000000000000');
 assert.equal(calls[2].to.toLowerCase(),funding.route.router.toLowerCase());
 const approval=erc.parseTransaction({data:calls[3].data}),buy=CALL.parseTransaction({data:calls[4].data});
 assert.equal(approval.args.amount,BigInt(funding.minOut));
 assert.equal(buy.args.quoteIn,BigInt(funding.minOut));
 assert(BigInt(funding.expectedOut)>buy.args.quoteIn);assert.equal(buy.args.recipient.toLowerCase(),out.account.toLowerCase());
});
test('captured dispatcher tries batch, exposes text-based fallback, and keeps single BUY direct',()=>{
 const rows=Object.fromEntries(evidence.dispatch.map(x=>[x.label,x]));
 for(const label of ['USDG-batch','ETH-batch'])assert.deepEqual(rows[label].events.map(x=>x.method),['sendCalls']);
 assert.deepEqual(rows['ETH-fallback'].events.map(x=>x.method),['sendCalls','sendTransaction']);
 // Characterization of third-party behavior, not approval of this fallback policy.
 assert.deepEqual(rows['ETH-reject-with-method'].events.map(x=>x.method),['sendCalls','sendTransaction']);
 assert.deepEqual(rows['USDG-single'].events.map(x=>x.method),['sendTransaction']);
 assert.deepEqual(rows['ETH-batch'].events[0].calls,evidence.out.eth.calls);
 assert.equal(rows['USDG-single'].events[0].data,evidence.out.usd.calls.at(-1).data);
});
