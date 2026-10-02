// Bounded local-only terminal rehearsal. Avoid long collector/draw setup while
// public RPC historical state is still available. Never sends public transactions.
process.env.HARDHAT_CONFIG=require.resolve('../test/fixtures/pons-7702-hardhat.config.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),E=require('ethers'),hre=require('hardhat');
const {FAB,CUR,ERC}=require('./integrations/pons-v2.cjs'),V=require('./pons-v4-buy.cjs'),B=require('./pons-batch-route.cjs'),L=require(process.argv.includes('--admit-batches')?'./pons-pool-batch-buy.cjs':'./pons-launch-buy.cjs');
const {startReadProxy}=require('./read-only-fork-rpc.cjs');
const artifacts=require('./compile.cjs').compile();
(async()=>{
 const file=process.argv[2];assert(file&&!fs.existsSync(file),'Supply new report path');
 const out={status:'RUNNING',publicSends:false,steps:[],limits:[process.argv.includes('--admit-batches')?'Local policy/index/API proof; empty open lifecycle, no draw/collector cycle':'Minimal fresh local market, no collector/draw/index/API regression in this run','Synthetic native/USDG balances; test account impersonated except actual signed authorization and batch']};
 const save=()=>fs.writeFileSync(file,JSON.stringify(out,(_,v)=>typeof v==='bigint'?String(v):v,2));
 const rpc=(m,p=[])=>hre.network.provider.send(m,p);
 let proxy,remote,heartbeat;
 try{
  remote=new E.JsonRpcProvider('https://rpc.mainnet.chain.robinhood.com');const latest=await remote.getBlock('latest'),block=await remote.getBlock(latest.number-2);out.anchor={number:block.number,hash:block.hash};save();
  proxy=await startReadProxy(process.env.RH_FORK_RPC_URL||'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public');
  heartbeat=setInterval(()=>console.log('read proxy',proxy.stats),15000);heartbeat.unref();
  await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:block.number}}]);assert.equal((await rpc('eth_getBlockByNumber',['latest',false])).hash,block.hash);
  console.log('fork ready');await rpc('evm_mine');
  const provider=new E.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1}),signer=new E.Wallet(require('./pons-launch-rehearsal.cjs').KEY),account=signer.address;
  await rpc('hardhat_setBalance',[account,E.toQuantity(E.parseEther('10'))]);await rpc('hardhat_impersonateAccount',[account]);const owner=new E.JsonRpcSigner(provider,account);
  const factory=new E.Contract('0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',FAB,owner),quote=new E.Contract('0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',ERC,owner);
  const fee=await factory.launchFee(),pin=await factory.previewLaunchEconomics(0,quote.target);
  const params=['QIANQI LOCAL','QL','','terminal only',['','','','',''],account,300,false,pin,E.id('terminal-pool-'+block.hash)];
  const send=async(tx,label)=>{const r=await(await tx).wait();assert.equal(r.status,1);out.steps.push({label,hash:r.hash});save();return r;};
  const launched=await send(factory.launchToken(params,0,quote.target,{value:fee,gasLimit:16000000}),'launch');
  const ev=launched.logs.map(l=>{try{return factory.interface.parseLog(l)}catch{return null}}).find(l=>l?.name==='TokenLaunched');assert(ev);
  const token=ev.args.token,curve=new E.Contract(ev.args.curve,CUR,owner),hook=await factory.memeHook();
  const trace=await rpc('debug_traceCall',[{to:quote.target,data:quote.interface.encodeFunctionData('balanceOf',[account])},'latest',{disableMemory:true,disableStorage:true}]);let funded=false;
  for(const slot of [...new Set(trace.structLogs.filter(x=>x.op==='SLOAD').map(x=>'0x'+x.stack.at(-1)))]){
   const snapshot=await rpc('evm_snapshot');await rpc('hardhat_setStorageAt',[quote.target,slot,E.toBeHex(20000000000n,32)]);
   try{if(await quote.balanceOf(account)===20000000000n){funded=true;break;}}catch{}await rpc('evm_revert',[snapshot]);
  }assert(funded,'Synthetic USDG storage not found');
  await send(quote.approve(curve.target,15000000000n),'approve curve');await send(curve.buy(15000000000n,0,account,{gasLimit:16000000}),'graduate fixture (zero minOut, local only)');
  let record=await factory.getLaunchedToken(token);if(record.phase===1n){await send(factory.createGraduatedPool(token,{gasLimit:16000000}),'create pool');record=await factory.getLaunchedToken(token);}assert.equal(record.phase,2n);
  const a=artifacts.ParticipantRegistry,registry=await new E.ContractFactory(a.abi,a.evm.bytecode.object,owner).deploy();await registry.waitForDeployment();
  let promo;
  if(process.argv.includes('--admit-batches')){const pa=artifacts.PromoVault;promo=await new E.ContractFactory(pa.abi,pa.evm.bytecode.object,owner).deploy(token,quote.target,hook,100000000n);await promo.waitForDeployment();}
  const policy=await factory.getLaunchFeePolicy(token),anchor=await provider.getBlock('latest');
  const m={schema:L.SCHEMA,routeVersion:L.ID,chainId:4663,quoteDecimals:6,entryThresholdRaw:'100000000',eligibility:'automatic-buy-v1',quoteBasis:'wallet-net-debit-v1',anchor:{number:anchor.number,hash:anchor.hash},factory:factory.target,hook,token,curve:curve.target,quote:quote.target,registry:registry.target,codeHashes:{},batchExecutor:B.EXECUTOR,hookFeeBps:Number(policy[3]),creatorTaxBps:300};
  for(const [k,[address,hash]]of Object.entries({...V.PINS,...B.PINS})){m[k]=address;m.codeHashes[k]=hash;}
  m.codeHashes.batchExecutor=B.EXECUTOR_HASH;
  for(const k of L.FIELDS){const hash=E.keccak256(await provider.getCode(m[k]));if(m.codeHashes[k])assert.equal(hash,m.codeHashes[k],'Runtime drift '+k);else m.codeHashes[k]=hash;}
  m.poolKey=[...[token,quote.target].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1),String(record.poolFee),String(record.tickSpacing),hook];m.poolId=V.poolId(m.poolKey);L.validate(m);await L.validateBindings(m,rpc,'latest');
  await rpc('hardhat_stopImpersonatingAccount',[account]);
  const nonce=Number(BigInt(await rpc('eth_getTransactionCount',[account,'latest']))),head=await rpc('eth_getBlockByNumber',['latest',false]);
  const authorization=await signer.authorize({address:B.EXECUTOR,chainId:4663,nonce:nonce+1});
  const raw=await signer.signTransaction({type:4,chainId:4663,nonce,to:account,data:'0x',value:0,gasLimit:200000n,maxFeePerGas:BigInt(head.baseFeePerGas)*2n+1000000000n,maxPriorityFeePerGas:1000000000n,authorizationList:[authorization]});
  const hash=await rpc('eth_sendRawTransaction',[raw]);out.authorization={tx:await rpc('eth_getTransactionByHash',[hash]),receipt:await rpc('eth_getTransactionReceipt',[hash])};assert.equal(out.authorization.receipt.status,'0x1');assert.equal(await rpc('eth_getCode',[account,'latest']),'0xef0100'+B.EXECUTOR.slice(2));
  await rpc('hardhat_impersonateAccount',[account]);console.log('pool and delegation ready');save();
  out.terminal=await require('./pons-pool-terminal-rehearsal.cjs').run({rpc,manifest:m,owner,provider,prefix:file,afterScenario:promo?row=>require('./pons-pool-batch-rehearsal.cjs').verify({rpc,provider,owner,manifest:m,promo,artifacts,prefix:file,row}):undefined});out.status=out.terminal.status;
 }catch(e){out.status='FAILED';out.error=e.message;process.exitCode=1;}
 finally{if(heartbeat)clearInterval(heartbeat);out.proxyStats=proxy?.stats;save();proxy?.close();remote?.destroy();console.log(out.status,out.error||'');}
})();
