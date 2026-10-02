// In-process Hardhat only. The public upstream is protected by the caller's read proxy.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),E=require('ethers');
const L=require('./pons-launch-buy.cjs'),B=require('./pons-batch-route.cjs');
const KEY=E.id('QIANQI PUBLIC LOCAL TEST KEY ONLY');
async function configure(m,provider){
 Object.assign(m,{schema:L.SCHEMA,routeVersion:L.ID,batchExecutor:B.EXECUTOR});
 m.codeHashes.batchExecutor=B.EXECUTOR_HASH;
 for(const [k,[a,h]] of Object.entries(B.PINS)){m[k]=a;m.codeHashes[k]=h;}
 for(const k of L.FIELDS)assert.equal(E.keccak256(await provider.getCode(m[k])),m.codeHashes[k],'Changed '+k);
 L.validate(m);
}
async function buy({rpc,curve,quote,account,expected}){
 const signer=new E.Wallet(KEY);assert.equal(account.toLowerCase(),signer.address.toLowerCase());
 const abi=new E.Interface(['function execute(bytes32,bytes) payable']);
 const calls=[[quote.target,0,quote.interface.encodeFunctionData('approve',[curve.target,101000000n])],[curve.target,0,curve.interface.encodeFunctionData('buy',[101000000n,expected*99n/100n,account])]];
 const data=abi.encodeFunctionData('execute',['0x01'+'00'.repeat(31),E.AbiCoder.defaultAbiCoder().encode(['tuple(address,uint256,bytes)[]'],[calls])]);
 await rpc('hardhat_stopImpersonatingAccount',[account]);
 try{
  const nonce=Number(BigInt(await rpc('eth_getTransactionCount',[account,'latest']))),head=await rpc('eth_getBlockByNumber',['latest',false]);
  const authorization=await signer.authorize({address:B.EXECUTOR,chainId:4663,nonce:nonce+1});
  const raw=await signer.signTransaction({type:4,chainId:4663,nonce,to:account,data,value:0,gasLimit:6000000n,maxFeePerGas:BigInt(head.baseFeePerGas)*2n+1000000000n,maxPriorityFeePerGas:1000000000n,authorizationList:[authorization]});
  const hash=await rpc('eth_sendRawTransaction',[raw]),receipt=await rpc('eth_getTransactionReceipt',[hash]);
  assert.equal(receipt.status,'0x1');assert.equal(await rpc('eth_getCode',[account,'latest']),'0xef0100'+B.EXECUTOR.slice(2));
  return hash;
 }finally{await rpc('hardhat_impersonateAccount',[account]);}
}
async function finish({rpc,manifest,owner,provider,compiled,promo,prefix}){
 const instanceId=E.id('pons-combined-local-policy'),D=require('./direct-buy.cjs'),a=compiled.BuyPolicySource;
 const source=await new E.ContractFactory(a.abi,a.evm.bytecode.object,owner).deploy(instanceId,D.hash(manifest),owner.address,20,require('./buy-policy-format.cjs').initialAdapters(manifest));await source.waitForDeployment();
 const statePath=path.resolve(prefix+'.combined-index.json');assert(!fs.existsSync(statePath));
 const lifecycle={schema:'attempt-lifecycle-v1',instanceId,vault:promo.target,source:promo.target,sourceCodeHash:E.keccak256(await provider.getCode(promo.target))};
 const config={manifest,lifecycle,buyPolicy:{source:source.target,publisher:owner.address,instanceId,genesisHash:D.hash(manifest),sourceCodeHash:E.keccak256(await provider.getCode(source.target)),chainId:4663,noticeBlocks:20},indexer:{statePath,maxAgeSeconds:120}};
 const readRpc=(m,p=[])=>rpc(m,m==='eth_getBlockByNumber'&&p[0]==='finalized'?['latest',p[1]]:p);
 const {indexOnce}=require('./persistent-buy-indexer.cjs');
 await indexOnce({config,rpc:readRpc,statePath});
 const saved=JSON.parse(fs.readFileSync(statePath));assert.equal(saved.index.policyStatus.mode,'admitted');
 const eligible=saved.index.ledger.decisions.filter(d=>d.status==='ELIGIBLE');assert.equal(eligible.length,5);assert.equal(eligible[0].reason,'SUPPORTED_SELF_BATCH_BUY');assert.equal(eligible.filter(d=>d.poolTokenOutRaw).length,3);
 await indexOnce({config,rpc:readRpc,statePath});assert.equal(JSON.parse(fs.readFileSync(statePath)).index.ledgerHash,saved.index.ledgerHash);
 const expected=require('./attempt-lifecycle.cjs').replayAttempts(manifest,lifecycle,saved.index.blocks).wallets.find(w=>w.wallet===owner.address.toLowerCase());
 const api=await require('./verify-pons-wallet-api.cjs').verify({config,wallet:owner.address,expected});
 fs.writeFileSync(prefix+'.combined-config.json',JSON.stringify(config,null,2));
 return {status:'PONS_COMBINED_INDEX_API_PASSED',publicSends:false,eligibleBuys:eligible.length,balances:api.results[0].balances,api,limits:['Fresh local fork; synthetic USDG/native funding','First BUY signed type4 with public test key; remaining transactions locally impersonated','Local latest mapped to finalized; no public finality proof','Open ticket lifecycle only; no draws in this run','v4 direct route only; v4 wallet batches not admitted']};
}
module.exports={configure,buy,finish,KEY};
