const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('ethers');
const D=require('../scripts/direct-buy.cjs'),V=require('../scripts/pons-v4-buy.cjs');
const evidence=require('../docs/evidence/PONS_POOL_TERMINAL_2026-10-02.json');
const capture=evidence.terminal,m=capture.manifest,low=x=>x.toLowerCase();

test('real terminal payloads match executed sequential and signed self-batch calls',()=>{
 assert.equal(capture.status,'PONS_POOL_TERMINAL_MATRIX_PASSED');
 assert.equal(capture.scenarios.length,4);D.validateManifest(m);
 for(const s of capture.scenarios){
  assert.equal(s.status,'EXECUTION_VERIFIED');
  assert.equal(s.capture.calls.length,s.pay==='USDG'?3:6);
  assert.equal(s.capture.dispatch[0].method,'sendCalls');
  assert.deepEqual(s.capture.dispatch[0].calls,s.capture.calls);
  if(s.mode==='sequential'){
   assert.equal(s.steps.length,s.capture.calls.length);
   s.steps.forEach((step,i)=>{const call=s.capture.calls[i];assert.equal(low(step.tx.to),low(call.to));assert.equal(low(step.tx.input),low(call.data));assert.equal(BigInt(step.tx.value),BigInt(call.value||0));});
  }else{
   assert.equal(s.steps.length,1);const tx=s.steps[0].tx;
   assert.equal(tx.type,'0x2');assert.equal(low(tx.to),low(tx.from));
   const [mode,data]=new E.Interface(['function execute(bytes32,bytes) payable']).decodeFunctionData('execute',tx.input);
   assert.equal(mode,'0x01'+'00'.repeat(31));
   const [calls]=E.AbiCoder.defaultAbiCoder().decode(['tuple(address,uint256,bytes)[]'],data);
   assert.equal(calls.length,s.capture.calls.length);
   calls.forEach((call,i)=>{assert.equal(low(call[0]),low(s.capture.calls[i].to));assert.equal(call[1],BigInt(s.capture.calls[i].value||0));assert.equal(low(call[2]),low(s.capture.calls[i].data));});
  }
  assert(s.steps.every(x=>BigInt(x.receipt.status)===1n));
 }
});

test('each terminal purchase has one target swap, exact quote settlement and net tokens above its limit',()=>{
 for(const s of capture.scenarios){
  const logs=s.steps.flatMap(x=>x.receipt.logs),wallet=low(s.steps.at(-1).tx.from);
  const swaps=logs.filter(l=>low(l.address)===low(m.manager)&&l.topics[0]===V.SWAP.getEvent('Swap').topicHash&&low(l.topics[1])===low(m.poolId));
  assert.equal(swaps.length,1);const swap=V.SWAP.parseLog(swaps[0]).args;
  const quoteDelta=low(m.poolKey[0])===low(m.quote)?swap.amount0:swap.amount1;
  assert.equal(-quoteDelta,BigInt(s.capture.amountIn));
  const moves=logs.filter(l=>l.topics[0]===V.TRANSFER.getEvent('Transfer').topicHash).map(l=>({asset:low(l.address),...V.TRANSFER.parseLog(l).args.toObject()}));
  const payment=moves.filter(l=>l.asset===low(m.quote)&&low(l.from)===wallet&&low(l.to)===low(m.manager));
  assert.equal(payment.length,1);assert.equal(payment[0].value,-quoteDelta);
  const received=moves.filter(l=>l.asset===low(m.token)&&low(l.from)===low(m.manager)&&low(l.to)===wallet);
  assert.equal(received.length,1);assert(received[0].value>=BigInt(s.capture.trade.minAmountOut));
  const exec=V.CALL.decodeFunctionData('execute',s.capture.calls.at(-1).data);
  assert.equal(exec.commands,'0x10');assert.equal(E.AbiCoder.defaultAbiCoder().decode(['bytes','bytes[]'],exec.inputs[0])[0],'0x060c0f');
 }
});

test('funding conversion never becomes a second entry; unqualified v4 batches remain unsupported',()=>{
 for(const s of capture.scenarios){
  const decisions=s.steps.flatMap(x=>D.decodeTransaction(m,x.tx,x.receipt));
  assert.equal(decisions.length,1);assert.equal(decisions[0].status,s.mode==='batch'?'UNSUPPORTED_ROUTE':'ELIGIBLE');
  if(s.mode==='sequential')assert.equal(decisions[0].netQuoteDebitRaw,s.capture.amountIn);
  if(s.pay==='ETH')assert.equal(s.capture.amountIn,s.capture.funding.minOut);
 }
});
