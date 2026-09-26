const test=require('node:test'),assert=require('node:assert/strict'),{Interface,AbiCoder,keccak256}=require('ethers');
const e=require('../research/pair-auto/fork-buy-2026-09-25.json');
const source=require('../research/pair-auto/source-evidence.json');
const {SWAP_ABI,TRANSFER_ABI,decodeTransaction}=require('../scripts/direct-buy.cjs');
const low=x=>x.toLowerCase();
test('saved AUTO fork binds one USDG payment to one purchase across one or two pools',()=>{
 assert.equal(e.mode,'local-fork-only');assert.equal(e.stage,'complete');assert.equal(e.error,undefined);assert.equal(e.auto.complete,true);
 assert.equal(e.auto.runtimeHash,source.runtimeHash);assert.equal(e.auto.cases.length,2);
 const abi=new Interface(source.abi),manager=low(e.config.manager),quote=low(e.config.quote);
 for(const c of e.auto.cases){
  const {transaction:tx,receipt:r}=c;assert.equal(r.status,'0x1');assert.equal(tx.hash,r.transactionHash);assert.equal(tx.blockHash,r.blockHash);assert.equal(low(tx.to),low(source.address));
  const call=abi.parseTransaction({data:tx.input});assert.equal(call.name,'buyExactInput');assert.equal(low(call.args.fundingToken),quote);assert.equal(low(call.args.recipient),low(tx.from));
  const legs=call.args.legs;assert.equal(legs.length,c.legs);assert.equal(new Set(legs.map(l=>String(l.poolIndex))).size,legs.length);
  const logs=r.logs.filter(l=>low(l.address)===low(source.address)).map(l=>{try{return abi.parseLog(l);}catch{return null;}}).filter(p=>p?.name==='AggregatedBuy');assert.equal(logs.length,1);
  const buy=logs[0].args;assert.equal(low(buy.payer),low(tx.from));assert.equal(low(buy.recipient),low(tx.from));assert.equal(low(buy.projectToken),low(call.args.projectToken));assert.equal(low(buy.fundingToken),quote);
  const total=legs.reduce((s,l)=>s+l.amountIn,0n);assert.equal(total,BigInt(c.spent));assert.equal(buy.amountIn,total);assert.equal(buy.amountOut,BigInt(c.received));assert(buy.amountOut>=call.args.aggregateMinOut);
  const transfers=r.logs.filter(l=>l.topics[0]===TRANSFER_ABI.getEvent('Transfer').topicHash).map(l=>({token:low(l.address),...TRANSFER_ABI.parseLog(l).args.toObject()}));
  const payments=transfers.filter(t=>t.token===quote&&low(t.from)===low(tx.from));assert.equal(payments.length,1);assert.equal(low(payments[0].to),low(source.address));assert.equal(payments[0].value,total);
  assert.equal(transfers.filter(t=>t.token===quote&&low(t.to)===low(tx.from)).length,0);
  const deliveries=transfers.filter(t=>t.token===low(buy.projectToken));assert.equal(deliveries.length,legs.length);assert(deliveries.every(t=>low(t.from)===manager&&low(t.to)===low(tx.from)));assert.equal(deliveries.reduce((s,t)=>s+t.value,0n),buy.amountOut);
  const swaps=r.logs.filter(l=>low(l.address)===manager&&l.topics[0]===SWAP_ABI.getEvent('Swap').topicHash).map(l=>SWAP_ABI.parseLog(l).args);assert.equal(swaps.length,legs.length);
  for(const leg of legs){const key=leg.poolKey.toArray();const poolId=keccak256(AbiCoder.defaultAbiCoder().encode(['address','address','uint24','int24','address'],key));assert.equal(swaps.filter(s=>s.id===poolId).length,1);
   const quoteToken=low(key[0])===low(buy.projectToken)?key[1]:key[0];
   const d=decodeTransaction({...e.config,token:buy.projectToken,quote:quoteToken,poolKey:key,poolId},tx,r);assert.equal(d.length,1);assert.equal(d[0].reason,'NOT_DIRECT_ROUTER_CALL');
  }
 }
});
