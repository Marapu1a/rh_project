// Read-only bundle builder. Produces reviewable calldata, never sends a transaction.
const fs=require('node:fs'),path=require('node:path'),E=require('ethers');
const R=require('./purchase-recognition.cjs'),D=require('./direct-buy.cjs');
async function prepare({config,blocks,transactionHashes,rpc,directory}){
 const t=R.trust(config.recognition),m=config.manifest;
 if(!Array.isArray(transactionHashes)||!transactionHashes.length||transactionHashes.length>50||new Set(transactionHashes).size!==transactionHashes.length)throw Error('Select 1..50 unique purchases');
 if(BigInt(await rpc('eth_chainId',[]))!==BigInt(m.chainId))throw Error('Wrong RPC chain');
 const final=await rpc('eth_getBlockByNumber',['finalized',false]),proofs=[];
 for(const transactionHash of transactionHashes){
  const block=blocks.find(b=>b.transactions.some(r=>r.tx.hash.toLowerCase()===transactionHash.toLowerCase()));
  if(!block||BigInt(block.number)>BigInt(final.number))throw Error('Purchase not retained/finalized');
  const tag='0x'+BigInt(block.number).toString(16),before='0x'+(BigInt(block.number)-1n).toString(16),row=block.transactions.find(r=>r.tx.hash.toLowerCase()===transactionHash.toLowerCase());
  if((await rpc('eth_getBlockByNumber',[tag,false])).hash!==block.hash)throw Error('Purchase branch changed');
  const receipt=await rpc('eth_getTransactionReceipt',[row.tx.hash]);
  if(D.hash(receipt.logs)!==D.hash(row.receipt.logs)||receipt.blockHash!==block.hash||BigInt(receipt.status)!==1n)throw Error('Purchase receipt changed');
  const trace=await rpc('debug_traceTransaction',[row.tx.hash,{tracer:'callTracer',tracerConfig:{withLog:true}}]);
  const targets=new Set([row.tx.from.toLowerCase()]);
  function walk(frame){targets.add(frame.to.toLowerCase());for(const c of frame.calls||[])walk(c);}walk(trace);
  const codeHashes={},parentCodeHashes={};
  for(const address of targets){codeHashes[address]=E.keccak256(await rpc('eth_getCode',[address,tag]));parentCodeHashes[address]=E.keccak256(await rpc('eth_getCode',[address,before]));if(codeHashes[address]!==parentCodeHashes[address])throw Error('Runtime changed in purchase block');}
  const proof={transactionHash:row.tx.hash.toLowerCase(),blockHash:block.hash.toLowerCase(),trace,codeHashes,parentCodeHashes};
  R.verify(m,t,row,proof,block);proofs.push(proof);
  if((await rpc('eth_getBlockByNumber',[tag,false])).hash!==block.hash)throw Error('Purchase branch changed');
 }
 const bundle={schema:'purchase-recognition-bundle-v1',instanceId:t.instanceId.toLowerCase(),chainId:String(m.chainId),token:m.token.toLowerCase(),proofs};
 if(Buffer.byteLength(JSON.stringify(bundle))>R.MAX_BYTES)throw Error('Split batch: evidence exceeds byte limit');
 const bundleHash=D.hash(bundle),file=path.join(directory,bundleHash+'.json');fs.mkdirSync(directory,{recursive:true});
 if(fs.existsSync(file)){if(D.hash(JSON.parse(fs.readFileSync(file,'utf8')))!==bundleHash)throw Error('Conflicting existing bundle');}
 else fs.writeFileSync(file,JSON.stringify(bundle)+'\n',{flag:'wx'});
 return {schema:'purchase-recognition-plan-v1',bundleHash,count:proofs.length,file,request:{from:t.publisher,to:t.source,chainId:'0x'+BigInt(m.chainId).toString(16),value:'0x0',data:R.ABI.encodeFunctionData('confirm',[bundleHash,proofs.length])},sent:false};
}
module.exports={prepare};
if(require.main===module)(async()=>{
 const [configPath,statePath,directory,...transactionHashes]=process.argv.slice(2);
 if(!directory||!process.env.RH_RPC_URL)throw Error('Usage: CONFIG INDEX_STATE BUNDLE_DIRECTORY TX_HASH...; RH_RPC_URL required');
 const config=JSON.parse(fs.readFileSync(configPath,'utf8')),state=JSON.parse(fs.readFileSync(statePath,'utf8'));
 const result=await prepare({config,blocks:state.index.blocks,directory,transactionHashes,rpc:require('./public-rpc-qualification.cjs').httpRpc(process.env.RH_RPC_URL)});
 console.log(JSON.stringify(result,null,2));
})().catch(()=>{console.error('Recognition preparation failed; no transaction sent');process.exitCode=1;});
