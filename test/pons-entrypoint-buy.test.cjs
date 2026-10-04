const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('ethers');
const A=require('../scripts/pons-entrypoint-buy.cjs'),C=require('../scripts/pons-entrypoint-codec.cjs'),Z=require('../scripts/pons-zeroex-buy.cjs'),D=require('../scripts/direct-buy.cjs');
const proof=require('../docs/evidence/PONS_ENTRYPOINT_POOL_BUY_2026-10-02.json');
const base=require('./fixtures/pons-zeroex.cjs'),fixture=()=>base.fixture(proof);
const get=f=>A.decode(f.m,f.tx,f.receipt,f.block)[0];
async function editOp(f,edit){
 const outer=C.ENTRY_ABI.decodeFunctionData('handleOps',f.tx.input),op=outer.ops[0].toObject();edit(op);
 const hash=C.userOpHash(op,f.m.chainId);op.signature='0xff00'+(await new E.Wallet(require('../scripts/pons-launch-rehearsal.cjs').KEY).signMessage(E.getBytes(hash))).slice(2);
 f.tx.input=C.ENTRY_ABI.encodeFunctionData('handleOps',[[op],outer.beneficiary]);
 const l=f.receipt.logs.find(l=>l.topics[0]===C.ENTRY_ABI.getEvent('UserOperationEvent').topicHash),v=C.ENTRY_ABI.parseLog(l).args.toArray();v[0]=hash;v[1]=op.sender;v[3]=op.nonce;
 Object.assign(l,C.ENTRY_ABI.encodeEventLog(C.ENTRY_ABI.getEvent('UserOperationEvent'),v));
}
test('signed delegated EntryPoint BUY: real fork runtime, signature, operation hash, debit and participant',()=>{
 const f=fixture();D.validateManifest(f.m);assert.equal(proof.publicSends,false);
 for(const name of ['entryPoint','entryPointAccount']){assert(proof.sources[name].runtimeMatchesCapture);assert.equal(E.keccak256(proof.runtimes[f.m[name]].code),f.m.codeHashes[name]);}
 const {tx,receipt}=proof.entrypoint.delegation,a=tx.authorizationList[0];assert.equal(receipt.status,'0x1');assert.equal(BigInt(a.nonce),BigInt(tx.nonce)+1n);
 assert.equal(E.verifyAuthorization({address:a.address,chainId:a.chainId,nonce:a.nonce},E.Signature.from({r:a.r,s:a.s,yParity:Number(BigInt(a.yParity))})).toLowerCase(),f.wallet);
 assert.equal(proof.entrypoint.invalidSignature.code,'CALL_EXCEPTION');assert.equal(C.userOpHash(proof.entrypoint.op,4663),proof.entrypoint.userOpHash);assert(BigInt(proof.entrypoint.event.actualGasCost)>0n);
 const d=get(f);assert.equal(d.status,'ELIGIBLE');assert.equal(d.payer,f.wallet);assert.notEqual(d.payer,f.tx.from.toLowerCase());assert.equal(d.recipient,f.wallet);assert.equal(d.netQuoteDebitRaw,'101000000');assert.equal(d.poolQuoteRaw,'100848500');
 assert.equal(BigInt(proof.before.sell)-BigInt(proof.after.sell),101000000n);
 assert.equal(BigInt(proof.after.buy)-BigInt(proof.before.buy),BigInt(d.netTokenOutRaw));
 const r=D.replay(f.m,f.blocks);assert.equal(r.wallets.length,1);assert.equal(r.wallets[0].wallet,f.wallet);assert.equal(r.wallets[0].entriesMinted,'1');assert.equal(r.wallets[0].carryRaw,'1000000');assert.deepEqual(D.replay(f.m,[...f.blocks,...f.blocks]),r);
});
test('older genesis rejects AA; newest genesis preserves the executed direct-holder path',()=>{
 const f=fixture(),old={...f.m,schema:Z.SCHEMA,routeVersion:Z.ID};assert.equal(D.replay(old,f.blocks).wallets.length,0);
 assert.notEqual(require('../scripts/buy-policy-format.cjs').genesisAdaptersHash(f.m),require('../scripts/buy-policy-format.cjs').genesisAdaptersHash(old));
 const direct=base.fixture();for(const [k,[a,h]]of Object.entries(A.PINS)){direct.m[k]=a;direct.m.codeHashes[k]=h;}
 direct.m.schema=A.SCHEMA;direct.m.routeVersion=A.ID;assert.equal(D.replay(direct.m,direct.blocks).wallets[0].entriesMinted,'1');
});
test('no parent code, changed delegate, wrong block, duplicate/missing events, failed op never mint',()=>{
 const changes=[
  f=>f.block.entrypointAccounts={},f=>f.block.entrypointAccounts[f.wallet].code='0x',f=>f.block.entrypointAccounts[f.wallet].parentHash=E.id('wrong parent'),
  f=>f.receipt.logs.pop(),f=>f.tx.input+='00',f=>f.tx.value='0x1',
  f=>{const l=f.receipt.logs.at(-1),a=C.ENTRY_ABI.parseLog(l).args.toArray();a[4]=false;Object.assign(l,C.ENTRY_ABI.encodeEventLog(C.ENTRY_ABI.getEvent('UserOperationEvent'),a));},
  f=>{const l=f.receipt.logs.at(-1);l.topics[1]=E.id('wrong userOpHash');},
  f=>f.receipt.logs.push({...f.receipt.logs.at(-1),logIndex:'0xb'}),
  f=>{const o=C.ENTRY_ABI.decodeFunctionData('handleOps',f.tx.input);f.tx.input=C.ENTRY_ABI.encodeFunctionData('handleOps',[[o.ops[0],o.ops[0]],o.beneficiary]);},
 ];
 for(const edit of changes){const f=fixture();edit(f);assert.notEqual(get(f).status,'ELIGIBLE');}
});
test('signed but unsupported modes: deployment, paymaster, deferred validation, native and arbitrary execution',async()=>{
 const edits=[op=>op.initCode='0x1234',op=>op.paymasterAndData=base.addr(999),op=>op.nonce=3n<<64n,
  op=>{const c=C.ACCOUNT.decodeFunctionData('execute',op.callData).toArray(true);c[0]=base.addr(999);op.callData=C.ACCOUNT.encodeFunctionData('execute',c);},
  op=>{const c=C.ACCOUNT.decodeFunctionData('execute',op.callData).toArray(true);c[1]=1n;op.callData=C.ACCOUNT.encodeFunctionData('execute',c);},
  op=>op.callData+='00'];
 for(const edit of edits){const f=fixture();await editOp(f,edit);assert.notEqual(get(f).status,'ELIGIBLE');}
 const f=fixture();await editOp(f,op=>op.sender=base.addr(999));assert.equal(get(f).reason,'ENTRYPOINT_ACCOUNT_NOT_QUALIFIED');
});
test('even one signed operation cannot attribute validation transfers, mixed pools or refunds to its BUY',()=>{
 for(const kind of ['validation','refund','otherpool']){
  const f=fixture();
  if(kind==='validation'){const before=f.receipt.logs.find(l=>l.topics[0]===C.ENTRY_ABI.getEvent('BeforeExecution').topicHash);const pay=f.receipt.logs.find(l=>l.address.toLowerCase()===f.m.quote);const i=before.logIndex;before.logIndex=pay.logIndex;pay.logIndex=i;}
  else{const src=f.receipt.logs.find(l=>l.address.toLowerCase()===(kind==='refund'?f.m.quote:f.m.manager));f.receipt.logs.push({...src,logIndex:'0xb'});}
  assert.notEqual(get(f).status,'ELIGIBLE');
 }
});
test('valid same-block re-delegation rejects; foreign/invalid authorizations do not block the buyer',async()=>{
 const f=fixture(),wallet=new E.Wallet(require('../scripts/pons-launch-rehearsal.cjs').KEY),signed=await wallet.authorize({address:C.IMPLEMENTATION,chainId:4663,nonce:123});
 const a={address:signed.address,chainId:E.toQuantity(signed.chainId),nonce:E.toQuantity(signed.nonce),r:signed.signature.r,s:signed.signature.s,yParity:E.toQuantity(signed.signature.yParity)};
 f.block.transactions.push({tx:{authorizationList:[a]}});assert.equal(get(f).status,'UNSUPPORTED_ROUTE');
 f.block.transactions.at(-1).tx.authorizationList=[{...a,r:E.ZeroHash,s:E.ZeroHash}];assert.equal(get(f).status,'ELIGIBLE');
 f.block.transactions.at(-1).tx.authorizationList=[{...a,chainId:'0x1'}];assert.equal(get(f).status,'ELIGIBLE');
});
test('scanner account hint is bounded to canonical single operation, never chooses one from a bundle',()=>{
 const f=fixture();assert.equal(A.accountCandidate(f.m,f.tx),f.wallet);
 const o=C.ENTRY_ABI.decodeFunctionData('handleOps',f.tx.input);f.tx.input=C.ENTRY_ABI.encodeFunctionData('handleOps',[[o.ops[0],o.ops[0]],o.beneficiary]);assert.equal(A.accountCandidate(f.m,f.tx),null);
 f.tx.input='0x1234';assert.equal(A.accountCandidate(f.m,f.tx),null);
});

test('project compaction keeps neighboring authorizations required to reject same-block delegation changes',async()=>{
 const f=fixture(),P=require('../scripts/project-history.cjs'),wallet=new E.Wallet(require('../scripts/pons-launch-rehearsal.cjs').KEY);
 const signed=await wallet.authorize({address:C.IMPLEMENTATION,chainId:4663,nonce:123});
 const a={address:signed.address,chainId:E.toQuantity(signed.chainId),nonce:E.toQuantity(signed.nonce),r:signed.signature.r,s:signed.signature.s,yParity:E.toQuantity(signed.signature.yParity)};
 const tx={...structuredClone(f.tx),hash:E.id('neighbor authorization'),type:'0x4',input:'0x',transactionIndex:'0x1',authorizationList:[a]};
 const receipt={...structuredClone(f.receipt),transactionHash:tx.hash,transactionIndex:tx.transactionIndex,logs:[]};
 f.block.transactions.push({tx,receipt});
 const before=D.replay(f.m,f.blocks);assert.equal(before.wallets.length,0);
 const compact=P.compact(f.blocks,f.m,null);
 assert.equal(compact.find(b=>b.number===f.block.number).transactions.length,2);
 assert.deepEqual(D.replay(f.m,compact),before);
});
