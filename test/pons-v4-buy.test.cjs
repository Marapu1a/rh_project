const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const V=require('../scripts/pons-v4-buy.cjs'),P=require('../scripts/pons-curve-buy.cjs'),D=require('../scripts/direct-buy.cjs');
const {replayAttempts}=require('../scripts/attempt-lifecycle.cjs');
const coder=ethers.AbiCoder.defaultAbiCoder(),addr=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
function fixture({quote0=false,amount=101000000n,actions='0x060b0e',tokenOut=1000000n}={}){
 const m={schema:V.SCHEMA,routeVersion:V.ID,chainId:4663,eligibility:'automatic-buy-v1',quoteBasis:'wallet-net-debit-v1',quoteDecimals:6,entryThresholdRaw:'100000000',anchor:{number:10,hash:ethers.id('anchor')},codeHashes:{},hookFeeBps:100,creatorTaxBps:300};
 for(const [i,k]of P.FIELDS.entries()){m[k]=addr(i+10);m.codeHashes[k]=ethers.id(k);}
 m.quote='0x5fc5360d0400a0fd4f2af552add042d716f1d168';if(quote0)m.token=addr(2n**159n);
 for(const [k,[a,h]]of Object.entries(V.PINS)){m[k]=a;m.codeHashes[k]=h;}
 m.poolKey=[...[m.token,m.quote].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1),0,200,m.hook];m.poolId=V.poolId(m.poolKey);
 const wallet=addr(100),blocks=[],config={schema:'attempt-lifecycle-v1',instanceId:ethers.id('local'),source:addr(101),sourceCodeHash:ethers.id('fixture')};
 function buy(a=amount,output=tokenOut){
  const n=blocks.length+11,bh=ethers.id('block'+n),hash=ethers.id('tx'+n),logs=[],fee=output/100n,tax=output*3n/100n,net=output-fee-tax;
  const emit=(abi,event,args,address)=>logs.push({address,...abi.encodeEventLog(abi.getEvent(event),args)});
  const delta=quote0?[-a,output]:[output,-a];emit(V.SWAP,'Swap',[m.poolId,m.router,...delta,2n**96n,1000000,0,0],m.manager);
  if(fee+tax>0n){emit(V.TRANSFER,'Transfer',[m.manager,m.hook,fee+tax],m.token);emit(V.FEE,'HookFeeCollected',[m.poolId,m.token,fee,tax],m.hook);}
  emit(V.TRANSFER,'Transfer',[wallet,m.manager,a],m.quote);emit(V.TRANSFER,'Transfer',[m.manager,wallet,net],m.token);
  const spec=coder.encode([V.SPEC],[[m.poolKey,quote0,a,net,0,'0x']]);
  const params=actions==='0x060b0e'?[spec,coder.encode(['address','uint256','bool'],[m.quote,0,true]),coder.encode(['address','address','uint256'],[m.token,wallet,0])]:[spec,coder.encode(['address','uint256'],[m.quote,a]),coder.encode(['address','uint256'],[m.token,net])];
  const tx={hash,blockHash:bh,blockNumber:n,transactionIndex:0,from:wallet,to:m.router,chainId:4663,value:'0x0',input:V.CALL.encodeFunctionData('execute',['0x10',[coder.encode(['bytes','bytes[]'],[actions,params])],999999])};
  const receipt={transactionHash:hash,blockHash:bh,blockNumber:n,transactionIndex:0,from:wallet,to:m.router,status:1,logs:logs.map((l,i)=>({...l,blockHash:bh,blockNumber:n,transactionHash:hash,transactionIndex:0,logIndex:i,removed:false}))};
  blocks.push({number:n,hash:bh,parentHash:blocks.at(-1)?.hash||m.anchor.hash,timestamp:n,transactions:[{tx,receipt}]});return {tx,receipt,params};
 }
 return {m,wallet,blocks,config,buy,...buy()};
}
test('Pons v4 both currency orders and settlement forms: net TOKEN after hook fee, USDG counted once',()=>{
 for(const quote0 of [false,true])for(const actions of ['0x060b0e','0x060c0f']){
  const f=fixture({quote0,actions}),l=D.replay(f.m,f.blocks),d=l.decisions[0];assert.equal(d.status,'ELIGIBLE');assert.equal(d.netQuoteDebitRaw,'101000000');assert.equal(d.poolTokenOutRaw,'1000000');assert.equal(d.netTokenOutRaw,'960000');assert.equal(d.hookFeeTokenRaw,'40000');assert.equal(l.wallets[0].entriesMinted,'1');assert.equal(l.wallets[0].carryRaw,'1000000');
  const life=replayAttempts(f.m,f.config,f.blocks);assert.equal(life.wallets[0].SHORT.open,'1');assert.equal(life.wallets[0].MONTHLY.open,'1');
 }
});
test('Pons v460+40 carry, duplicate delivery, restart and branch rebuild',()=>{
 const f=fixture({amount:60000000n});f.buy(40000000n);const ledger=D.replay(f.m,f.blocks);assert.equal(ledger.wallets[0].entriesMinted,'1');
 assert.equal(D.hash(D.replay(f.m,[...f.blocks,...f.blocks])),D.hash(ledger));assert.equal(D.hash(D.replay(f.m,JSON.parse(JSON.stringify(f.blocks)))),D.hash(ledger));
 assert.equal(D.replay(f.m,f.blocks.slice(0,1)).wallets[0].carryRaw,'60000000');
 f.blocks.pop();f.buy(30000000n);const b=f.blocks[1];b.hash=ethers.id('replacement');for(const {tx,receipt} of b.transactions){tx.blockHash=b.hash;receipt.blockHash=b.hash;for(const log of receipt.logs)log.blockHash=b.hash;}
 assert.equal(D.replay(f.m,f.blocks).wallets[0].carryRaw,'90000000');
});
test('Pons v4 rejects fee spoofing, extra transfers, wrong recipient, sender, value and malformed calls',()=>{
 const changes=[
  f=>f.tx.to=addr(999),f=>f.tx.value='1',f=>f.tx.input+='00',f=>f.receipt.status=0,
  f=>f.receipt.logs.splice(2,1),f=>f.receipt.logs[1].data=ethers.ZeroHash,
  f=>f.receipt.logs[2].address=addr(999),f=>f.receipt.logs[2].topics[1]=ethers.id('otherpool'),
  f=>f.receipt.logs[3].data=ethers.toBeHex(102000000n,32),f=>f.receipt.logs[4].topics[2]=ethers.zeroPadValue(addr(999),32),
  f=>f.receipt.logs.push({...f.receipt.logs[4],logIndex:5}),f=>f.receipt.logs[1].logIndex=10,
  f=>f.receipt.logs[0].topics[2]=ethers.zeroPadValue(addr(999),32),
  f=>f.receipt.logs.push({...f.receipt.logs[0],topics:[f.receipt.logs[0].topics[0],ethers.id('otherpool'),f.receipt.logs[0].topics[2]],logIndex:5}),
  f=>f.params[2]=coder.encode(['address','address','uint256'],[f.m.token,addr(999),0]),
  f=>f.params[1]=coder.encode(['address','uint256','bool'],[f.m.quote,0,false]),
  f=>f.params[0]=coder.encode([V.SPEC],[[f.m.poolKey,false,101000000,1000000,0,'0x']]),
 ];
 for(const change of changes){const f=fixture();change(f);if(f.tx.input===fixture().tx.input)f.tx.input=V.CALL.encodeFunctionData('execute',['0x10',[coder.encode(['bytes','bytes[]'],['0x060b0e',f.params])],999999]);assert(V.decodePool(f.m,f.tx,f.receipt).every(d=>d.status!=='ELIGIBLE'));}
});
test('Pons v4 allow-revert, inline permit, multicall, wrong commands/actions stay unsupported',()=>{
 for(const [commands,actions]of [['0x90','0x060b0e'],['0x0a10','0x060b0e'],['0x1010','0x060b0e'],['0x10','0x070b0e']]){
  const f=fixture();f.tx.input=V.CALL.encodeFunctionData('execute',[commands,[coder.encode(['bytes','bytes[]'],[actions,f.params])],999999]);assert.equal(V.decodePool(f.m,f.tx,f.receipt)[0].status,'UNSUPPORTED_ROUTE');
 }
});
test('Pons v4 rounding can produce zero fee; failed provenance and changed pins are rejected',()=>{
 const f=fixture({tokenOut:1n});assert.equal(D.replay(f.m,f.blocks).decisions[0].status,'ELIGIBLE');
 assert.throws(()=>D.validateManifest({...f.m,router:addr(999)}),/pin/);assert.throws(()=>D.validateManifest({...f.m,poolId:ethers.id('other')}),/pool/);
 f.receipt.logs[0].removed=true;assert.throws(()=>D.replay(f.m,f.blocks),/provenance/);
});
test('Pons SELL, hook-originated conversion BUY and simple transfers do not mint entries',()=>{
 const f=fixture();f.tx.to=f.m.hook;f.receipt.to=f.m.hook;assert.equal(D.replay(f.m,f.blocks).wallets.length,0);
 Object.assign(f.receipt.logs[0],V.SWAP.encodeEventLog(V.SWAP.getEvent('Swap'),[f.m.poolId,f.m.hook,-1000000,101000000,2n**96n,1,0,0]));assert.equal(D.replay(f.m,f.blocks).decisions[0].reason,'SELL');
 f.receipt.logs=f.receipt.logs.slice(1);assert.deepEqual(V.decodePool(f.m,f.tx,f.receipt),[]);
});


test('combined genesis keeps v4 accounting and rejects unqualified v4 self-batches and changed pins',()=>{
 const L=require('../scripts/pons-launch-buy.cjs'),B=require('../scripts/pons-batch-route.cjs');
 const f=fixture({amount:60000000n});f.buy(40000000n);
 Object.assign(f.m,{schema:L.SCHEMA,routeVersion:L.ID,batchExecutor:B.EXECUTOR});f.m.codeHashes.batchExecutor=B.EXECUTOR_HASH;
 for(const [k,[a,h]] of Object.entries(B.PINS)){f.m[k]=a;f.m.codeHashes[k]=h;}
 const ledger=D.replay(f.m,f.blocks);assert.equal(ledger.wallets[0].entriesMinted,'1');assert.equal(ledger.wallets[0].carryRaw,'0');
 const policy=require('../scripts/buy-policy-format.cjs');assert.deepEqual(policy.initialAdapters(f.m),[ethers.id(L.ID)]);assert.equal(policy.extend(f.m,ethers.id(V.ID),100,20),null);
 assert.throws(()=>D.validateManifest({...f.m,router:addr(999)}),/pin/);
 assert.throws(()=>D.validateManifest({...f.m,batchExecutor:addr(999)}),/executor/);
 f.tx.to=f.wallet;f.receipt.to=f.wallet;assert.equal(D.replay(f.m,f.blocks).decisions[0].status,'UNSUPPORTED_ROUTE');
});
