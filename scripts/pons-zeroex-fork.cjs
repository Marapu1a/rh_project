// Read-only public quotes, execution exclusively in this process's Hardhat fork.
process.env.HARDHAT_CONFIG=require.resolve('../test/fixtures/pons-7702-hardhat.config.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),E=require('ethers'),hre=require('hardhat');
const {startReadProxy}=require('./read-only-fork-rpc.cjs');
const USDG='0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',RDH='0xa84d0Caa63d1A92FD0c5B237EE9Bc322E38d1DDf',WETH='0x0bd7d308f8e1639fab988df18a8011f41eacad73';
const HOLDER='0x0000000000001ff3684f28c67538d4d072c22734';
const allowance=new E.Interface(['function exec(address operator,address token,uint256 amount,address target,bytes data) payable returns(bytes)']);
const settler=new E.Interface(['function execute((address recipient,address buyToken,uint256 minAmountOut) slippage,bytes[] actions,bytes32 zid) payable returns(bool)']);
const erc=new E.Interface(['function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)','event Transfer(address indexed from,address indexed to,uint256 value)']);
async function main(){
 const file=process.argv[2];assert(file&&!fs.existsSync(file),'Supply a new report path');
 const result={schema:'pons-zeroex-execution-v1',observedAt:new Date().toISOString(),status:'RUNNING',publicSends:false,scenarios:[],limits:['Synthetic USDG/ETH balances on in-process Hardhat fork','Impersonated test taker; no wallet UI','Live Pons quotes; existing public markets, not QIANQI','No new eligibility adapter or production admission']};
 const save=()=>fs.writeFileSync(file,JSON.stringify(result,(_,v)=>typeof v==='bigint'?String(v):v,2));
 const rpc=(m,p=[])=>hre.network.provider.send(m,p);let proxy,remote;
 try{
  const taker=new E.Wallet(require('./pons-launch-rehearsal.cjs').KEY).address;
  const tokenArg=process.argv.indexOf('--token');const selected=tokenArg<0?null:process.argv[tokenArg+1];
  assert(tokenArg<0||E.isAddress(selected),'Invalid --token');
  const targets=selected?[selected]:process.argv.includes('--pool')?['0xeDBf91223639800BCd5756815CAf908Df3b890bE']:[RDH,WETH];
  for(const buyToken of targets){
   const row={status:'RUNNING',body:{sellToken:USDG,buyToken,sellAmountWei:'101000000',slippageBps:100,taker,intent:'quote'}};result.scenarios.push(row);
   const response=await fetch('https://www.ponsfamily.com/api/zeroex-swap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row.body),signal:AbortSignal.timeout(20000)});
   row.httpStatus=response.status;row.response=await response.json();assert(response.ok&&row.response.quote,'No quote');save();
   const q=row.response.quote;assert.equal(q.allowanceTarget.toLowerCase(),HOLDER);assert.equal(q.transaction.to.toLowerCase(),HOLDER);
   const outer=allowance.parseTransaction(q.transaction),inner=settler.parseTransaction({data:outer.args.data});
   assert.equal(outer.args.token.toLowerCase(),USDG.toLowerCase());assert.equal(outer.args.amount,101000000n);assert.equal(outer.args.operator,outer.args.target);
   assert.equal(inner.args.slippage.recipient.toLowerCase(),taker.toLowerCase());assert.equal(inner.args.slippage.buyToken.toLowerCase(),buyToken.toLowerCase());assert(inner.args.slippage.minAmountOut>0n);
   row.decoded={operator:outer.args.operator,target:outer.args.target,sellAmount:String(outer.args.amount),recipient:inner.args.slippage.recipient,buyToken:inner.args.slippage.buyToken,minAmountOut:String(inner.args.slippage.minAmountOut),actions:Array.from(inner.args.actions),zid:inner.args.zid};
   remote=new E.JsonRpcProvider(process.env.RH_FORK_RPC_URL||'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public',4663,{batchMaxCount:1});const block=await remote.getBlock('latest');row.anchor={number:block.number,hash:block.hash};remote.destroy();remote=null;
   proxy=await startReadProxy(process.env.RH_FORK_RPC_URL||'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public');
   await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:block.number}}]);const meta=await rpc('hardhat_metadata');assert.equal(Number(meta.forkedNetwork.chainId),4663);assert.equal((await rpc('eth_getBlockByNumber',['latest',false])).hash,block.hash);
   await rpc('evm_mine'); // Execute on a local block with the configured Prague VM.
   const provider=new E.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
   if(buyToken!==WETH){const factory=new E.Contract('0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',require('./integrations/pons-v2.cjs').FAB,provider);const launch=await factory.getLaunchedToken(buyToken),policy=await factory.getLaunchFeePolicy(buyToken);row.venue={factory:factory.target,token:launch.token,curve:launch.curve,quote:launch.pairToken,phase:String(launch.phase),poolFee:String(launch.poolFee),tickSpacing:String(launch.tickSpacing),creatorTaxBps:String(launch.creatorTaxBps),hookFeeBps:String(policy[3]),hook:await factory.memeHook()};}
   const batch=require('./pons-batch-route.cjs');
   row.runtimes={};for(const address of new Set([HOLDER,outer.args.target,USDG,buyToken,batch.EXECUTOR,...Object.values(batch.PINS).map(p=>p[0]),...Object.values(require('./pons-v4-buy.cjs').PINS).map(p=>p[0]),row.venue?.factory,row.venue?.curve,row.venue?.hook].filter(Boolean))){const code=await rpc('eth_getCode',[address,'latest']);row.runtimes[address.toLowerCase()]={code,hash:E.keccak256(code)};}
   await rpc('hardhat_setBalance',[taker,E.toQuantity(E.parseEther('10'))]);await rpc('hardhat_impersonateAccount',[taker]);const owner=new E.JsonRpcSigner(provider,taker),quote=new E.Contract(USDG,erc,owner),token=new E.Contract(buyToken,erc,owner);
   row.runtimeHashes={};for(const address of [HOLDER,outer.args.target,USDG,buyToken]){const code=await provider.getCode(address);assert.notEqual(code,'0x');row.runtimeHashes[address]=E.keccak256(code);}
   const trace=await rpc('debug_traceCall',[{to:USDG,data:erc.encodeFunctionData('balanceOf',[taker])},'latest',{disableMemory:true,disableStorage:true}]);let funded=false;
   for(const slot of new Set(trace.structLogs.filter(x=>x.op==='SLOAD').map(x=>'0x'+x.stack.at(-1)))){
    const snap=await rpc('evm_snapshot');await rpc('hardhat_setStorageAt',[USDG,slot,E.toBeHex(1000000000n,32)]);
    try{if(await quote.balanceOf(taker)===1000000000n){funded=true;break;}}catch{}await rpc('evm_revert',[snap]);
   }assert(funded,'Synthetic USDG balance slot unavailable');
   const capture=async tx=>{const sent=await tx;await sent.wait();return {tx:await rpc('eth_getTransactionByHash',[sent.hash]),receipt:await rpc('eth_getTransactionReceipt',[sent.hash])};};
   await capture(quote.approve(HOLDER,0));
   const request={to:q.transaction.to,data:q.transaction.data,value:BigInt(q.transaction.value||0)};
   try{await owner.estimateGas(request);row.withoutApproval='UNEXPECTED_SUCCESS';}catch(e){row.withoutApproval={code:e.code,message:e.shortMessage||e.message};}assert.equal(row.withoutApproval.code,'CALL_EXCEPTION');
   row.approval=await capture(quote.approve(HOLDER,101000000n));
   row.before={sell:await quote.balanceOf(taker),buy:await token.balanceOf(taker)};
   if(process.argv.includes('--entrypoint'))row.execution=await require('./pons-entrypoint-rehearsal.cjs').execute({rpc,provider,owner,request,capture,row});
   else {row.estimatedGas=await owner.estimateGas(request);row.execution=await capture(owner.sendTransaction({...request,gasLimit:row.estimatedGas*120n/100n}));}
   row.execution.block=await rpc('eth_getBlockByNumber',[row.execution.tx.blockNumber,false]);
   row.after={sell:await quote.balanceOf(taker),buy:await token.balanceOf(taker)};
   row.transfers=row.execution.receipt.logs.filter(l=>l.topics[0]===erc.getEvent('Transfer').topicHash&&l.topics.length===3).map(l=>{const e=erc.parseLog(l);return {token:l.address,from:e.args.from,to:e.args.to,value:String(e.args.value),logIndex:l.logIndex};});
   assert.equal(row.before.sell-row.after.sell,101000000n);assert(row.after.buy-row.before.buy>=inner.args.slippage.minAmountOut);
   row.status='EXECUTED';row.proxyStats={...proxy.stats};save();console.log(buyToken,row.status,'gas',row.execution.receipt.gasUsed);proxy.close();proxy=null;
  }
  result.status='PONS_ZEROEX_EXECUTED';
 }catch(e){result.status='FAILED';result.error=e.shortMessage||e.message;process.exitCode=1;}
 finally{save();proxy?.close();remote?.destroy();console.log(result.status,result.error||'');}
}
if(require.main===module)main();
