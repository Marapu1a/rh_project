// Called only by the in-process fork runner, after exact terminal transactions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),E=require('ethers');
async function verify({rpc,provider,owner,manifest,promo,artifacts,prefix,row}){
 await rpc('hardhat_metadata');
 const instanceId=E.id('pons-pool-batch-local-admission'),D=require('./direct-buy.cjs'),a=artifacts.BuyPolicySource;
 const source=await new E.ContractFactory(a.abi,a.evm.bytecode.object,owner).deploy(instanceId,D.hash(manifest),owner.address,20,require('./buy-policy-format.cjs').initialAdapters(manifest));await source.waitForDeployment();
 const statePath=path.resolve(prefix+'.'+row.pay+'-'+row.mode+'.index.json');assert(!fs.existsSync(statePath));
 const codeHash=E.keccak256(await provider.getCode(promo.target));
 const lifecycle={schema:'attempt-lifecycle-v1',instanceId,vault:promo.target,source:promo.target,sourceCodeHash:codeHash};
 const config={manifest,lifecycle,indexer:{statePath,maxAgeSeconds:120},buyPolicy:{source:source.target,publisher:owner.address,instanceId,genesisHash:D.hash(manifest),sourceCodeHash:E.keccak256(await provider.getCode(source.target)),chainId:4663,noticeBlocks:20}};
 const read=(m,p=[])=>rpc(m,m==='eth_getBlockByNumber'&&p[0]==='finalized'?['latest',p[1]]:p);
 const {indexOnce}=require('./persistent-buy-indexer.cjs');await indexOnce({config,rpc:read,statePath});
 const state=JSON.parse(fs.readFileSync(statePath)).index;assert.equal(state.policyStatus.mode,'admitted');assert.equal(state.ledger.decisions.length,1);assert.equal(state.ledger.decisions[0].status,'ELIGIBLE');
 assert.equal(state.ledger.decisions[0].netQuoteDebitRaw,row.capture.amountIn);
 await indexOnce({config,rpc:read,statePath});assert.equal(JSON.parse(fs.readFileSync(statePath)).index.ledgerHash,state.ledgerHash);
 const expected=require('./attempt-lifecycle.cjs').replayAttempts(manifest,lifecycle,state.blocks).wallets[0];
 const api=await require('./verify-pons-wallet-api.cjs').verify({config,wallet:owner.address,expected});
 fs.writeFileSync(statePath+'.config.json',JSON.stringify(config,null,2));
 return {status:'PONS_POOL_BATCH_INDEX_API_PASSED',head:state.head,ledgerHash:state.ledgerHash,api,limits:['Fresh local admitted policy; not a public policy publication','Open lifecycle v1 only; no draw/finality qualification','Each scenario restores its own baseline; no cumulative four-purchase history']};
}
module.exports={verify};
