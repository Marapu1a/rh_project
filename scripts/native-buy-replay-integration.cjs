// Local native launch proof; uses the existing direct BUY policy and registration gate.
const assert=require('node:assert/strict'),http=require('node:http'),{ethers}=require('ethers');
const {hash,replay}=require('./direct-buy.cjs');
async function prepare({provider,user,rpc,compiled,config}){
 assert.equal(await rpc('eth_chainId'),'0x7a69');
 const anchor=await rpc('eth_getBlockByNumber',['latest',false]),owner=await user.getAddress();
 async function deploy(name,args=[]){const a=compiled[name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,user).deploy(...args);await c.waitForDeployment();return c;}
 const registry=await deploy('ParticipantRegistry'),codeHashes={};
 const addresses={router:config.router,manager:config.manager,hook:config.poolKey[4],token:config.token,quote:config.quote,registry:registry.target};
 for(const [name,address]of Object.entries(addresses))codeHashes[name]=ethers.keccak256(await provider.getCode(address));
 const manifest={...addresses,codeHashes,poolKey:config.poolKey.map(x=>typeof x==='bigint'?Number(x):x),poolId:config.poolId,
  chainId:31337,schema:'direct-buy-v1',routeVersion:'rh-ur-10-060b0e-v1',
  anchor:{number:anchor.number,hash:anchor.hash},quoteDecimals:6,entryThresholdRaw:'100000000'};
 const instanceId=ethers.id('LOCAL native BUY admission proof');
 const source=await deploy('BuyPolicySource',[instanceId,hash(manifest),owner,2,require('./buy-policy-format.cjs').initialAdapters(manifest)]);
 const trust={chainId:31337,instanceId,source:source.target,publisher:owner,genesisHash:hash(manifest),noticeBlocks:2,sourceCodeHash:ethers.keccak256(await provider.getCode(source.target))};
 return {registry,setup:{manifest,trust}};
}
async function finish({rpc,setup,before,after}){
 const height=Number(BigInt(await rpc('eth_blockNumber')));
 const resolved=await require('./buy-policy-runtime.cjs').resolveBuyPolicy({manifest:setup.manifest,buyPolicy:setup.trust},rpc,height);
 assert.equal(resolved.policyStatus.mode,'admitted');
 const methods=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getTransactionReceipt']);
 const server=http.createServer(async(req,res)=>{
  let id=null;try{let body='';for await(const c of req)body+=c;const q=JSON.parse(body);id=q.id;
   assert(methods.has(q.method),'Read-only local scanner');const result=await rpc(q.method,q.params);
   res.end(JSON.stringify({jsonrpc:'2.0',id,result}));
  }catch(error){res.end(JSON.stringify({jsonrpc:'2.0',id,error:{code:-32000,message:error.message}}));}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const raw=await require('./replay-direct-buy.cjs').scan(resolved.manifest,'http://127.0.0.1:'+server.address().port,height);
  const ledger=replay(raw.manifest,raw.blocks);assert.equal(ledger.decisions.length,2);
  const rejected=ledger.decisions.find(d=>d.transactionHash===before),accepted=ledger.decisions.find(d=>d.transactionHash===after);
  assert.equal(rejected.reason,'NOT_REGISTERED_AT_SWAP');assert.equal(rejected.entriesMinted,'0');
  assert.equal(accepted.status,'ELIGIBLE');assert.equal(accepted.grossQuoteRaw,'100000000');assert.equal(accepted.entriesMinted,'1');
  assert.equal(ledger.wallets.length,1);assert.equal(ledger.wallets[0].entriesMinted,'1');assert.equal(ledger.wallets[0].carryRaw,'0');
  assert.equal(hash(replay(raw.manifest,[...raw.blocks,structuredClone(raw.blocks.at(-1))])),hash(ledger));
  return {setup,policyStatus:resolved.policyStatus,raw,ledger,ledgerHash:hash(ledger),buyHashes:{before,after},
   limitation:'Local admitted genesis and registration gate; no automatic participation, public finality, draw or payout proof.'};
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
module.exports={prepare,finish};
