// In-process Hardhat only. Remote RPC is behind a read-only allowlist.
process.env.HARDHAT_CONFIG=require.resolve('../test/fixtures/public-hardhat.config.cjs');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process'),{ethers}=require('ethers'),hre=require('hardhat');
const {startReadProxy}=require('./read-only-fork-rpc.cjs'),I=require('./infinity-buy.cjs');
const {hash}=require('./direct-buy.cjs'),{initialAdapters}=require('./buy-policy-format.cjs');
const {replayAttempts}=require('./attempt-lifecycle.cjs');
const rpc=(method,params=[])=>hre.network.provider.send(method,params);
const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n';
function baseForDebit(target){
 target=BigInt(target);const base=target*10000n/10330n;
 for(let b=base-3n;b<=base+4n;b++)if(b>0n&&b+b*300n/10000n+b*30n/10000n===target)return b;
 throw Error('Requested debit is not exactly representable');
}
async function main(){
 const output=process.argv[2];assert(output&&!fs.existsSync(output),'New output file required');
 const directory=fs.mkdtempSync(path.resolve('.local/logs/kt1-'));
 const out={schema:'kt1-same-chain-buy-v1',status:'RUNNING',publicSends:false,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),node:process.version,assumptions:['Hardhat in-process chain4663, NOT Robinhood mainnet','Creator impersonated only locally; native and USDG test funding','ArbSys fixture uses EVM block numbers; local finalized tag is not real L2 finality','Draft metadata/protection, no production deployment approval','No time travel or modified prize odds; draw execution belongs to KT3'],transactions:[],directory};
 let proxy,server;
 const stage=s=>{out.stage=s;console.log('KT1: '+s);};
 try{
  stage('compile exact public contracts');const compiled=require('./compile.cjs').compile();
  out.compiler=require('solc').version();out.compiledHash=ethers.keccak256(ethers.toUtf8Bytes(json(compiled)));
  stage('fresh PAIR draft');const draft=await require('./prepare-pair-launch.cjs').prepare();out.draft=draft;assert(draft.results.collector.callPassed&&draft.results.launch.callPassed);
  proxy=await startReadProxy(process.env.RH_FORK_RPC_URL||'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public');
  assert.equal(await rpc('eth_chainId'),'0x1237');await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:Number(BigInt(draft.block.number))}}]);
  assert.equal((await rpc('eth_getBlockByNumber',['latest',false])).hash,draft.block.hash);
  const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
  const sent=async(label,p)=>{const receipt=await(await p).wait();out.transactions.push({label,tx:await rpc('eth_getTransactionByHash',[receipt.hash]),receipt:await rpc('eth_getTransactionReceipt',[receipt.hash])});return receipt;};
  stage('collector and PAIR sequential launch');await rpc('hardhat_impersonateAccount',[draft.owner]);
  for(const [name,request]of Object.entries(draft.requests)){
   const h=await rpc('eth_sendTransaction',[{...request,gas:ethers.toQuantity(BigInt(draft.results[name].gasUnits)*13n/10n),gasPrice:ethers.toQuantity(BigInt(draft.evidence.evidence.source.values.gasPriceWei)*2n)}]);
   const receipt=await rpc('eth_getTransactionReceipt',[h]);assert.equal(receipt.status,'0x1');out.transactions.push({label:name,tx:await rpc('eth_getTransactionByHash',[h]),receipt});
  }
  const source=n=>require('../research/infinity-source-audit/'+n+'.json');
  const hook=new ethers.Contract(source('hook').address,source('hook').abi,provider),hp=await hook.activePolicy(draft.predicted.token);
  assert.equal(hp.mode,1n);assert.equal(hp.feeBps,300n);
  const pairSource=new ethers.Contract(hp.destination,source('creator').abi,provider),cp=await pairSource.currentPolicy();assert.equal(cp.recipient.toLowerCase(),draft.predicted.collector.toLowerCase());
  stage('public controllers and admitted policy before BUY');
  const f=await require('../test/fixtures/public-controllers.cjs').fixture(compiled,{reset:false,quoteAddress:draft.evidence.preview.route.quote,tokenAddress:draft.predicted.token,offset:false,launchRules:true});
  const {short,monthly,vault,registry,admin,deploy}=f;
  const creator=await provider.getSigner(draft.owner),collector=new ethers.Contract(draft.predicted.collector,compiled.InfinityCollector.abi,creator);
  await rpc('hardhat_setBalance',[draft.owner,ethers.toQuantity(ethers.parseEther('1'))]);
  const now=(await provider.getBlock('latest')).timestamp,operations=await(await provider.getSigner(4)).getAddress();
  await sent('bind collector 90/5/5',collector.bindSource(hp.destination,[now+30*86400,[vault.target,operations,draft.owner],[9000,500,500]]));
  const manager=await hook.poolManager(),parameters=ethers.zeroPadValue(ethers.toBeHex((200n<<16n)|await hook.getHooksRegistrationBitmap()),32);
  const key=[draft.predicted.token,draft.evidence.preview.route.quote,hook.target,manager,10000,parameters],poolId=await hook.poolId(key);
  const anchor=await provider.getBlock('latest');
  const manifest={schema:I.SCHEMA,routeVersion:I.ID,eligibility:'automatic-buy-v1',quoteBasis:'wallet-net-debit-v1',chainId:4663,token:key[0],quote:key[1],registry:registry.target,settlement:'0x4f922d5b15e6691e0469663e4f5c4177f23c5faf',poolKey:key,poolId,quoteDecimals:6,entryThresholdRaw:'100000000',anchor:{number:anchor.number,hash:anchor.hash},codeHashes:{}};
  for(const[k,[a]]of Object.entries(I.PINS))manifest[k]=a;
  for(const k of ['router','manager','hook','token','quote','registry','settlement'])manifest.codeHashes[k]=ethers.keccak256(await provider.getCode(manifest[k]));I.validate(manifest);
  const code=async c=>ethers.keccak256(await provider.getCode(c.target)),sg=await short.shortEpochPolicy(1),mg=await monthly.monthlyEpochPolicy(1);
  const lifecycle={schema:'attempt-lifecycle-v4',source:short.target,sourceCodeHash:await code(short),instanceId:await short.datasetInstance(),monthlySource:monthly.target,monthlySourceCodeHash:await code(monthly),monthlyInstanceId:await monthly.monthlyInstance(),vault:vault.target,vaultCodeHash:await code(vault),shortRules:{rulesHash:sg.hash,noticeSeconds:String(await short.shortRulesNotice()),startedAt:String(await short.shortRulesStartedAt()),firstBlock:String(sg.firstBlock)},monthlyPolicy:{rulesHash:mg.hash,interval:String(await monthly.monthlyInterval()),startedAt:String(await monthly.monthlyStartedAt())},monthlyRules:{noticeSeconds:String(await monthly.monthlyRulesNotice()),firstBlock:String(mg.firstBlock)}};
  const policy=await deploy('BuyPolicySource',[lifecycle.instanceId,hash(manifest),f.owner,2,initialAdapters(manifest)]);
  const config={manifest,lifecycle,buyPolicy:{chainId:4663,instanceId:lifecycle.instanceId,source:policy.target,publisher:f.owner,genesisHash:hash(manifest),noticeBlocks:2,sourceCodeHash:await code(policy)},indexer:{statePath:path.join(directory,'state.json'),maxAgeSeconds:3600},publicStatus:true};
  out.config=config;out.configHash=hash(config);fs.writeFileSync(path.join(directory,'config.json'),json(config));
  const erc=['function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)','function transfer(address,uint256) returns(bool)'];
  const quote=new ethers.Contract(manifest.quote,erc,admin),token=new ethers.Contract(manifest.token,erc,admin),adapter=new ethers.Contract(manifest.router,source('adapter').abi,admin);
  const a=await provider.getSigner(2),b=await provider.getSigner(3),wa=await a.getAddress(),wb=await b.getAddress();out.wallets={a:wa,b:wb};
  async function fund(wallet){
   const trace=await rpc('debug_traceCall',[{to:quote.target,data:quote.interface.encodeFunctionData('balanceOf',[wallet])},'latest',{}]);
   for(const slot of [...new Set(trace.structLogs.filter(l=>l.op==='SLOAD').map(l=>'0x'+l.stack.at(-1)))]){
    const snap=await rpc('evm_snapshot');await rpc('hardhat_setStorageAt',[quote.target,slot,ethers.zeroPadValue(ethers.toBeHex(1000_000000n),32)]);
    if(await quote.balanceOf(wallet)===1000_000000n){out.funding??=[];out.funding.push({wallet,slot,raw:'1000000000'});return;}await rpc('evm_revert',[snap]);
   }throw Error('USDG fixture balance slot not found');
  }
  stage('real BUY 101 and 60+40 with refund');await fund(wa);await fund(wb);
  async function buy(signer,net,refund=0n){
   const w=await signer.getAddress(),base=baseForDebit(net),maximum=BigInt(net)+refund,deadline=BigInt((await provider.getBlock('latest')).timestamp)+1200n;
   await sent('approve '+net,quote.connect(signer).approve(adapter.target,maximum));
   const args=[key,false,base,maximum,1,w,w,deadline,'0x'];
   const expected=await adapter.connect(signer).executeExactInput.staticCall(...args);assert(expected>0n);args[4]=expected*99n/100n;
   const before=await quote.balanceOf(w),receipt=await sent('BUY '+net,adapter.connect(signer).executeExactInput(...args,{gasLimit:4000000}));
   assert.equal(before-await quote.balanceOf(w),BigInt(net));out.buys??=[];out.buys.push({wallet:w,net:String(net),refund:String(refund),hash:receipt.hash});
  }
  await buy(a,101_000000n,7_000000n);await buy(b,60_000000n);await buy(b,40_000000n);
  stage('SELL, transfer and unsupported forwarding route');
  const amount=await token.balanceOf(wa);await sent('approve SELL',token.connect(a).approve(adapter.target,amount));
  const sellArgs=[key,true,amount,amount,1,wa,wa,BigInt((await provider.getBlock('latest')).timestamp)+1200n,'0x'];sellArgs[4]=(await adapter.connect(a).executeExactInput.staticCall(...sellArgs))*99n/100n;
  await sent('SELL',adapter.connect(a).executeExactInput(...sellArgs,{gasLimit:4000000}));await sent('plain TOKEN transfer',token.connect(b).transfer(wa,1));
  const forwarder=await deploy('UnsupportedBuyForwarder');await fund(forwarder.target);
  const unsupported=adapter.interface.encodeFunctionData('executeExactInput',[key,false,baseForDebit(101_000000n),101_000000n,1,forwarder.target,wa,BigInt((await provider.getBlock('latest')).timestamp)+1200n,'0x']);
  await sent('unsupported forwarding BUY',forwarder.run(quote.target,adapter.target,101_000000n,unsupported,{gasLimit:4000000}));
  // Read-only HTTP bridge to this in-process fork; no upstream writes and no signer API.
  const allowed=new Set(['eth_chainId','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_call','eth_getLogs','eth_getTransactionReceipt','eth_getTransactionByHash']);
  server=http.createServer(async(req,res)=>{try{let body='';for await(const chunk of req)body+=chunk;const q=JSON.parse(body);assert(allowed.has(q.method),'Read-only bridge');const result=await rpc(q.method,q.params);res.end(json({jsonrpc:'2.0',id:q.id,result}));}catch(e){res.end(json({jsonrpc:'2.0',id:null,error:{code:-32000,message:e.message}}));}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
  async function indexProcess(){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/persistent-buy-indexer.cjs',path.join(directory,'config.json'),config.indexer.statePath,'once'],{env:{...process.env,RH_RPC_URL:url},windowsHide:true});let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);child.on('error',reject);child.on('exit',code=>{out.processes??=[];out.processes.push({pid:child.pid,code,log});code===0?resolve():reject(Error('Indexer child failed: '+log));});});}
  stage('indexer child then fresh process with same state');await indexProcess();const first=JSON.parse(fs.readFileSync(config.indexer.statePath));assert.equal(first.status.state,'caughtUp');
  await indexProcess();const second=JSON.parse(fs.readFileSync(config.indexer.statePath));assert.equal(second.index.ledgerHash,first.index.ledgerHash);assert.equal(second.index.policyStatus.mode,'admitted');
  const ledger=replayAttempts(second.index.manifest,lifecycle,second.index.blocks);
  for(const [w,carry]of [[wa,'1000000'],[wb,'0']]){const row=ledger.wallets.find(r=>r.wallet===w.toLowerCase());assert(row);assert.equal(row.SHORT.open,'1');assert.equal(row.MONTHLY.open,'1');assert.equal(ledger.buyLedger.wallets.find(r=>r.wallet===w.toLowerCase()).carryRaw,carry);}
  assert.equal(ledger.wallets.length,2);assert.deepEqual(ledger.buyLedger.registrations,[]);
  const decisions=ledger.buyLedger.decisions;assert.equal(decisions.filter(d=>d.status==='ELIGIBLE').length,3);assert(decisions.some(d=>d.reason==='SELL'));assert(decisions.some(d=>d.reason==='NOT_DIRECT_ADAPTER_CALL'));
  for(const buy of out.buys){const d=decisions.find(d=>d.transactionHash===buy.hash);assert.equal(d.netQuoteDebitRaw,buy.net);assert.equal(d.refundQuoteRaw,buy.refund);}
  assert(manifest.anchor.number<Number(BigInt(out.transactions.find(t=>t.label==='BUY 101000000').receipt.blockNumber)));
  out.ledger=ledger;out.snapshotHash=hash(second.index);out.policyStatus=second.index.policyStatus;out.proxyStats=proxy.stats;out.status='PASS';stage('PASS');
 }catch(e){out.status=e.code==='LAUNCH_PREFLIGHT_BLOCKED'||/RPC|endpoint|fetch|timeout|historical|recent blocks|missing trie|PAIR read failed/i.test(e.message)?'BLOCKED':'FAIL';out.error=e.stack;if(e.evidence)out.preflight=e.evidence;process.exitCode=1;console.error(out.error);}
 finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(proxy)proxy.close();fs.writeFileSync(output,json(out),{flag:'wx'});}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={baseForDebit};
