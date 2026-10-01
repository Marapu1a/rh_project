// Research only: inspect an unadmitted PAIR release on an in-process fork.
// This deliberately does NOT update pins or produce authorized launch requests.
process.env.HARDHAT_CONFIG=require.resolve('../test/fixtures/public-hardhat.config.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers'),hre=require('hardhat');
const {startReadProxy}=require('./read-only-fork-rpc.cjs'),{httpRpc}=require('./public-rpc-qualification.cjs');
const {TYPE}=require('./prepare-pair-launch.cjs');
const PROXY='0xB0D389250c61c69EcCD5d986fC8482CBfA5418C4',SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
async function main(){
 const [draftFile,file]=process.argv.slice(2);assert(draftFile&&file&&!fs.existsSync(file),'DRAFT NEW_OUTPUT required');
 const draft=JSON.parse(fs.readFileSync(draftFile,'utf8'));assert.equal(draft.status,'draft-not-signable');assert.equal(draft.authorizationToSend,false);
 const out={schema:'pair-wrapper-diagnostic-v1',status:'RUNNING',authorizationToSend:false,publicSends:false,assumptions:['Historical draft identity; not final metadata','All writes exclusively in-process Hardhat','No admission change and no full source/security proof'],calls:[]};let proxy;
 const local=(method,params=[])=>hre.network.provider.send(method,params);
 try{
  const remote=httpRpc(process.env.RH_RPC_URL||'https://rpc.mainnet.chain.robinhood.com');assert.equal(BigInt(await remote('eth_chainId',[])),4663n);
  const qres=await fetch('https://pair.fund/api/launches/pancake-v1/opening-quotes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({quoteTokens:[draft.evidence.preview.route.quote]}),signal:AbortSignal.timeout(15000)});assert(qres.ok,'Opening API HTTP '+qres.status);
  const quotes=await qres.json();assert.equal(quotes.chainId,4663);const q=quotes.quotes[0].candidates[0];assert.equal(q.quoteToken.toLowerCase(),draft.evidence.preview.route.quote.toLowerCase());assert.equal(q.verification,'verified');assert(Math.abs(Date.now()/1000-Number(q.observedAt))<300);
  const b=await remote('eth_getBlockByNumber',['latest',false]);out.anchor={number:b.number,hash:b.hash};
  const slot=await remote('eth_getStorageAt',[PROXY,SLOT,b.number]);out.implementation='0x'+slot.slice(-40);out.runtimeHash=ethers.keccak256(await remote('eth_getCode',[out.implementation,b.number]));
  proxy=await startReadProxy(process.env.RH_FORK_RPC_URL||'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public');
  assert.equal(await local('eth_chainId'),'0x1237');await local('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:Number(BigInt(b.number))}}]);
  assert.equal((await local('eth_getBlockByNumber',['latest',false])).hash,b.hash);
  const coder=ethers.AbiCoder.defaultAbiCoder(),abi=new ethers.Interface(require('../research/infinity-source-audit/launch.json').abi);
  const params=Array.from(coder.decode([TYPE],abi.decodeFunctionData('launchInfinity',draft.requests.launch.data)[0])[0]);
  assert(BigInt(draft.predicted.token)<BigInt(q.quoteToken),'Diagnostic supports token0 only');
  params[2]=[coder.encode(['uint8','uint160','int24','int24','uint256','bytes32','uint160','bool'],[q.quoteDecimals,q.sqrtPriceX96,q.tickLower,q.tickUpper,q.observedAt,q.routeEvidence,BigInt(q.sqrtPriceX96)*2n,true])];params[3]=BigInt(b.timestamp)+1200n;
  const request={from:draft.owner,to:PROXY,data:abi.encodeFunctionData('launchInfinity',[coder.encode([TYPE],[params])]),value:ethers.toQuantity(BigInt(draft.launchFeeWei)),gas:'0x989680',gasPrice:ethers.toQuantity(BigInt(await remote('eth_gasPrice',[]))*2n)};
  console.log('diagnostic: fork launch and execution trace');
  await local('hardhat_impersonateAccount',[draft.owner]);
  // No collector deployment here: only tests the launch route with its nominated address.
  const tx=await local('eth_sendTransaction',[request]);const receipt=await local('eth_getTransactionReceipt',[tx]);assert.equal(receipt.status,'0x1');
  out.localReceipt=receipt;
  const trace=await local('debug_traceTransaction',[tx,{disableMemory:true,disableStorage:true}]);assert.equal(trace.failed,false);
  for(const s of trace.structLogs){if(['CALL','STATICCALL','DELEGATECALL','CALLCODE'].includes(s.op))out.calls.push({depth:s.depth,op:s.op,to:'0x'+s.stack.at(-2).slice(-40)});}
  const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
  const hook=new ethers.Contract(require('../research/infinity-source-audit/hook.json').address,require('../research/infinity-source-audit/hook.json').abi,provider);
  const p=await hook.activePolicy(draft.predicted.token),source=new ethers.Contract(p.destination,require('../research/infinity-source-audit/creator.json').abi,provider),cp=await source.currentPolicy();
  assert.equal(p.mode,1n);assert.equal(p.feeBps,300n);assert.equal(cp.recipient.toLowerCase(),draft.predicted.collector.toLowerCase());
  out.policy={token:draft.predicted.token,mode:String(p.mode),feeBps:String(p.feeBps),source:p.destination,recipient:cp.recipient};out.status='DIAGNOSTIC_PASSED';out.proxyStats=proxy.stats;
 }catch(e){out.status='BLOCKED';out.error=e.message;process.exitCode=1;}
 finally{if(proxy)proxy.close();fs.writeFileSync(file,JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:out.status,error:out.error,policy:out.policy,delegates:out.calls.filter(x=>x.op==='DELEGATECALL')},null,2));}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
