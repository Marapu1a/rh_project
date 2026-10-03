// Executed fork payload; RPC policy/lifecycle and contiguous chain are synthetic.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),E=require('ethers');
const proof=require('../../docs/evidence/PONS_ZEROEX_POOL_BUY_2026-10-02.json');
const D=require('../../scripts/direct-buy.cjs'),Z=require('../../scripts/pons-zeroex-buy.cjs');
const addr=n=>E.toBeHex(n,20);
function fixture(input=proof){
 const m=structuredClone(input.manifest),{tx,receipt,block}=structuredClone(input.execution);
 const b={...block,transactions:[{tx,receipt}],...(input.accountEvidence?{entrypointAccounts:structuredClone(input.accountEvidence)}:{})};
 return {m,tx,receipt,block:b,blocks:[b],wallet:(input.entrypoint?.op.sender??tx.from).toLowerCase()};
}
function setup(t,input=proof){
 const f=fixture(input),m=f.m;
 // Remap only chain identity for repeat/reorg tests; calldata/log payloads retained.
 m.anchor={number:10,hash:E.id('0x synthetic anchor')};
 const b=f.block,n=11,hash=E.id('0x synthetic block11');Object.assign(b,{number:n,hash,parentHash:m.anchor.hash});
 for(const saved of Object.values(b.entrypointAccounts||{}))saved.parentHash=m.anchor.hash;
 for(const o of [f.tx,f.receipt,...f.receipt.logs])Object.assign(o,{blockNumber:E.toQuantity(n),blockHash:hash,transactionIndex:'0x0'});
 const statePath=path.resolve('.local/logs/zeroex-integration-'+crypto.randomUUID()+'.json');
 t.after(()=>{for(const p of [statePath,statePath+'.bad'])if(fs.existsSync(p))fs.unlinkSync(p);});
 const lifecycle={schema:'attempt-lifecycle-v1',instanceId:E.id('0x synthetic lifecycle'),source:addr(902),sourceCodeHash:E.keccak256('0x01'),vault:addr(901)};
 const config={manifest:m,lifecycle,indexer:{statePath,maxAgeSeconds:120},buyPolicy:{source:addr(900),publisher:f.wallet,instanceId:lifecycle.instanceId,genesisHash:D.hash(m),sourceCodeHash:E.keccak256('0x01'),chainId:4663,noticeBlocks:20}};
 const policy=require('../../scripts/buy-policy-admission.cjs').ABI,factory=new E.Interface(require('../../scripts/integrations/pons-v2.cjs').FAB);
 const getters=new E.Interface(['function token() view returns(address)','function pairToken() view returns(address)','function factory() view returns(address)','function feePolicy() view returns(address)','function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function getPool(address,address,uint24) view returns(address)','function poolManager() view returns(address)','function launches(bytes32) view returns(bool registered,bool memecoinIsCurrency0,address memecoin,address quoteToken,address creator,address buybackCreatorRecipient,address protocolFeeRecipient,uint16 creatorTaxBps,uint16 protocolFeeShareBps,uint16 buybackBurnBps,uint16 hookFeeBps,uint16 maxInternalPriceImpactBps,bool buybackEnabled)']);
 const calls=[],flags={outage:false};
 const rpc=async(method,p=[])=>{
  calls.push([method,p]);if(flags.outage)throw Error('offline');
  if(method==='eth_chainId')return '0x1237';
  if(method==='eth_getLogs')return [];
  if(method==='eth_getBlockByNumber'){
   const n=p[0]==='finalized'?f.blocks.at(-1).number:Number(BigInt(p[0]));
   if(n===10)return {...m.anchor,transactions:[]};
   const b=f.blocks.find(b=>Number(b.number)===n);if(!b)throw Error('missing block '+n);
   return {...b,transactions:p[1]?b.transactions.map(x=>x.tx):[]};
  }
  if(method==='eth_getCode')return input.accountEvidence?.[p[0].toLowerCase()]?.code??input.runtimes[p[0].toLowerCase()]?.code??'0x01';
  if(method==='eth_getTransactionReceipt')return f.blocks.flatMap(b=>b.transactions).find(x=>x.tx.hash===p[0]).receipt;
  if(method==='eth_call'){
   const q=p[0],to=q.to.toLowerCase();
   if(to===m.entryPointAccount){const abi=require('../../scripts/pons-entrypoint-codec.cjs').ACCOUNT;return abi.encodeFunctionResult('entryPoint',[m.entryPoint]);}
   if(to===config.buyPolicy.source){const g=policy.parseTransaction(q),values={instanceId:lifecycle.instanceId,genesisHash:D.hash(m),publisher:f.wallet,noticeBlocks:20,SCHEMA_VERSION:1,genesisAdaptersHash:require('../../scripts/buy-policy-format.cjs').genesisAdaptersHash(m),publishedCount:0,currentHash:D.hash(m),lastFromBlock:0};return policy.encodeFunctionResult(g.name,[values[g.name]]);}
   if(to===m.factory){const g=factory.parseTransaction(q);if(g.name==='getLaunchedToken')return factory.encodeFunctionResult(g.name,[[m.token,m.curve,f.wallet,f.wallet,m.quote,8090000000n,0,200,m.creatorTaxBps,false,2,0,0,0,true]]);if(g.name==='memeHook')return factory.encodeFunctionResult(g.name,[m.hook]);}
   const g=getters.parseTransaction(q);let value;
   if(to===m.hook&&g.name==='launches')return getters.encodeFunctionResult(g.name,[true,m.poolKey[0]===m.token,m.token,m.quote,f.wallet,f.wallet,addr(904),m.creatorTaxBps,0,0,m.hookFeeBps,0,false]);
   if(to===m.fundingPool)value={token0:m.weth,token1:m.quote,fee:100,factory:addr(903)}[g.name];
   else if(to===m.fundingRouter)value=addr(903);
   else if(to===addr(903))value=m.fundingPool;
   else value={token:m.token,pairToken:m.quote,factory:m.factory,feePolicy:m.hook,poolManager:m.manager}[g.name];
   return getters.encodeFunctionResult(g.name,[value]);
  }
  throw Error('Unexpected RPC '+method);
 };
 const run=()=>require('../../scripts/persistent-buy-indexer.cjs').indexOnce({config,rpc,statePath});
 return {...f,config,statePath,rpc,run,calls,flags};
}
function changeAction(f,index,name,edit){
 const outer=Z.HOLDER.decodeFunctionData('exec',f.tx.input).toArray(true);
 const inner=Z.SETTLER.decodeFunctionData('execute',outer[4]).toArray(true);
 const a=Z.ACTIONS.decodeFunctionData(name,inner[1][index]).toArray(true);edit(a);
 inner[1][index]=Z.ACTIONS.encodeFunctionData(name,a);outer[4]=Z.SETTLER.encodeFunctionData('execute',inner);f.tx.input=Z.HOLDER.encodeFunctionData('exec',outer);
}
module.exports={proof,fixture,setup,changeAction,addr};
