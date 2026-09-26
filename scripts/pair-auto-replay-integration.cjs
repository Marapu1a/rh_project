// Local fork registration + typed genesis admission + whole-block scanner/replay.
const assert=require('node:assert/strict'),http=require('node:http'),{ethers}=require('ethers');
const AUTO=require('./pair-auto-buy.cjs');
const {hash,replay}=require('./direct-buy.cjs');
async function prepare({provider,user,rpc,token}){
 assert.equal(await rpc('eth_chainId'),'0x7a69');
 const compiled=require('./compile.cjs').compile();
 const anchor=await rpc('eth_getBlockByNumber',['latest',false]),owner=await user.getAddress();
 async function deploy(name,args=[]){const c=compiled[name],instance=await new ethers.ContractFactory(c.abi,c.evm.bytecode.object,user).deploy(...args);await instance.waitForDeployment();return instance;}
 const registry=await deploy('ParticipantRegistry');
 const addresses={router:AUTO.ROUTER,manager:AUTO.MANAGER,hook:AUTO.HOOK,token,quote:AUTO.USDG,registry:registry.target};
 const codeHashes={};for(const [name,address] of Object.entries(addresses))codeHashes[name]=ethers.keccak256(await provider.getCode(address));
 const manifest={...addresses,codeHashes,chainId:31337,schema:'direct-buy-v2',routeVersion:'scheduled-routes-v1',
  routes:[{id:AUTO.ID,fromBlock:Number(BigInt(anchor.number))+1}],anchor:{number:anchor.number,hash:anchor.hash},quoteDecimals:6,entryThresholdRaw:'100000000'};
 const instanceId=ethers.id('LOCAL AUTO registration integration');
 const source=await deploy('BuyPolicySource',[instanceId,hash(manifest),owner,2,require('./buy-policy-format.cjs').initialAdapters(manifest)]);
 const trust={chainId:31337,instanceId,source:source.target,publisher:owner,genesisHash:hash(manifest),noticeBlocks:2,sourceCodeHash:ethers.keccak256(await provider.getCode(source.target))};
 await(await registry.register()).wait();
 return {manifest,trust};
}
async function finish({rpc,setup,cases}){
 const height=Number(BigInt(await rpc('eth_blockNumber')));
 const resolved=await require('./buy-policy-runtime.cjs').resolveBuyPolicy({manifest:setup.manifest,buyPolicy:setup.trust},rpc,height);
 assert.equal(resolved.policyStatus.mode,'admitted');
 const methods=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getTransactionReceipt']);
 const server=http.createServer(async(req,res)=>{
  try{let body='';for await(const c of req)body+=c;const q=JSON.parse(body);if(!methods.has(q.method))throw Error('Read-only local scanner');
   const result=await rpc(q.method,q.params);res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
  }catch(error){res.end(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32000,message:error.message}}));}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const raw=await require('./replay-direct-buy.cjs').scan(resolved.manifest,'http://127.0.0.1:'+server.address().port,height);
  const ledger=replay(raw.manifest,raw.blocks);assert.equal(ledger.decisions.length,cases.length);
  assert(ledger.decisions.every(d=>d.status==='ELIGIBLE'));
  assert.equal(ledger.wallets.length,1);assert.equal(ledger.wallets[0].carryRaw,'3000000');assert.equal(ledger.wallets[0].entriesMinted,'0');
  for(const c of cases)assert.equal(ledger.decisions.find(d=>d.transactionHash===c.transaction.hash).grossQuoteRaw,String(c.spent));
  assert.equal(hash(replay(raw.manifest,[...raw.blocks,structuredClone(raw.blocks.at(-1))])),hash(ledger));
  return {setup,policyStatus:resolved.policyStatus,raw,ledger,ledgerHash:hash(ledger),limitation:'Local genesis policy, local registration/finality; no public rollout or draw executed.'};
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
module.exports={prepare,finish};
