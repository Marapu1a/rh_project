const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const P=require('../scripts/pons-curve-buy.cjs'),D=require('../scripts/direct-buy.cjs');
const {replayAttempts}=require('../scripts/attempt-lifecycle.cjs');
const addr=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
test('Pons scanner binding rejects a substituted curve even with supplied runtime hashes',async()=>{
 const {m}=fixture(),abi=new ethers.Interface(require('../scripts/integrations/pons-v2.cjs').FAB);
 const rpc=async(method,[call,tag])=>{assert.equal(method,'eth_call');assert.equal(tag,'0xb');return abi.encodeFunctionResult('getLaunchedToken',[[m.token,addr(999),addr(100),addr(100),m.quote,1,1,1,300,false,0,0,0,0,true]]);};
 await assert.rejects(P.validateBindings(m,rpc,'0xb'),/factory binding mismatch/);
});
function fixture(amount=101000000n,refund=0n){
 const m={schema:P.SCHEMA,routeVersion:P.ID,eligibility:'automatic-buy-v1',quoteBasis:'wallet-net-debit-v1',chainId:4663,quoteDecimals:6,entryThresholdRaw:'100000000',anchor:{number:10,hash:ethers.id('anchor')},codeHashes:{}};
 for(const [i,k] of P.FIELDS.entries()){m[k]=addr(i+10);m.codeHashes[k]=ethers.id(k);}
 m.quote='0x5fc5360d0400a0fd4f2af552add042d716f1d168';const wallet=addr(100),blocks=[];
 const config={schema:'attempt-lifecycle-v1',instanceId:ethers.id('local'),source:addr(101),sourceCodeHash:ethers.id('fixture')};
 function buy(requested,returned=0n){
  const n=11+blocks.length,bh=ethers.id('block'+n),th=ethers.id('tx'+n),spent=requested-returned,out=spent*2n;
  const logs=[],emit=(abi,event,args,address)=>logs.push({address,...abi.encodeEventLog(abi.getEvent(event),args)});
  emit(P.TRANSFER,'Transfer',[wallet,m.curve,requested],m.quote);
  emit(P.TRANSFER,'Transfer',[m.curve,wallet,out],m.token);
  if(returned){emit(P.EVENTS,'CurveBuyRefunded',[wallet,returned],m.curve);emit(P.TRANSFER,'Transfer',[m.curve,wallet,returned],m.quote);}
  emit(P.EVENTS,'CurveBuy',[wallet,wallet,spent,out,spent/100n,spent*3n/100n],m.curve);
  // Graduation can transfer additional TOKEN to a different address in the same receipt.
  if(returned)emit(P.TRANSFER,'Transfer',[m.curve,addr(200),123n],m.token);
  const tx={hash:th,blockHash:bh,blockNumber:n,transactionIndex:0,from:wallet,to:m.curve,chainId:4663,value:'0x0',input:P.CALL.encodeFunctionData('buy',[requested,out,wallet])};
  const receipt={transactionHash:th,blockHash:bh,blockNumber:n,transactionIndex:0,from:wallet,to:m.curve,status:1,logs:logs.map((l,i)=>({...l,blockHash:bh,blockNumber:n,transactionHash:th,transactionIndex:0,logIndex:i,removed:false}))};
  // Partial-fill price bound scales with actual spending.
  tx.input=P.CALL.encodeFunctionData('buy',[requested,requested*2n,wallet]);
  const b={number:n,hash:bh,parentHash:blocks.at(-1)?.hash||m.anchor.hash,timestamp:n,transactions:[{tx,receipt}]};blocks.push(b);return {tx,receipt,b};
 }
 const first=buy(amount,refund);return {m,wallet,blocks,config,buy,...first};
}
test('Pons direct101 opens one Short and Monthly, carry1; duplicate delivery and restart are idempotent',()=>{
 const f=fixture(),ledger=D.replay(f.m,f.blocks),w=ledger.wallets[0];assert.equal(w.entriesMinted,'1');assert.equal(w.carryRaw,'1000000');
 assert.equal(D.hash(D.replay(f.m,[...f.blocks,...f.blocks])),D.hash(ledger));assert.equal(D.hash(D.replay(f.m,JSON.parse(JSON.stringify(f.blocks)))),D.hash(ledger));
 const life=replayAttempts(f.m,f.config,f.blocks);assert.equal(life.wallets[0].SHORT.open,'1');assert.equal(life.wallets[0].MONTHLY.open,'1');
});
test('Pons60+40 accumulates; canonical branch rebuild removes orphaned entries',()=>{
 const f=fixture(60000000n);f.buy(40000000n);assert.equal(D.replay(f.m,f.blocks).wallets[0].entriesMinted,'1');
 const firstOnly=D.replay(f.m,f.blocks.slice(0,1));assert.equal(firstOnly.wallets[0].entriesMinted,'0');assert.equal(firstOnly.wallets[0].carryRaw,'60000000');
 f.blocks.pop();f.buy(30000000n);f.blocks[1].hash=ethers.id('replacement');for(const pair of f.blocks[1].transactions){pair.tx.blockHash=f.blocks[1].hash;pair.receipt.blockHash=f.blocks[1].hash;for(const l of pair.receipt.logs)l.blockHash=f.blocks[1].hash;}
 assert.equal(D.replay(f.m,f.blocks).wallets[0].carryRaw,'90000000');
});
test('Pons partial graduation counts net debit, not requested amount or fees twice',()=>{
 const f=fixture(15000000000n,14901000000n);const d=D.decodeTransaction(f.m,f.tx,f.receipt)[0];assert.equal(d.status,'ELIGIBLE');assert.equal(d.netQuoteDebitRaw,'99000000');assert.equal(d.refundQuoteRaw,'14901000000');assert.equal(D.replay(f.m,f.blocks).wallets[0].entriesMinted,'0');
});
test('Pons rejects ambiguous payment, recipient, refund, minimum, ordering and non-direct routes',()=>{
 const changes=[f=>f.tx.to=addr(999),f=>f.tx.value='1',f=>f.tx.input+='00',f=>f.receipt.logs[0].data=ethers.ZeroHash,
 f=>f.receipt.logs[1].topics[2]=ethers.zeroPadValue(addr(999),32),f=>f.receipt.logs[3].topics[1]=ethers.zeroPadValue(addr(999),32),
 f=>f.receipt.logs[2].data=ethers.ZeroHash,f=>f.tx.input=P.CALL.encodeFunctionData('buy',[15000000000n,10n**30n,f.wallet]),
 f=>f.receipt.logs.push({...f.receipt.logs[4],logIndex:6}),f=>f.receipt.logs[3].logIndex=10,
 f=>f.tx.input=P.CALL.encodeFunctionData('buy',[15000000000n,0,addr(998)]),f=>f.receipt.status=0];
 for(const change of changes){const f=fixture(15000000000n,14901000000n);change(f);assert(D.decodeTransaction(f.m,f.tx,f.receipt).every(d=>d.status!=='ELIGIBLE'));}
});
test('Pons transfers and SELL mint nothing; invalid policy and receipt provenance fail closed',()=>{
 const f=fixture();assert.deepEqual(D.decodeTransaction(f.m,f.tx,{...f.receipt,logs:f.receipt.logs.slice(0,2)}),[]);
 const l=f.receipt.logs.at(-1);Object.assign(l,P.EVENTS.encodeEventLog(P.EVENTS.getEvent('CurveSell'),[f.wallet,f.wallet,1,1,0,0]));assert.equal(D.replay(f.m,f.blocks).wallets.length,0);
 assert.throws(()=>D.validateManifest({...f.m,entryThresholdRaw:'1000000'}));assert.throws(()=>D.validateManifest({...f.m,eligibility:'registration'}));
 f.receipt.logs[0].removed=true;assert.throws(()=>D.replay(f.m,f.blocks),/provenance/);
});
