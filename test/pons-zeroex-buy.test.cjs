const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('ethers');
const Z=require('../scripts/pons-zeroex-buy.cjs'),V=require('../scripts/pons-v4-buy.cjs'),D=require('../scripts/direct-buy.cjs');
const {proof,fixture,changeAction,addr}=require('./fixtures/pons-zeroex.cjs');
const decision=f=>Z.decode(f.m,f.tx,f.receipt,f.block)[0];
function transfer(log,from,to,value){Object.assign(log,V.TRANSFER.encodeEventLog(V.TRANSFER.getEvent('Transfer'),[from,to,value]));}
test('executed 101 USDG single Pons pool BUY: source/runtime, real debit, fees and tickets',()=>{
 const f=fixture();D.validateManifest(f.m);assert.equal(proof.source.verifiedRuntimeMatch,true);assert.equal(proof.source.allowanceHolder.verifiedRuntimeMatch,true);
 for(const field of Z.FIELDS)if(field!=='registry')assert.equal(E.keccak256(proof.runtimes[f.m[field]].code),f.m.codeHashes[field]);
 const d=decision(f);assert.equal(d.status,'ELIGIBLE');assert.equal(d.netQuoteDebitRaw,'101000000');assert.equal(d.poolQuoteRaw,'100848500');assert.equal(d.routeFeeQuoteRaw,'151500');
 assert.equal(BigInt(proof.before.sell)-BigInt(proof.after.sell),BigInt(d.netQuoteDebitRaw));assert.equal(BigInt(proof.after.buy)-BigInt(proof.before.buy),BigInt(d.netTokenOutRaw));
 const r=D.replay(f.m,f.blocks);assert.equal(r.wallets[0].entriesMinted,'1');assert.equal(r.wallets[0].carryRaw,'1000000');
 assert.deepEqual(D.replay(f.m,[...f.blocks,...f.blocks]),r);
 const lifecycle={schema:'attempt-lifecycle-v1',instanceId:E.id('local'),source:addr(999),sourceCodeHash:E.id('fixture')};
 const w=require('../scripts/attempt-lifecycle.cjs').replayAttempts(f.m,lifecycle,f.blocks).wallets[0];assert.equal(w.SHORT.open,'1');assert.equal(w.MONTHLY.open,'1');
});
test('new genesis does not silently upgrade earlier Pons profiles or accept changed pins',()=>{
 const f=fixture(),format=require('../scripts/buy-policy-format.cjs');
 const profiles=require('../scripts/pons-profiles.cjs').ALL;
 for(const old of profiles.slice(0,profiles.indexOf(Z))){
  const m={...f.m,schema:old.SCHEMA,routeVersion:old.ID};
  assert.equal(D.replay(m,f.blocks).wallets.length,0);assert.notEqual(format.genesisAdaptersHash(m),format.genesisAdaptersHash(f.m));
  assert.equal(format.extend(m,format.adapterId(Z.ID),100),null);
 }
 for(const field of ['allowanceHolder','zeroexSettler']){const m=structuredClone(f.m);m.codeHashes[field]=E.id('changed');assert.throws(()=>D.validateManifest(m),/pin/);}
});
test('exact call boundaries reject other payer, fee target, arbitrary BASIC, split, refund shape and stale permit',()=>{
 const cases=[
  ['TRANSFER_FROM',0,a=>a[0]=addr(999)],['TRANSFER_FROM',0,a=>a[1][0][1]=100000000n],['TRANSFER_FROM',0,a=>a[1][1]=1n],['TRANSFER_FROM',0,a=>a[1][2]=1n],['TRANSFER_FROM',0,a=>a[2]='0x12'],
  ['BASIC',1,a=>a[1]=3000n],['BASIC',1,a=>a[2]=addr(999)],['BASIC',1,a=>a[3]=4n],['BASIC',1,a=>a[4]=Z.ERC.encodeFunctionData('transfer',[addr(999),0])],
  ['UNISWAPV4',2,a=>a[0]=addr(999)],['UNISWAPV4',2,a=>a[2]=500000n],['UNISWAPV4',2,a=>a[3]=true],['UNISWAPV4',2,a=>a[4]=3n],['UNISWAPV4',2,a=>a[6]+='00'],['UNISWAPV4',2,a=>a[6]=a[6].slice(0,-46)+addr(999).slice(2)+'000000'],
  ['POSITIVE_SLIPPAGE',3,a=>a[0]=addr(999)],['POSITIVE_SLIPPAGE',3,a=>a[1]=addr(999)],['POSITIVE_SLIPPAGE',3,a=>a[3]=500000n]
 ];
 for(const [name,i,edit]of cases){const f=fixture();changeAction(f,i,name,edit);const d=decision(f);assert.equal(d.status,'UNSUPPORTED_ROUTE',name);assert.equal(d.payer,null);assert.equal(D.replay(f.m,f.blocks).wallets.length,0);}
});
test('envelope, recipient, native value, mixed venue, transfer spoofing, refunds and output all fail closed',()=>{
 const cases=[
  f=>f.tx.value='0x1',f=>f.tx.input+='00',f=>f.tx.from=addr(999),f=>f.receipt.status='0x0',
  f=>{const a=Z.HOLDER.decodeFunctionData('exec',f.tx.input).toArray(true);a[0]=addr(999);f.tx.input=Z.HOLDER.encodeFunctionData('exec',a);},
  f=>{const a=Z.HOLDER.decodeFunctionData('exec',f.tx.input).toArray(true),c=Z.SETTLER.decodeFunctionData('execute',a[4]).toArray(true);c[0][0]=addr(999);a[4]=Z.SETTLER.encodeFunctionData('execute',c);f.tx.input=Z.HOLDER.encodeFunctionData('exec',a);},
  f=>f.receipt.logs[0].data=E.toBeHex(102000000,32),f=>f.receipt.logs[1].data=E.toBeHex(1,32),
  f=>f.receipt.logs[7].topics[2]=E.zeroPadValue(addr(999),32),f=>f.receipt.logs[5].data=E.toBeHex(1,32),
  f=>f.receipt.logs[3].data=E.toBeHex(1,32),f=>f.receipt.logs[4].data='0x',
  f=>f.receipt.logs[2].topics[2]=E.zeroPadValue(addr(999),32),
  f=>{const l={...f.receipt.logs[0],logIndex:'0x8'};transfer(l,f.m.zeroexSettler,f.wallet,1);f.receipt.logs.push(l);},
  f=>f.receipt.logs.push({...f.receipt.logs[2],logIndex:'0x8',topics:[f.receipt.logs[2].topics[0],E.id('otherpool'),f.receipt.logs[2].topics[2]]}),
  f=>f.receipt.logs[1].logIndex='0x8',f=>f.receipt.logs[7].data+='00',f=>f.receipt.logs[0].removed=true,
 ];
 for(const edit of cases){const f=fixture();edit(f);assert.notEqual(decision(f).status,'ELIGIBLE');}
});
test('source-defined positive slippage fee is conserved separately from input (synthetic receipt branch)',()=>{
 const f=fixture(),net=BigInt(decision(f).netTokenOutRaw),extra=net/1000n;
 changeAction(f,3,'POSITIVE_SLIPPAGE',a=>a[2]=net-extra);
 const l={...f.receipt.logs[7]},last=f.receipt.logs[7];
 transfer(l,f.m.zeroexSettler,Z.SURPLUS_RECIPIENT,extra);last.logIndex='0x8';transfer(last,f.m.zeroexSettler,f.wallet,net-extra);f.receipt.logs.splice(7,0,l);
 const d=decision(f);assert.equal(d.status,'ELIGIBLE');assert.equal(d.positiveSlippageTokenRaw,String(extra));assert.equal(d.netQuoteDebitRaw,'101000000');
 transfer(l,f.m.zeroexSettler,Z.SURPLUS_RECIPIENT,extra+1n);assert.equal(decision(f).status,'UNSUPPORTED_ROUTE');
});

test('60 + 40 nominal USDG crosses threshold including route fees exactly once (synthetic amounts)',()=>{
 const first=fixture(),second=fixture();
 for(const [f,amount]of [[first,60000000n],[second,40000000n]]){
  changeAction(f,0,'TRANSFER_FROM',a=>a[1][0][1]=amount);
  const outer=Z.HOLDER.decodeFunctionData('exec',f.tx.input).toArray(true);outer[2]=amount;f.tx.input=Z.HOLDER.encodeFunctionData('exec',outer);
  f.receipt.logs[0].data=E.toBeHex(amount,32);f.receipt.logs[1].data=E.toBeHex(amount*1500n/1000000n,32);f.receipt.logs[6].data=E.toBeHex(amount-amount*1500n/1000000n,32);
  const log=f.receipt.logs[2],swap=V.SWAP.parseLog(log).args.toArray();swap[2]=-(amount-amount*1500n/1000000n);Object.assign(log,V.SWAP.encodeEventLog(V.SWAP.getEvent('Swap'),swap));
  assert.equal(decision(f).status,'ELIGIBLE');
 }
 const n=Number(BigInt(first.block.number))+1,hash=E.id('synthetic second BUY'),txHash=E.id('synthetic second tx');
 Object.assign(second.block,{number:n,hash,parentHash:first.block.hash});
 for(const obj of [second.tx,second.receipt,...second.receipt.logs])Object.assign(obj,{blockHash:hash,blockNumber:E.toQuantity(n)});
 second.tx.hash=txHash;second.receipt.transactionHash=txHash;second.receipt.logs.forEach(l=>l.transactionHash=txHash);
 const ledger=D.replay(first.m,[first.block,second.block]);assert.equal(ledger.wallets[0].entriesMinted,'1');assert.equal(ledger.wallets[0].carryRaw,'0');
});

test('3% creator tax plus 1% hook fee conserves tokens; no change to input ticket basis (synthetic tax)',()=>{
 const f=fixture(),d=decision(f),gross=BigInt(d.poolTokenOutRaw),fee=gross/100n,tax=gross*3n/100n,net=gross-fee-tax;
 f.m.creatorTaxBps=300;
 f.receipt.logs[3].data=E.toBeHex(fee+tax,32);
 Object.assign(f.receipt.logs[4],V.FEE.encodeEventLog(V.FEE.getEvent('HookFeeCollected'),[f.m.poolId,f.m.token,fee,tax]));
 for(const i of [5,7])f.receipt.logs[i].data=E.toBeHex(net,32);
 const a=Z.HOLDER.decodeFunctionData('exec',f.tx.input).toArray(true),c=Z.SETTLER.decodeFunctionData('execute',a[4]).toArray(true);c[0][2]=net;a[4]=Z.SETTLER.encodeFunctionData('execute',c);f.tx.input=Z.HOLDER.encodeFunctionData('exec',a);
 changeAction(f,3,'POSITIVE_SLIPPAGE',a=>a[2]=net);
 const next=decision(f);assert.equal(next.status,'ELIGIBLE');assert.equal(next.hookFeeTokenRaw,String(fee+tax));assert.equal(next.netQuoteDebitRaw,'101000000');
});

test('new combined genesis preserves previously executed direct and self-batch pool decisions',()=>{
 const source=require('../docs/evidence/PONS_POOL_TERMINAL_2026-10-02.json'),L=require('../scripts/pons-pool-batch-buy.cjs');
 for(const scenario of source.terminal.scenarios){
  const m={...structuredClone(source.terminal.manifest),schema:Z.SCHEMA,routeVersion:Z.ID};
  for(const [k,[a,h]]of Object.entries(Z.PINS)){m[k]=a;m.codeHashes[k]=h;}
  Z.validate(m);const row=scenario.steps.at(-1),block={number:row.tx.blockNumber,hash:row.tx.blockHash,parentHash:E.id('synthetic parent'),timestamp:1,transactions:[row]};
  block.batchAccounts={[row.tx.from.toLowerCase()]:{parentHash:block.parentHash,code:'0xef0100'+m.batchExecutor.slice(2)}};
  assert.deepEqual(Z.decode(m,row.tx,row.receipt,block),L.decode(m,row.tx,row.receipt,block));
  assert.equal(Z.decode(m,row.tx,row.receipt,block)[0].status,'ELIGIBLE');
 }
});
