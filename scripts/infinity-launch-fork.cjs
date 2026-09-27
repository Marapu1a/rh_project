// Only an in-process 31337 fork; upstream proxy cannot send transactions.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers'),hre=require('hardhat');
const {startReadProxy}=require('./read-only-fork-rpc.cjs');
const dir='research/infinity-source-audit/',get=n=>JSON.parse(fs.readFileSync(dir+n+'.json','utf8'));
const coder=ethers.AbiCoder.defaultAbiCoder(),rpc=(m,p=[])=>hre.network.provider.send(m,p);
const proxyAddress='0xB0D389250c61c69EcCD5d986fC8482CBfA5418C4';
const quoteAddress=require('../research/pair-usdg-active-reference-2026-09-23.json').decoderConfig.quote;
async function main(){
 const out=process.argv[2],collectorMode=process.argv[3]==='--collector';assert(out&&!fs.existsSync(out)&&(process.argv.length===3||(process.argv.length===4&&collectorMode)),'New output path [--collector] required');
 const e={schema:'infinity-launch-fork-v1',observedAt:new Date().toISOString(),feeBps:300,transactions:[],
  assumptions:['31337 local fork; no PAIR impersonation/code changes','Buyer USDG storage funded artificially; sandbox ETH',
   'Local opening ticks and minOut=1, not a deployment price/slippage policy','No developer buy; no vanity suffix requirement at contract level',
   'Fork-only receiver, no withdrawals/prize distribution; no admission/entries/RNG proof']};
 if(collectorMode)e.assumptions[e.assumptions.length-1]='Production collector under test; PromoVault has inert draw authority; no admission/entries/RNG proof';
 let proxy;const stage=s=>{e.stage=s;console.log(s)};
 try{
  stage('fork');proxy=await startReadProxy(process.env.RH_RPC_URL||'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public');
  const remote=new ethers.JsonRpcProvider(proxy.url);assert.equal((await remote.getNetwork()).chainId,4663n);const head=await remote.getBlock('latest');remote.destroy();
  await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:head.number}}]);assert.equal(await rpc('eth_chainId'),'0x7a69');
  e.anchor=await rpc('eth_getBlockByNumber',['latest',false]);assert.equal(e.anchor.hash,head.hash);await rpc('evm_mine');
  const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1}),creator=await provider.getSigner(2),buyer=await provider.getSigner(3);
  const creatorAddress=await creator.getAddress(),wallet=await buyer.getAddress();e.roles={creator:creatorAddress,buyer:wallet};
  async function sent(label,promise){const tx=await promise,r=await tx.wait();assert.equal(r.status,1);e.transactions.push({label,tx:await rpc('eth_getTransactionByHash',[tx.hash]),receipt:await rpc('eth_getTransactionReceipt',[tx.hash])});return r;}
  stage('pins');e.pins={};for(const n of ['hook','engine','adapter','launch']){const j=get(n),hash=ethers.keccak256(await provider.getCode(j.address));assert.equal(hash,j.onchainBytecodeHash,n);e.pins[n]={address:j.address,hash};}
  const impl=await provider.getStorage(proxyAddress,'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc');assert.equal(impl.slice(-40),get('launch').address.slice(2).toLowerCase());e.proxy={address:proxyAddress,implementationSlot:impl};
  const engine=new ethers.Contract(get('engine').address,get('engine').abi,provider),hook=new ethers.Contract(get('hook').address,get('hook').abi,provider);
  assert.equal((await engine.launchpad()).toLowerCase(),proxyAddress.toLowerCase());assert(await engine.validateLaunchpad(proxyAddress));
  const factoryAddress=await engine.factory();
  const factory=new ethers.Contract(factoryAddress,['function predictStandard((address creator,string name,string symbol,string metadataURI,bytes32 metadataHash),bytes32,uint256) view returns(address,address)'],provider);
  stage('receiver');const solc=require('solc'),file=dir+'LocalInfinityReceiver.sol';
  const mathSources=Object.fromEntries(Object.entries(get('tick-math-sources')).map(([p,s])=>[p,{content:s.content}]));
  const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{...mathSources,[file]:{content:fs.readFileSync(file,'utf8')}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
  assert(!(compiled.errors||[]).some(x=>x.severity==='error'),JSON.stringify(compiled.errors));const a=compiled.contracts[file].LocalInfinityReceiver;
  let receiver=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,creator).deploy(quoteAddress);await sent('deploy local receiver',Promise.resolve(receiver.deploymentTransaction()));
  const identity=[creatorAddress,'Local Infinity Promo','LIP','https://example.invalid/fork-only',ethers.id('local infinity proof')],salt=ethers.id('local infinity 3pct proof');
  const [tokenAddress,lock]=await factory.predictStandard(identity,salt,0);assert.equal(await provider.getCode(tokenAddress),'0x');
  const project0=BigInt(tokenAddress)<BigInt(quoteAddress),lower=project0?-400000:380000,upper=project0?-380000:400000;
  const opening=await receiver.sqrtAt(project0?lower:upper),graduation=await receiver.sqrtAt(project0?-390000:390000);
  let product,promo;
  if(collectorMode){product=require('./compile.cjs').compile();const c=product.InfinityCollector;receiver=await new ethers.ContractFactory(c.abi,c.evm.bytecode.object,creator).deploy(creatorAddress,tokenAddress,quoteAddress,hook.target,factoryAddress);await sent('deploy production collector',Promise.resolve(receiver.deploymentTransaction()));e.assumptions.push('Collector policy 100% Promo is a fixture, not approved production allocation');}
  const now=(await provider.getBlock('latest')).timestamp,deadline=now+1800;
  const params=[coder.encode(['string','string','string','bytes32'],identity.slice(1)),[[quoteAddress,10000]],
   [coder.encode(['uint8','uint160','int24','int24','uint256','bytes32','uint160','bool'],[6,opening,lower,upper,now,ethers.id('local hypothetical opening'),graduation,project0])],
   deadline,salt,false,0,1,300,coder.encode(['address'],[receiver.target]),0,[]];
  const encoded=coder.encode(['tuple(bytes identityData,tuple(address quoteToken,uint16 weightBps)[] allocations,bytes[] openingData,uint256 deadline,bytes32 userSalt,bool sniperProtection,uint256 protectionBlocks,uint8 mode,uint16 feeBps,bytes modeData,uint64 policyEffectiveAt,address[] holderExcluded)'],[params]);
  const launch=new ethers.Contract(proxyAddress,get('launch').abi,creator),fee=await launch.launchFee();
  e.launch={token:tokenAddress,lock,recipient:receiver.target,quote:quoteAddress,encoded,fee,opening,lower,upper};
  stage('launch');assert.equal(await launch.launchInfinity.staticCall(encoded,{value:fee,gasLimit:16000000}),tokenAddress);
  await sent('launch Infinity 3pct USDG',launch.launchInfinity(encoded,{value:fee,gasLimit:16000000}));
  const policy=await hook.activePolicy(tokenAddress);assert.equal(policy.feeBps,300n);assert.equal(policy.mode,1n);
  const vault=new ethers.Contract(policy.destination,get('creator').abi,provider);assert.equal(await vault.projectToken(),tokenAddress);assert.equal(await vault.hook(),hook.target);const cp=await vault.currentPolicy();assert.equal(cp.recipient,receiver.target);assert.equal(cp.feeBps,300n);
  if(collectorMode){const a=product.PromoVault;promo=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,creator).deploy(tokenAddress,quoteAddress,hook.target,100_000000n);await sent('deploy PromoVault inert draw authority',Promise.resolve(promo.deploymentTransaction()));await sent('bind collector',receiver.bindSource(vault.target,[now+100,[promo.target,ethers.ZeroAddress,ethers.ZeroAddress],[10000,0,0]]));}else await sent('bind receiver',receiver.bind(vault.target));e.source={vault:vault.target,policy:policy.toObject(),creatorPolicy:cp.toArray()};
  const manager=await hook.poolManager(),parameters=ethers.zeroPadValue(ethers.toBeHex((200n<<16n)|await hook.getHooksRegistrationBitmap()),32);
  const key=[...(project0?[tokenAddress,quoteAddress]:[quoteAddress,tokenAddress]),hook.target,manager,10000,parameters];e.poolKey=key;e.poolId=await hook.poolId(key);
  stage('fund-buyer');const erc=['function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)','function decimals() view returns(uint8)','function transfer(address,uint256) returns(bool)'];
  const quote=new ethers.Contract(quoteAddress,erc,buyer),token=new ethers.Contract(tokenAddress,erc,buyer);assert.equal(await quote.decimals(),6n);
  const trace=await rpc('debug_traceCall',[{to:quoteAddress,data:quote.interface.encodeFunctionData('balanceOf',[wallet])},'latest',{}]);
  for(const slot of [...new Set(trace.structLogs.filter(l=>l.op==='SLOAD').map(l=>'0x'+l.stack.at(-1)))]){const snap=await rpc('evm_snapshot');await rpc('hardhat_setStorageAt',[quoteAddress,slot,ethers.zeroPadValue(ethers.toBeHex(1000_000000n),32)]);try{if(await quote.balanceOf(wallet)===1000_000000n){e.funding={slot,amount:'1000000000'};break;}}catch{}await rpc('evm_revert',[snap]);}assert(e.funding);
  const adapter=new ethers.Contract(get('adapter').address,get('adapter').abi,buyer),base=100_000000n,gross=103_300000n;
  await sent('approve USDG',quote.approve(adapter.target,gross));const initial=await quote.balanceOf(wallet);
  stage('buy');const buy=await sent('BUY 100 base plus 3.3 hook fees',adapter.executeExactInput(key,!project0,base,gross,1,wallet,wallet,deadline,'0x',{gasLimit:4000000}));
  assert.equal(initial-await quote.balanceOf(wallet),gross);const received=await token.balanceOf(wallet);assert(received>0n);
  function inspect(r){const events=r.logs.filter(l=>l.address.toLowerCase()===hook.target.toLowerCase()).map(l=>hook.interface.parseLog(l)).filter(Boolean);
   const mode=events.find(x=>x.name==='ModeFeeAccrued'),protocol=events.find(x=>x.name==='ProtocolFeeAccrued');assert(mode&&protocol);assert.equal(mode.args[2],vault.target);
   const mi=new ethers.Interface(get('manager').abi),swaps=r.logs.filter(l=>l.address.toLowerCase()===manager.toLowerCase()).map(l=>{try{return mi.parseLog(l)}catch{return null}}).filter(x=>x?.name==='Swap');assert.equal(swaps.length,1);assert.equal(swaps[0].args.id,e.poolId);
   return {mode:mode.args[3],protocol:protocol.args[2],swap:swaps[0].args.toObject()};}
  const b=inspect(buy);assert.equal(b.mode,3000000n);assert.equal(b.protocol,300000n);assert.equal(await vault.claimable(receiver.target,quoteAddress),b.mode);
  stage('first-claim');const beforeClaim=await quote.balanceOf(receiver.target);await sent('permissionless pull BUY fees',receiver.connect(buyer).pull());assert.equal(await quote.balanceOf(receiver.target)-beforeClaim,b.mode);assert.equal(await vault.claimable(receiver.target,quoteAddress),0n);if(collectorMode)assert.equal(await receiver.pull.staticCall(),0n);else await assert.rejects(receiver.pull.staticCall());
  stage('sell');await sent('approve TOKEN',token.approve(adapter.target,received));const beforeSell=await quote.balanceOf(wallet);
  const sell=await sent('SELL all bought TOKEN',adapter.executeExactInput(key,project0,received,received,1,wallet,wallet,deadline,'0x',{gasLimit:4000000}));
  const s=inspect(sell),quoteDelta=BigInt(project0?s.swap.amount1:s.swap.amount0);assert(quoteDelta>0n);
  assert.equal(s.mode,quoteDelta*300n/10000n);assert.equal(s.protocol,quoteDelta*30n/10000n);assert.equal(await quote.balanceOf(wallet)-beforeSell,quoteDelta-s.mode-s.protocol);
  stage('second-claim');await sent('permissionless pull SELL fees',receiver.connect(buyer).pull());assert.equal(await quote.balanceOf(receiver.target),b.mode+s.mode);assert.equal(await quote.balanceOf(vault.target),0n);assert.equal(await vault.claimable(receiver.target,quoteAddress),0n);assert.equal(await token.balanceOf(wallet),0n);
  for(const asset of [quote,token])assert.equal(await asset.balanceOf(adapter.target),0n);
  e.result={buy:b,sell:s,tokenReceived:received,quoteSpent:gross,quoteReturned:quoteDelta-s.mode-s.protocol,receiverUSDG:await quote.balanceOf(receiver.target),emptyClaimRejected:!collectorMode,emptyPullNoop:collectorMode};
  if(collectorMode){
   stage('collector-roll-fund');
   const oldCredit=await receiver.credit(promo.target);assert.equal(oldCredit,b.mode+s.mode);
   await sent('direct USDG before rollover',quote.transfer(receiver.target,7));
   await rpc('evm_setNextBlockTimestamp',[now+101]);await rpc('evm_mine');
   await sent('atomic collector rollover',receiver.rollCampaign(1,[now+1000,[promo.target,ethers.ZeroAddress,ethers.ZeroAddress],[10000,0,0]]));
   assert.equal(await receiver.received(1),oldCredit+7n);assert.equal(await receiver.credit(promo.target),oldCredit+7n);
   await assert.rejects(receiver.rollCampaign.staticCall(1,[now+1000,[promo.target,ethers.ZeroAddress,ethers.ZeroAddress],[10000,0,0]]));
   await sent('direct USDG after rollover',quote.transfer(receiver.target,11));await sent('sync new campaign',receiver.connect(buyer).sync());assert.equal(await receiver.received(2),11n);
   await sent('pay Promo and sync GENERAL',receiver.connect(buyer).pay(promo.target));
   const reserves=[await promo.freeShort(),await promo.freeCurrent(),await promo.freeNext()];assert.equal(reserves.reduce((x,y)=>x+y,0n),oldCredit+18n);
   assert.equal(await receiver.accounted(),0n);assert.equal(await quote.balanceOf(receiver.target),0n);
   e.collector={address:receiver.target,promo:promo.target,oldRevenue:await receiver.received(1),newRevenue:await receiver.received(2),reserves,unpaidPreserved:true,staleRejected:true,fixtureBps:[10000,0,0]};
  }
  e.success=true;stage('complete');
 }catch(error){e.error=error.stack||String(error);e.errorData=error.data||null;process.exitCode=1;}
 finally{e.proxyStats=proxy?.stats;fs.writeFileSync(out,JSON.stringify(e,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n',{flag:'wx'});console.log(JSON.stringify({stage:e.stage,success:e.success,error:e.error,proxyStats:e.proxyStats}));await proxy?.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
