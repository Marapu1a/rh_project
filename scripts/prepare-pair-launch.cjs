// Draft simulation only. No signer or send API. Draft metadata is NOT published.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {Interface,AbiCoder,ContractFactory,getAddress,getCreateAddress,keccak256,toUtf8Bytes,toQuantity}=require('ethers');
const {collect}=require('./pair-launch-preview.cjs');
const {httpRpc}=require('./public-rpc-qualification.cjs');
const coder=AbiCoder.defaultAbiCoder();
const TYPE='tuple(bytes identityData,tuple(address quoteToken,uint16 weightBps)[] allocations,bytes[] openingData,uint256 deadline,bytes32 userSalt,bool sniperProtection,uint256 protectionBlocks,uint8 mode,uint16 feeBps,bytes modeData,uint64 policyEffectiveAt,address[] holderExcluded)';
function encodeLaunch({identity,quote,candidate,salt,collector,deadline}){
 const opening=BigInt(candidate.sqrtPriceX96);
 const data=coder.encode(['uint8','uint160','int24','int24','uint256','bytes32','uint160','bool'],[candidate.quoteDecimals,opening,candidate.tickLower,candidate.tickUpper,candidate.observedAt,candidate.routeEvidence,opening*2n,true]);
 return coder.encode([TYPE],[[coder.encode(['string','string','string','bytes32'],identity.slice(1)),[[quote,10000]],[data],deadline,salt,false,0,1,300,coder.encode(['address'],[collector]),0,[]]]);
}
function compileCollector(){
 const solc=require('solc'),name='contracts/InfinityCollector.sol';
 const result=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{[name]:{content:fs.readFileSync(name,'utf8')}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:p=>{try{return {contents:fs.readFileSync('node_modules/'+p,'utf8')};}catch{return {error:'Missing dependency'};}}}));
 assert(!(result.errors||[]).some(x=>x.severity==='error'),'Collector compile failed');return result.contracts[name].InfinityCollector;
}
async function prepare(){
 const p=JSON.parse(fs.readFileSync('config/reserve/pair-launch-plan.json','utf8'));
 const owner=getAddress(p.launch.creator);assert(owner===getAddress(p.roles.governor),'Governor must match this draft deployer');
 const rpc=httpRpc(process.env.RH_RPC_URL||'https://rpc.mainnet.chain.robinhood.com');
 const evidence=await collect(p,{rpc});if(!evidence.preview.candidateUsableForFurtherSimulation)throw Object.assign(Error('Fresh source/opening required'),{code:'LAUNCH_PREFLIGHT_BLOCKED',evidence});
 const block=evidence.evidence.source.block,tag=block.number;
 const read=async(to,signature,args=[])=>{const i=new Interface([signature]),f=i.fragments[0];return i.decodeFunctionResult(f,await rpc('eth_call',[{to,data:i.encodeFunctionData(f,args)},tag]));};
 const sources=require('./launch-source-preflight.cjs').inputs(),engine=sources.sources.engine.address,hook=sources.sources.hook.address;
 const [factory]=await read(engine,'function factory() view returns(address)');
 const [nonce,balance,quoteBalance,pending]=await Promise.all([rpc('eth_getTransactionCount',[owner,tag]),rpc('eth_getBalance',[owner,tag]),read(p.contracts.quote.address,'function balanceOf(address) view returns(uint256)',[owner]),rpc('eth_getTransactionCount',[owner,'pending'])]);
 assert(BigInt(nonce)===BigInt(pending),'Pending transaction: address plan unstable');
 const collector=getCreateAddress({from:owner,nonce:BigInt(nonce)});
 const metadata=fs.readFileSync('config/qianqi-metadata-draft.json','utf8');
 const identity=[owner,p.launch.name,p.launch.symbol,'https://qianqi.site/metadata/qianqi.json',keccak256(toUtf8Bytes(metadata))];
 let token,lock,salt;
 // Select standard (non-vanity) salt for project-token0; no test price inversion.
 for(let n=0;n<32;n++){
  salt=keccak256(toUtf8Bytes('QIANQI launch draft '+identity[4]+' '+n));
  [token,lock]=await read(factory,'function predictStandard((address creator,string name,string symbol,string metadataURI,bytes32 metadataHash),bytes32,uint256) view returns(address,address)',[identity,salt,0]);
  if(BigInt(token)<BigInt(p.contracts.quote.address)&&await rpc('eth_getCode',[token,tag])==='0x')break;
  token=null;
 }
 assert(token,'No unused token0 prediction');assert(await rpc('eth_getCode',[collector,tag])==='0x','Collector address occupied');
 const artifact=compileCollector(),deployment=await new ContractFactory(artifact.abi,artifact.evm.bytecode.object).getDeployTransaction(owner,token,p.contracts.quote.address,hook,factory);
 const launch=new Interface(sources.sources.launch.abi);
 const data=launch.encodeFunctionData('launchInfinity',[encodeLaunch({identity,quote:p.contracts.quote.address,candidate:evidence.preview.openingCandidate,salt,collector,deadline:BigInt(block.timestamp)+1200n})]);
 const requests={collector:{from:owner,data:deployment.data,value:'0x0'},launch:{from:owner,to:sources.proxy,data,value:toQuantity(BigInt(evidence.evidence.source.values.launchFee))}};
 const results={};
 for(const [name,request]of Object.entries(requests)){
  try{const result=await rpc('eth_call',[request,tag]);if(name==='launch')assert.equal(launch.decodeFunctionResult('launchInfinity',result)[0].toLowerCase(),token.toLowerCase());results[name]={callPassed:true};}catch{results[name]={callPassed:false};}
  try{results[name].gasUnits=String(BigInt(await rpc('eth_estimateGas',[request,tag])));}catch{results[name].gasUnits=null;}
 }
 const gasPrice=BigInt(evidence.evidence.source.values.gasPriceWei);
 for(const value of Object.values(results))value.sampledGasCostWei=value.gasUnits?String(BigInt(value.gasUnits)*gasPrice):null;
 assert.equal((await rpc('eth_getBlockByNumber',[tag,false])).hash,block.hash,'Block changed');
 return {schema:'qianqi-launch-draft-v1',status:'draft-not-signable',owner,block,balances:{ethWei:String(BigInt(balance)),usdgRaw:String(quoteBalance[0])},nonce:String(BigInt(nonce)),predicted:{token,lock,collector,factory},identity,salt,metadataPublished:false,assumptions:['Draft metadata URI/content','Standard token without vanity suffix','Protection disabled as in current PAIR frontend; not final owner choice','Collector and launch simulated independently, not a sequential deployment proof'],requests,results,launchFeeWei:evidence.evidence.source.values.launchFee,totalProjectCostWei:null,remaining:['Sequential rehearsal','Metadata publication and identity freeze','Other contract roles and immutable settings','Promo deployments/bind/admission','RPC and executor custody'],authorizationToSend:false,evidence};
}
if(require.main===module)(async()=>{const file=process.argv[2];assert(file&&!fs.existsSync(file),'New output path required');const out=await prepare();fs.writeFileSync(file,JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:out.status,balances:out.balances,predicted:out.predicted,results:out.results,authorizationToSend:false},null,2));})().catch(e=>{console.error('Draft preparation failed: '+e.message);process.exitCode=1;});
module.exports={encodeLaunch,TYPE,prepare};
