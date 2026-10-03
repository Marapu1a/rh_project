// Research-only. All writes target in-process Hardhat; upstream proxy is read-only.
process.env.HARDHAT_CONFIG=require.resolve(process.argv.includes('--combined-profile')?'../test/fixtures/pons-7702-hardhat.config.cjs':process.argv.includes('--wallet-browser')?'../test/fixtures/pons-wallet-cycle-hardhat.config.cjs':'../test/fixtures/public-hardhat.config.cjs');
if(process.argv.includes('--combined-profile')&&!process.argv.includes('--v4'))process.argv.push('--v4');
if(process.argv.includes('--indexed-automation')&&!process.argv.includes('--automation'))process.argv.push('--automation');
if(process.argv.includes('--policy-indexer')&&!process.argv.includes('--persistent-indexer'))process.argv.push('--persistent-indexer');
if(process.argv.includes('--persistent-indexer')&&!process.argv.includes('--v4'))process.argv.push('--v4');
if(process.argv.includes('--browser-purchase')&&!process.argv.includes('--direct-purchase'))process.argv.push('--direct-purchase');
if(process.argv.includes('--direct-purchase')&&!process.argv.includes('--v4'))process.argv.push('--v4');
if(process.argv.includes('--automation')&&!process.argv.includes('--cycle'))process.argv.push('--cycle');
if(process.argv.includes('--cycle')&&!process.argv.includes('--v4'))process.argv.push('--v4');
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers'),hre=require('hardhat'),solc=require('solc');
const {startReadProxy}=require('./read-only-fork-rpc.cjs');
const FACTORY='0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',USDG='0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',OWNER=process.argv.includes('--combined-profile')?new ethers.Wallet(require('./pons-launch-rehearsal.cjs').KEY).address:'0x098afA6731239a00CE0aff669aaefD16b7C72114';
const { FAB, ERC, CUR } = require('./integrations/pons-v2.cjs');
const {swapHelper}=require('./pons-fork-rehearsal.cjs');
const cycleHarness=require('./pons-promo-cycle.cjs');
const compiled=process.argv.includes('--cycle')?cycleHarness.compileFixture():require('./compile.cjs').compile();
const {inspect,executeLocal}=require('./pons-collector-manual.cjs');
const P=require('./pons-curve-buy.cjs'),D=require('./direct-buy.cjs');
const V4=require('./pons-v4-buy.cjs');
const {scanWithRpc}=require('./replay-direct-buy.cjs'),{replayAttempts}=require('./attempt-lifecycle.cjs');
async function main(){
 const file=process.argv[2];assert(file&&!fs.existsSync(file),'Supply new output filename');
 const out={schema:'pons-collector-fork-v1',status:'RUNNING',publicSends:false,assumptions:['Local impersonation and synthetic USDG funding only','LocalPonsCollector prototype and real PromoVault; controller is unused hook address, no draws tested','ABI from current Pons docs/repository, runtime source equivalence not yet proved','No BUY indexer or ticket/draw qualification'],steps:[]};let proxy,remote,browserPurchase;
 const rpc=(m,p=[])=>hre.network.provider.send(m,p);const save=()=>fs.writeFileSync(file,JSON.stringify(out,(_,v)=>typeof v==='bigint'?v.toString():v,2));
 try{
 remote=new ethers.JsonRpcProvider('https://rpc.mainnet.chain.robinhood.com');const latest=await remote.getBlock('latest'),block=await remote.getBlock(latest.number-10);out.anchor={number:block.number,hash:block.hash};
 proxy=await startReadProxy(process.env.RH_FORK_RPC_URL||(process.argv.includes('--cycle')?'https://rpc.mainnet.chain.robinhood.com':'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public'));
 if(process.argv.includes('--automation')){
  // Proof retention is shorter than ordinary state retention. Snapshot before setup.
  const nonce=await remote.getTransactionCount(OWNER,block.number);out.emptyBaseStorage=[];
  for(let i=0;i<9;i++)out.emptyBaseStorage.push(await proxy.pinEmptyStorage(ethers.getCreateAddress({from:OWNER,nonce:nonce+i}),block.number));
  out.assumptions.push('RPC account proofs pin empty base storage for local owner CREATE addresses at the fixed fork block; EDR writes remain unchanged');save();
 }
 console.log('fork at',block.number);await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:block.number}}]);
 assert.equal((await rpc('eth_getBlockByNumber',['latest',false])).hash,block.hash);await rpc('evm_mine');
 const p=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});await rpc('hardhat_impersonateAccount',[OWNER]);await rpc('hardhat_setBalance',[OWNER,ethers.toQuantity(ethers.parseEther('10'))]);const owner=new ethers.JsonRpcSigner(p,OWNER),factory=new ethers.Contract(FACTORY,FAB,owner),quote=new ethers.Contract(USDG,ERC,owner);
 assert(await factory.canLaunch(OWNER));assert(await factory.approvedPairTokens(USDG));assert.equal(await quote.decimals(),6n);
 const hook=await factory.memeHook(),escrow=await factory.feeEscrow();out.graph={factory:FACTORY,hook,escrow};out.codeHashes={};for(const a of [FACTORY,hook,escrow,USDG])out.codeHashes[a]=ethers.keccak256(await p.getCode(a));
 out.economics={pair:Array.from(await factory.pairTokenEconomics(USDG)),snipeSeconds:await factory.snipeTaxSeconds(),pin:await factory.previewLaunchEconomics(0,USDG),launchFee:await factory.launchFee()};save();
 const destinations=await Promise.all([1,2].map(async i=>(await p.getSigner(i)).getAddress()));
 const predictedCollector=ethers.getCreateAddress({from:OWNER,nonce:await p.getTransactionCount(OWNER)});
 const params=['QIANQI TEST','QT','','local collector fork only',['','','','',''],predictedCollector,300,false,out.economics.pin,ethers.id('pons-collector-'+block.hash)];
 const predicted=await factory.launchToken.staticCall(params,0,USDG,{value:out.economics.launchFee,gasLimit:15000000});
 const art=compiled.LocalPonsCollector;
 const collector=await new ethers.ContractFactory(art.abi,art.evm.bytecode.object,owner).deploy(OWNER,predicted[0],USDG,escrow);await collector.waitForDeployment();assert.equal(collector.target,predictedCollector);
 out.collector=collector.target;
 console.log('launch');const launched=await (await factory.launchToken(params,0,USDG,{value:out.economics.launchFee,gasLimit:15000000})).wait();
 const ev=launched.logs.map(l=>{try{return factory.interface.parseLog(l)}catch{return null}}).find(e=>e?.name==='TokenLaunched');assert(ev,'TokenLaunched');out.token=ev.args.token;out.curve=ev.args.curve;out.policy=Array.from(await factory.getLaunchFeePolicy(out.token));
 const curve=new ethers.Contract(out.curve,CUR,owner),token=new ethers.Contract(out.token,ERC,owner),ledger=new ethers.Contract(escrow,['function balanceOfToken(address,address) view returns(uint256)'],p);
 assert.equal(out.token,predicted[0]);out.steps.push({stage:'launch',hash:launched.hash});out.rates={base:await curve.feeBps(),tax:await curve.creatorTaxBps()};assert.equal(out.rates.tax,300n);save();
 async function send(tx,label){const receipt=await (await tx).wait();assert.equal(receipt.status,1);out.steps.push({stage:label,hash:receipt.hash});save();return receipt;}
 let cycle,promo;
 if(process.argv.includes('--cycle')){cycle=await cycleHarness.deploy({compiled,provider:p,user:owner,token:out.token,quote:USDG,rpc});promo=cycle.vault;out.assumptions=out.assumptions.filter(a=>!a.includes('controller is unused'));}
 else{const pa=compiled.PromoVault;promo=await new ethers.ContractFactory(pa.abi,pa.evm.bytecode.object,owner).deploy(out.token,USDG,hook,100_000000n);await promo.waitForDeployment();}
 out.promo=promo.target;
 if(process.argv.includes('--automation')){
  for(const address of [collector.target,...['registry','random','short','monthly','vault'].map(k=>cycle[k].target)])assert(out.emptyBaseStorage.some(p=>p.address===address.toLowerCase()),'Missing empty base snapshot');
 }
 destinations.unshift(promo.target);
 await send(collector.bindPromo([Number((await p.getBlock('latest')).timestamp)+86400,destinations,[9000,500,500]]),'bind promo');
 await send(collector.bindVenue(FACTORY,{gasLimit:3000000}),'bind venue');
 const metadata=await rpc('hardhat_metadata');out.localInstanceId=metadata.instanceId;
 async function manual(action){const receipt=await executeLocal(p,collector.target,OWNER,action,metadata.instanceId);out.steps.push({stage:'manual '+action,...receipt});save();}
 async function fund(amount){const data=quote.interface.encodeFunctionData('balanceOf',[OWNER]);const trace=await rpc('debug_traceCall',[{to:USDG,data},'latest',{disableMemory:true,disableStorage:true}]);for(const slot of [...new Set(trace.structLogs.filter(x=>x.op==='SLOAD').map(x=>'0x'+x.stack.at(-1)))]){const snap=await rpc('evm_snapshot');await rpc('hardhat_setStorageAt',[USDG,slot,ethers.toBeHex(amount,32)]);try{if(await quote.balanceOf(OWNER)===amount){out.syntheticFunding={slot,amount};return;}}catch{}await rpc('evm_revert',[snap]);}throw Error('USDG funding slot not found');}
 await fund(20000_000000n);if(!process.argv.includes('--direct-purchase'))await send(quote.approve(out.curve,ethers.MaxUint256),'approve quote');
 let buyManifest;
 if(process.argv.includes('--buys')||process.argv.includes('--v4')){
  const ra=compiled.ParticipantRegistry,registry=cycle?cycle.registry:await new ethers.ContractFactory(ra.abi,ra.evm.bytecode.object,owner).deploy();await registry.waitForDeployment();
  const anchor=await p.getBlock('latest');
  buyManifest={schema:P.SCHEMA,routeVersion:P.ID,eligibility:'automatic-buy-v1',quoteBasis:'wallet-net-debit-v1',chainId:4663,quoteDecimals:6,entryThresholdRaw:'100000000',anchor:{number:anchor.number,hash:anchor.hash},factory:FACTORY,hook,curve:out.curve,token:out.token,quote:USDG,registry:registry.target,codeHashes:{}};
  for(const k of P.FIELDS)buyManifest.codeHashes[k]=ethers.keccak256(await p.getCode(buyManifest[k]));
  if(process.argv.includes('--v4')){
   const r=await factory.getLaunchedToken(out.token),currencies=[USDG,out.token].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
   Object.assign(buyManifest,{schema:V4.SCHEMA,routeVersion:V4.ID,poolKey:[...currencies,String(r.poolFee),String(r.tickSpacing),hook],hookFeeBps:Number(out.policy[3]),creatorTaxBps:300});
   buyManifest.poolId=V4.poolId(buyManifest.poolKey);
   for(const [k,[a,digest]]of Object.entries(V4.PINS)){buyManifest[k]=a;buyManifest.codeHashes[k]=digest;assert.equal(ethers.keccak256(await p.getCode(a)),digest,'Changed '+k+' runtime');}
  }
  if(process.argv.includes('--combined-profile'))await require('./pons-launch-rehearsal.cjs').configure(buyManifest,p);
  out.assumptions=out.assumptions.filter(a=>!a.startsWith('No BUY indexer'));out.assumptions.push('Direct curve BUY replay plus pinned UR route when --v4; open Short/Monthly accounting, no draw settlement or public admission');
 }
 async function checkBuys(label){
  const data=await scanWithRpc(buyManifest,rpc,await rpc('eth_blockNumber')),ledger=D.replay(buyManifest,data.blocks);
  const attempts=replayAttempts(buyManifest,cycle?cycle.lifecycle:{schema:'attempt-lifecycle-v1',instanceId:ethers.id('pons-fork-open-attempts'),source:promo.target,sourceCodeHash:ethers.keccak256(await p.getCode(promo.target))},data.blocks);
  assert.equal(D.hash(D.replay(buyManifest,[...data.blocks,...data.blocks])),D.hash(ledger));
  out.buyReplay??={};out.buyReplay[label]={...data,ledger,attempts};save();return ledger;
 }
 async function directPurchase(amount){const options={rpc,instanceId:metadata.instanceId,manifest:buyManifest,account:OWNER,amountRaw:String(amount),journal:file+'.browser-journal.json',onSubmitted:step=>{out.directSubmissions??=[];out.directSubmissions.push(step);save();},onStep:step=>{out.directPurchases??=[];out.directPurchases.push(step);save();}};
  if(process.argv.includes('--browser-purchase')){browserPurchase??=await require('./pons-browser-rehearsal.cjs').open(options);return browserPurchase.purchase(amount);}
  return require('./pons-direct-purchase-rehearsal.cjs').purchase(options);}
 const before=await quote.balanceOf(OWNER);
 if(process.argv.includes('--combined-profile')){const expected=await curve.buy.staticCall(101_000000n,0,OWNER);const hash=await require('./pons-launch-rehearsal.cjs').buy({rpc,curve,quote,account:OWNER,expected});out.steps.push({stage:'signed type4 curve batch101',hash});save();}
 else if(process.argv.includes('--direct-purchase'))await send(directPurchase(101_000000n),'direct wallet buy101');
 else{const expected=await curve.buy.staticCall(101_000000n,0,OWNER);await send(curve.buy(101_000000n,expected*99n/100n,OWNER,{gasLimit:3000000}),'buy101');}
 assert.equal(before-await quote.balanceOf(OWNER),101_000000n);
 out.buy={debit:101_000000n,tokens:await token.balanceOf(OWNER),baseFee:await curve.quoteFeeBalance(),creatorTax:await curve.creatorTaxBalance()};assert.equal(out.buy.creatorTax,3030000n);
 if(buyManifest){const l=await checkBuys('first');assert.equal(l.wallets[0].entriesMinted,'1');assert.equal(l.wallets[0].carryRaw,'1000000');assert.equal(out.buyReplay.first.attempts.wallets[0].SHORT.open,'1');assert.equal(out.buyReplay.first.attempts.wallets[0].MONTHLY.open,'1');}
 await send(token.approve(out.curve,ethers.MaxUint256),'approve token');const sellAmount=out.buy.tokens/2n,sellQuote=await curve.sell.staticCall(sellAmount,0,OWNER);await send(curve.sell(sellAmount,sellQuote*99n/100n,OWNER,{gasLimit:3000000}),'sell half');
 console.log('sweep and claim');out.beforeSweep={base:await curve.quoteFeeBalance(),tax:await curve.creatorTaxBalance()};await send(collector.sweepCurve({gasLimit:3000000}),'recipient sweep');out.claimable=await ledger.balanceOfToken(collector.target,USDG);assert(out.claimable>0n);assert.equal(out.claimable,out.beforeSweep.base-out.beforeSweep.base*out.policy[1]/10000n+out.beforeSweep.tax);
 const balances=await Promise.all(destinations.map(a=>quote.balanceOf(a)));await manual('pull');for(const a of ['pay-prizes','pay-ops','pay-team'])await manual(a);out.split=await Promise.all(destinations.map(async(a,i)=>(await quote.balanceOf(a))-balances[i]));assert(out.claimable-out.split.reduce((a,b)=>a+b,0n)<3n);assert.equal(out.split[1],out.claimable*500n/10000n);assert.equal(out.split[2],out.split[1]);
 console.log('graduation');if(process.argv.includes('--direct-purchase')||process.argv.includes('--combined-profile'))await send(quote.approve(out.curve,15000_000000n),'approve graduation fixture');await send(curve.buy(15000_000000n,0,OWNER,{gasLimit:16000000}),'threshold buy (test-only zero minOut)');let record=await factory.getLaunchedToken(out.token);if(record.phase===1n){await send(factory.createGraduatedPool(out.token,{gasLimit:16000000}),'finish graduation');record=await factory.getLaunchedToken(out.token);}out.graduation={phase:record.phase,record:Array.from(record)};assert.equal(record.phase,2n);out.status='PRE_GRADUATION_AND_GRADUATION_PASSED';
 console.log('post-graduation explicit v4 swaps');
 if(buyManifest){const l=await checkBuys('graduation'),eligible=l.decisions.filter(d=>d.status==='ELIGIBLE');assert.equal(eligible.length,2);assert(BigInt(eligible[1].refundQuoteRaw)>0n);assert.equal(BigInt(eligible[1].netQuoteDebitRaw)+BigInt(eligible[1].refundQuoteRaw),15000_000000n);assert(l.decisions.some(d=>d.reason==='SELL'));console.log('curve BUY replay passed');}
 const h=new ethers.Contract(hook,['function poolManager() view returns(address)','function feeSweepOperator() view returns(address)','function pendingFees(bytes32,address) view returns(uint256)','function pendingCreatorTax(bytes32,address) view returns(uint256)','function sweepPoolFees(bytes32,uint256,uint256)'],owner);
 const sc=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Swap.sol':{content:swapHelper}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));assert(!sc.errors?.some(e=>e.severity==='error'),JSON.stringify(sc.errors));const sa=sc.contracts['Swap.sol'].ProbeSwap;
 const router=await new ethers.ContractFactory(sa.abi,sa.evm.bytecode.object,owner).deploy(await h.poolManager());await router.waitForDeployment();out.probeRouter=router.target;
 const currencies=[USDG,out.token].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1),key=[...currencies,record.poolFee,record.tickSpacing,hook];const id=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address','address','uint24','int24','address'],key));out.poolId=id;assert.equal(await collector.poolId(),id);
 let trade=(zeroForOne,amount)=>router.trade(key,zeroForOne,amount,{gasLimit:5000000});
 if(process.argv.includes('--v4')){
  assert.equal(buyManifest.poolId,id);
  const permit=new ethers.Contract(buyManifest.permit2,['function approve(address,address,uint160,uint48)'],owner),ur=new ethers.Contract(buyManifest.router,V4.CALL,owner),coder=ethers.AbiCoder.defaultAbiCoder();
  const deadline=Number((await p.getBlock('latest')).timestamp)+86400;
  for(const coin of [quote,token]){if(process.argv.includes('--direct-purchase')&&coin===quote){
   // The real owner may already have approvals on mainnet. Force insufficient
   // and expired LOCAL allowances so the planner must prove its approval path.
   await send(quote.approve(permit.target,1),'fixture insufficient USDG allowance');
   await send(permit.approve(USDG,ur.target,1,0),'fixture expired router allowance');continue;
  }await send(coin.approve(permit.target,ethers.MaxUint256),'approve Permit2 '+coin.target);await send(permit.approve(coin.target,ur.target,(1n<<160n)-1n,deadline),'approve Universal Router '+coin.target);}
  trade=(zeroForOne,amount)=>{
   const input=key[zeroForOne?0:1],output=key[zeroForOne?1:0];
   if(process.argv.includes('--direct-purchase')&&input.toLowerCase()===USDG.toLowerCase())return directPurchase(amount);
   const payload=coder.encode(['bytes','bytes[]'],['0x060b0e',[coder.encode([V4.SPEC],[[key,zeroForOne,amount,1,0,'0x']]),coder.encode(['address','uint256','bool'],[input,0,true]),coder.encode(['address','address','uint256'],[output,OWNER,0])]]);
   return ur.execute('0x10',[payload],deadline,{gasLimit:5000000});
  };
  out.assumptions.push(process.argv.includes('--direct-purchase')?'BUY uses local unsigned planner, exact approvals and simulated 1% minOut; SELL uses fixture minOut=1. Owner USDG/Permit2 allowances deliberately reduced locally to test recovery.':'v4 uses pinned live Universal Router + Permit2; minOut=1 is test-only, no production trade protection claim');
 }
 await send(quote.approve(router.target,ethers.MaxUint256),'approve v4 quote');await send(token.approve(router.target,ethers.MaxUint256),'approve v4 token');
 await send(trade(currencies[0]===out.token,out.buy.tokens/100n),'v4 sell before buy (quote-only fees)');
 await manual('sweep');out.availableBeforeWait=await ledger.balanceOfToken(collector.target,USDG);assert(out.availableBeforeWait>0n);
 const prior=await token.balanceOf(OWNER);await send(trade(currencies[0]===USDG,101_000000n),process.argv.includes('--direct-purchase')?'v4 direct wallet buy101':'v4 buy101 (test-only minimum)');out.postBuy={tokens:(await token.balanceOf(OWNER))-prior,taxToken:await h.pendingCreatorTax(id,out.token),taxUSDG:await h.pendingCreatorTax(id,USDG)};assert(out.postBuy.taxToken>0n);
 if(process.argv.includes('--v4')){
  const l=await checkBuys('v4first'),eligible=l.decisions.filter(d=>d.status==='ELIGIBLE');assert.equal(eligible.length,3,JSON.stringify(l.decisions));assert.equal(eligible[2].netQuoteDebitRaw,'101000000');assert.equal(eligible[2].netTokenOutRaw,String(out.postBuy.tokens));
  for(const amount of [60_000000n,40_000000n])await send(trade(currencies[0]===USDG,amount),'v4 accumulation '+amount);
  const accumulated=await checkBuys('v4accumulated');assert.equal(BigInt(accumulated.wallets[0].entriesMinted)-BigInt(l.wallets[0].entriesMinted),1n);assert.equal(accumulated.wallets[0].carryRaw,l.wallets[0].carryRaw);
 }
 try{await collector.sweepPool.staticCall();throw Error('Expected creator conversion restriction');}catch(e){assert(e.data?.startsWith(ethers.id('AwaitingOperator()').slice(0,10)),e.message);out.creatorConversionBlocked={selector:e.data};}
 out.waitPlan=await inspect(p,collector.target,OWNER);assert.equal(out.waitPlan.actions.sweep.status,'waiting');assert.equal(out.waitPlan.actions.pull.status,'ready');
 const vaultBefore=await quote.balanceOf(promo.target);await manual('pull');await manual('pay-prizes');assert(await quote.balanceOf(promo.target)>vaultBefore);out.claimWhileWaiting=true;
 await send(trade(currencies[0]===out.token,out.postBuy.tokens/2n),'v4 sell half');out.postSell={taxToken:await h.pendingCreatorTax(id,out.token),taxUSDG:await h.pendingCreatorTax(id,USDG)};assert(out.postSell.taxUSDG>0n);
 const operator=await h.feeSweepOperator();out.operator=operator;await rpc('hardhat_impersonateAccount',[operator]);await rpc('hardhat_setBalance',[operator,ethers.toQuantity(ethers.parseEther('1'))]);out.assumptions.push('Pons sweep operator impersonated ONLY locally to prove conditional conversion; we do not control it on mainnet');
 await send(h.connect(new ethers.JsonRpcSigner(p,operator)).sweepPoolFees(id,1,0,{gasLimit:6000000}),'operator conversion (test-only 1 raw minOut)');out.postClaimable=await ledger.balanceOfToken(collector.target,USDG);assert(out.postClaimable>0n);await manual('pull');for(const a of ['pay-prizes','pay-ops','pay-team'])await manual(a);out.reserves=[await promo.freeShort(),await promo.freeCurrent(),await promo.freeNext()];out.vaultBalance=await quote.balanceOf(promo.target);assert.equal(out.reserves.reduce((a,b)=>a+b,0n),out.vaultBalance);out.status='COLLECTOR_MANUAL_FORK_PASSED';
 if(process.argv.includes('--v4')){const l=await checkBuys('final');assert.equal(l.decisions.filter(d=>d.status==='ELIGIBLE').length,5);assert.equal(l.wallets[0].entriesMinted,out.buyReplay.v4accumulated.ledger.wallets[0].entriesMinted);out.status='PONS_CURVE_V4_REPLAY_FORK_PASSED';}
 if(process.argv.includes('--direct-purchase')){
  const buys=out.directPurchases.filter(s=>s.plan.kind==='buy');assert.equal(buys.length,4);
  assert(buys.every(s=>BigInt(s.plan.minimumOut)>0n&&BigInt(s.plan.minimumOut)===BigInt(s.plan.quoteOut)*99n/100n));
  assert.deepEqual(out.directPurchases.filter(s=>s.plan.venue==='pool').slice(0,4).map(s=>s.plan.kind),['reset-usdg-approval','approve-usdg','approve-router','buy']);
  assert.equal(new Set(out.directPurchases.map(s=>s.hash)).size,out.directPurchases.length);
  out.status=process.argv.includes('--browser-purchase')?'PONS_BROWSER_PURCHASE_FORK_PASSED':'PONS_DIRECT_PURCHASE_FORK_PASSED';
 }
 if(process.argv.includes('--persistent-indexer')){
  let buyPolicy;
  if(process.argv.includes('--policy-indexer')){const art=compiled.BuyPolicySource,instanceId=ethers.id('pons-local-indexer-policy'),genesisHash=D.hash(buyManifest);const source=await new ethers.ContractFactory(art.abi,art.evm.bytecode.object,owner).deploy(instanceId,genesisHash,OWNER,20,require('./buy-policy-format.cjs').initialAdapters(buyManifest));await source.waitForDeployment();buyPolicy={source:source.target,publisher:OWNER,instanceId,genesisHash,sourceCodeHash:ethers.keccak256(await p.getCode(source.target)),chainId:4663,noticeBlocks:20};out.localBuyPolicy=buyPolicy;save();}
  out.persistentIndexer=await require('./pons-indexer-rehearsal.cjs').run({rpc,manifest:buyManifest,prefix:file,buyPolicy,buy:amount=>send(trade(currencies[0]===USDG,amount),'indexer reorg fixture BUY')});out.status=out.persistentIndexer.status;
 }
 if(process.argv.includes('--combined-profile')){out.combined=await require('./pons-launch-rehearsal.cjs').finish({rpc,manifest:buyManifest,owner,provider:p,compiled,promo,prefix:file});out.status=out.combined.status;}
 if(cycle){console.log('Pons full Promo cycle');await cycleHarness.finish({out,save,provider:p,user:owner,quote,cycle,manifest:buyManifest,rpc,buy:amount=>send(trade(currencies[0]===USDG,amount),'v4 BUY after freeze')});out.status=out.cycle.status;}
 }catch(e){out.status='FAILED';out.error={message:e.shortMessage||e.message,data:e.data,info:e.info,stack:e.stack};process.exitCode=1;}
 finally{try{await browserPurchase?.close();}catch(e){out.status='FAILED';out.error={message:e.message};process.exitCode=1;}out.proxyStats=proxy?.stats;save();proxy?.close();remote?.destroy();console.log(JSON.stringify({status:out.status,error:out.error,economics:out.economics,rates:out.rates,policy:out.policy,split:out.split,graduation:out.graduation},(_,v)=>typeof v==='bigint'?v.toString():v,2));}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
