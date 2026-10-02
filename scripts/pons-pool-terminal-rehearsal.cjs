// Instrumented, hash-pinned Pons frontend functions against an in-process fork.
// No connected extension. Only read-only quote APIs may reach public services.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const E=require('ethers'),{chromium}=require('@playwright/test');
const V=require('./pons-v4-buy.cjs'),D=require('./direct-buy.cjs');
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const encode=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='bigint'?{$bigint:String(v)}:v));
async function run({rpc,manifest,owner,provider,prefix,afterScenario}){
 await rpc('hardhat_metadata'); // Refuse a normal public provider before any mutation.
 const source=require('../docs/evidence/PONS_CHANNEL_DISCOVERY_2026-10-02.json');
 const cache='.local/logs/pons-terminal-sources',sources=new Map();
 await Promise.all(source.chunks.map(async row=>{
  const response=await fetch(row.url,{signal:AbortSignal.timeout(20000)});assert(response.ok,'Source HTTP '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(digest(bytes),row.sha256,'Pons source drift '+row.url);
  sources.set(new URL(row.url).pathname,bytes.toString());fs.writeFileSync(cache+'/'+new URL(row.url).pathname.split('/').pop(),bytes);
 }));
 const result={schema:'pons-pool-terminal-rehearsal-v1',status:'RUNNING',publicSends:false,sourceHashes:source.chunks,manifest,scenarios:[],api:[],limits:['Original exported frontend functions, not click-through UI or installed MetaMask','Fresh locally launched/graduated USDG market; synthetic balances','Local signed type2 self-batch with previously authorized pinned executor','Funding API quote is live, not pinned to the local fork block','0x probes use existing public markets, not the unindexed local test token']};
 const save=()=>fs.writeFileSync(prefix+'.terminal.json',JSON.stringify(result,null,2));
 const browser=await chromium.launch({headless:true});let base;
 try{
  const page=await browser.newPage();let currentReads=[];
  await page.exposeFunction('poolRead',async q=>{
   const abi=new E.Interface(q.abi),data=abi.encodeFunctionData(q.functionName,q.args||[]);
   const raw=await rpc('eth_call',[{to:q.address,data},'latest']);
   currentReads.push({to:q.address,data,result:raw});const values=abi.decodeFunctionResult(q.functionName,raw);
   return encode(values.length===1?values[0]:Array.from(values));
  });
  await page.addInitScript(()=>{globalThis.__exports={};globalThis.__captureExport=(e,a,...rest)=>{for(let i=0;i<a.length;i+=3)if(a[i+1]===0)globalThis.__exports[a[i]]=a[i+2];return e.s(a,...rest);};});
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(!['GET','HEAD','OPTIONS'].includes(req.method())){
    if(req.method()==='POST'&&u.origin==='https://www.ponsfamily.com'&&['/api/pons-asset-route','/api/zeroex-swap'].includes(u.pathname))return route.continue();
    return route.abort();
   }
   if(u.pathname.endsWith('.js')){
    if(!sources.has(u.pathname))return route.abort();
    return route.fulfill({contentType:'application/javascript',body:sources.get(u.pathname).replaceAll('e.s([','globalThis.__captureExport(e,[')});
   }
   return route.continue();
  });
  await page.goto('https://www.ponsfamily.com/launchpad/0xa84d0Caa63d1A92FD0c5B237EE9Bc322E38d1DDf',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>typeof __exports?.buildPonsV2TradePlan==='function');
  const quote=new E.Contract(manifest.quote,['function approve(address,uint256) returns(bool)'],owner);
  const permit=new E.Contract(manifest.permit2,['function approve(address,address,uint160,uint48)'],owner);
  await (await quote.approve(manifest.permit2,0)).wait();await(await permit.approve(manifest.quote,manifest.router,0,0)).wait();
  base=await rpc('evm_snapshot');
  for(const pay of ['USDG','ETH'])for(const mode of ['sequential','batch']){
   console.log('terminal scenario',pay,mode);
   await rpc('evm_revert',[base]);base=await rpc('evm_snapshot');currentReads=[];
   const row={pay,mode,status:'RUNNING',steps:[]};result.scenarios.push(row);
   try{
    const [currency0,currency1,fee,tickSpacing,hooks]=manifest.poolKey;
    row.capture=await page.evaluate(async({m,account,pay,poolKey})=>{
     const revive=v=>v&&v.$bigint?BigInt(v.$bigint):Array.isArray(v)?v.map(revive):v;
     const client={readContract:async q=>revive(await window.poolRead(JSON.parse(JSON.stringify(q,(_,v)=>typeof v==='bigint'?String(v):v))))};
     client.simulateContract=async q=>({result:await client.readContract(q)});
     client.multicall=({contracts})=>Promise.all(contracts.map(q=>client.readContract(q)));
     const X=__exports,quoteAsset={address:m.quote,decimals:6,symbol:'USDG',isNative:false};
     const details={token:m.token,curve:m.curve,venue:'pool',quoteAsset,poolKey};let amountIn=101000000n,calls=[],funding=null;
     if(pay==='ETH'){
      const payAsset={address:null,symbol:'ETH',quoteAsset:{address:'0x0000000000000000000000000000000000000000',isNative:true,decimals:18,symbol:'ETH'}};
      const nativeAmount=1000000000000000n;
      funding=await X.quotePonsV2Funding({payAsset,quoteAsset,amountIn:nativeAmount,slippageBps:100});
      if(!funding)throw Error('ETH funding quote unavailable');
      calls.push(...X.buildPonsV2FundingCalls({funding,payAsset,quoteAsset,account,amountIn:nativeAmount}));amountIn=funding.minOut;
     }
     const trade=await X.buildPonsV2TradePlan({client,details,account,side:'buy',amountIn,slippageBps:100});
     if(!trade)throw Error('No pool plan');calls.push(...trade.calls);
     const dispatch=[];
     const wallet={account:{address:account,type:'json-rpc'},getChainId:async()=>4663,sendCalls:async q=>{dispatch.push({method:'sendCalls',calls:q.calls});throw Object.assign(Error('Captured only'),{code:4001});},sendTransaction:async q=>{dispatch.push({method:'sendTransaction',...q});throw Object.assign(Error('Captured only'),{code:4001});}};
     try{await X.sendWalletCallBundle({walletClient:wallet,chain:{id:4663},calls});}catch(e){if(e.code!==4001)throw e;}
     return JSON.parse(JSON.stringify({details,funding,trade,calls,dispatch,amountIn},(_,v)=>typeof v==='bigint'?String(v):v));
    },{m:manifest,account:owner.address,pay,poolKey:{currency0,currency1,fee:Number(fee),tickSpacing:Number(tickSpacing),hooks}});
    row.reads=currentReads;save();
    const calls=row.capture.calls;
    if(mode==='sequential'){
     for(const call of calls){const sent=await owner.sendTransaction({to:call.to,data:call.data,value:BigInt(call.value||0),gasLimit:7000000});await sent.wait();row.steps.push({tx:await rpc('eth_getTransactionByHash',[sent.hash]),receipt:await rpc('eth_getTransactionReceipt',[sent.hash])});}
    }else{
     const signer=new E.Wallet(require('./pons-launch-rehearsal.cjs').KEY);assert.equal(signer.address,owner.address);
     const iface=new E.Interface(['function execute(bytes32,bytes) payable']);
     const data=iface.encodeFunctionData('execute',['0x01'+'00'.repeat(31),E.AbiCoder.defaultAbiCoder().encode(['tuple(address,uint256,bytes)[]'],[calls.map(c=>[c.to,BigInt(c.value||0),c.data])])]);
     const nonce=Number(BigInt(await rpc('eth_getTransactionCount',[owner.address,'latest']))),head=await rpc('eth_getBlockByNumber',['latest',false]);
     await rpc('hardhat_stopImpersonatingAccount',[owner.address]);
     try{
      const raw=await signer.signTransaction({type:2,chainId:4663,nonce,to:owner.address,data,value:0,gasLimit:12000000n,maxFeePerGas:BigInt(head.baseFeePerGas)*2n+1000000000n,maxPriorityFeePerGas:1000000000n});
      const hash=await rpc('eth_sendRawTransaction',[raw]);row.steps.push({tx:await rpc('eth_getTransactionByHash',[hash]),receipt:await rpc('eth_getTransactionReceipt',[hash])});
     }finally{await rpc('hardhat_impersonateAccount',[owner.address]);}
    }
    assert(row.steps.every(s=>s.receipt.status==='0x1'));
    if(mode==='batch'){
     const tx=row.steps[0].tx,header=await rpc('eth_getBlockByNumber',[tx.blockNumber,true]);
     row.blockContext={...header,transactions:header.transactions.map(tx=>({tx})),batchAccounts:{[tx.from.toLowerCase()]:{parentHash:header.parentHash,code:await rpc('eth_getCode',[tx.from,E.toQuantity(BigInt(tx.blockNumber)-1n)])}}};
    }
    row.decisions=row.steps.flatMap(s=>D.decodeTransaction(manifest,s.tx,s.receipt,row.blockContext));
    assert.equal(row.decisions.length,1,'Expected exactly one target pool BUY');
    const d=row.decisions[0];assert.equal(d.status,mode==='sequential'||manifest.schema===require('./pons-pool-batch-buy.cjs').SCHEMA?'ELIGIBLE':'UNSUPPORTED_ROUTE');
    if(mode==='sequential')assert.equal(d.netQuoteDebitRaw,row.capture.amountIn);
    if(afterScenario)row.indexApi=await afterScenario(row);
    row.status='EXECUTION_VERIFIED';
   }catch(e){row.status='FAILED';row.error=e.shortMessage||e.message;row.reads=currentReads;}
   save();
  }
  // Probe a real existing pair as well as RDH: local test-token absence must not
  // be mistaken for a globally unavailable aggregator.
  result.api=await page.evaluate(async quote=>{
   const out=[];for(const buyToken of ['0xa84d0Caa63d1A92FD0c5B237EE9Bc322E38d1DDf','0x0bd7d308f8e1639fab988df18a8011f41eacad73']){
    const body={sellToken:quote,buyToken,sellAmountWei:'101000000',slippageBps:100};
    try{const response=await fetch('/api/zeroex-swap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});out.push({body,status:response.status,response:await response.json()});}catch(e){out.push({body,error:e.message});}
   }return out;
  },manifest.quote);
  result.status=result.scenarios.every(s=>s.status==='EXECUTION_VERIFIED')?'PONS_POOL_TERMINAL_MATRIX_PASSED':'PONS_POOL_TERMINAL_MATRIX_INCOMPLETE';
  return result;
 }catch(e){result.status='FAILED';result.error=e.message;throw e;}
 finally{if(base)await rpc('evm_revert',[base]);save();await browser.close();}
}
module.exports={run};
