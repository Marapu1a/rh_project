// New native PAIR launch on an in-process fork only. No PAIR impersonation or code replacement.
// RH_RPC_URL=... node scripts/native-launch-fork.cjs NEW_OUTPUT.json
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers'),hre=require('hardhat');
const {startReadProxy}=require('./read-only-fork-rpc.cjs');
const {SWAP_TYPE,SWAP_ABI}=require('./direct-buy.cjs');
const entry=require('../research/native-launch/launch-entry-abi.json');
const pins=require('../research/pair-dependency-audit-2026-09-26.json');
const addresses=pins.api['v5-v2/native-fee/consumer-live'].body.addresses;
const reference=require('../research/pair-usdg-active-reference-2026-09-23.json').decoderConfig;
const coder=ethers.AbiCoder.defaultAbiCoder(),PERMIT='0x000000000022d473030f116ddee9f6b43ac78ba3';
const erc=['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','function approve(address,uint256) returns(bool)'];
const rpc=(method,params=[])=>hre.network.provider.send(method,params);
async function main(){
 const out=process.argv[2];assert(out&&!fs.existsSync(out)&&process.argv.length===3,'NEW_OUTPUT.json required');
 const e={schema:'native-launch-fork-v1',observedAt:new Date().toISOString(),upstream:process.env.RH_RPC_URL||'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public',
  assumptions:['Local chain31337 only; ordinary creator, no impersonation','Only trader USDG balance is artificially funded; local signers have sandbox ETH','100% internal promo policy is a test parameter, not approved project allocation','PromoVault uses inert adapter as local draw authority; no RNG/draw/eligibility/payout proof'],transactions:[]};
 let proxy;
 function stage(value){e.stage=value;console.log(value);}
 try{
  stage('fork');proxy=await startReadProxy(e.upstream);
  const remote=new ethers.JsonRpcProvider(proxy.url);assert.equal((await remote.getNetwork()).chainId,4663n);const head=await remote.getBlock('latest');remote.destroy();
  await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:head.number}}]);assert.equal(await rpc('eth_chainId'),'0x7a69');
  e.forkBlock=await rpc('eth_getBlockByNumber',['latest',false]);assert.equal(e.forkBlock.hash,head.hash);await rpc('evm_mine');
  const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
  const deployer=await provider.getSigner(0),creator=await provider.getSigner(2),buyer=await provider.getSigner(3);
  const owner=await deployer.getAddress(),wallet=await buyer.getAddress(),creatorAddress=await creator.getAddress();e.roles={owner,creator:creatorAddress,buyer:wallet};
  async function sent(label,promise){const tx=await promise,receipt=await tx.wait();assert.equal(receipt.status,1);e.transactions.push({label,transaction:await rpc('eth_getTransactionByHash',[tx.hash]),receipt:await rpc('eth_getTransactionReceipt',[tx.hash])});return receipt;}
  stage('release-pins');
  e.runtime={};for(const name of ['registry','handler','factory','coordinator','hook','launchImplementation']){const pin=pins.contracts[name],hash=ethers.keccak256(await provider.getCode(pin.address));assert.equal(hash,pin.runtimeCodeHash,name);e.runtime[name]={address:pin.address,hash};}
  const slot=await provider.getStorage(addresses.launchpad,'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc');assert.equal(slot.slice(-40),entry.implementation.slice(2));
  for(const [name,pin]of [['tokenFactory',pins.tokenFactory],['tokenImplementation',pins.tokenImplementation]]){const hash=ethers.keccak256(await provider.getCode(pin.address));assert.equal(hash,pin.hash,name);e.runtime[name]={address:pin.address,hash};}
  const launch=new ethers.Contract(addresses.launchpad,[...entry.abi,...['stockRegistry','ethPriceFeed','poolManager','positionManager','activeLaunchV2ModeRegistry'].map(n=>`function ${n}() view returns(address)`),...['launchFeeWei','maxOracleAge','protectionBlocks'].map(n=>`function ${n}() view returns(uint256)`) ],creator);
  const registry=new ethers.Contract(addresses.modeRegistry,['function currentCoordinator() view returns(address)','function launchEnabled() view returns(bool)','function currentHandler(uint32) view returns(address,uint256,bool)','function vaultOf(address) view returns(address)'],provider);
  assert.equal((await launch.activeLaunchV2ModeRegistry()).toLowerCase(),addresses.modeRegistry);assert.equal((await registry.currentCoordinator()).toLowerCase(),addresses.coordinator);assert(await registry.launchEnabled());const handler=await registry.currentHandler(1);assert.equal(handler[0].toLowerCase(),addresses.feeSharingMode);assert.equal(handler[1],5n);assert(handler[2]);
  stage('quote-feed-preflight');const stockAddress=await launch.stockRegistry(),stock=new ethers.Contract(stockAddress,['function getConfig(address) view returns((bool enabled,uint8 decimals,bytes32 symbol,address priceFeed,uint256 graduationTargetUsdE8,bool ethRouteEnabled))'],provider);
  const quoteAddress=reference.quote,config=await stock.getConfig(quoteAddress),now=(await provider.getBlock('latest')).timestamp,maxAge=await launch.maxOracleAge();
  e.preflight={stockRegistry:stockAddress,quote:quoteAddress,quoteConfig:config.toObject(),maxOracleAge:maxAge,feeds:[]};assert(config.enabled,'USDG disabled');assert.equal(config.decimals,6n);
  for(const address of [config.priceFeed,await launch.ethPriceFeed()]){const feed=new ethers.Contract(address,['function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)','function decimals() view returns(uint8)'],provider);const round=await feed.latestRoundData(),decimals=await feed.decimals();e.preflight.feeds.push({address,round:round.toArray(),decimals});assert(round[1]>0n&&round[3]>0n&&round[4]>=round[0]&&round[3]<=BigInt(now)&&BigInt(now)-round[3]<=maxAge,'Unusable price feed');assert(decimals<=36n);}
  const fee=await launch.launchFeeWei();e.preflight.launchFee=fee;e.preflight.protectionBlocks=await launch.protectionBlocks();
  stage('mine-token-address');const factory=new ethers.Contract(addresses.tokenFactory,['function implementation() view returns(address)','function predictTokenAddress(address,bytes32) view returns(address)','function tokenInitCodeHash() view returns(bytes32)'],provider);
  assert.equal((await factory.implementation()).toLowerCase(),pins.tokenImplementation.address.toLowerCase());const initHash=await factory.tokenInitCodeHash();let salt,predicted;
  for(let i=1;i<2000000;i++){salt=ethers.zeroPadValue(ethers.toBeHex(i),32);predicted=ethers.getCreate2Address(factory.target,ethers.keccak256(coder.encode(['address','bytes32'],[creatorAddress,salt])),initHash);if(predicted.toLowerCase().endsWith('5555'))break;}
  assert(predicted.toLowerCase().endsWith('5555'),'No mined salt');assert.equal(predicted,await factory.predictTokenAddress(creatorAddress,salt));assert.equal(await provider.getCode(predicted),'0x');
  stage('bootstrap');const compiled=require('./compile.cjs').compile();
  async function deploy(name,args){const a=compiled[name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,deployer).deploy(...args);await sent('deploy '+name,Promise.resolve(c.deploymentTransaction()));await c.waitForDeployment();return c;}
  // Dedicated deployer sends exactly router, adapter, vault, converter; creator launches separately.
  const nonce=await provider.getTransactionCount(owner,'pending'),futureConverter=ethers.getCreateAddress({from:owner,nonce:nonce+3});
  e.bootstrap={token:predicted,salt,deployerNonce:nonce,converter:futureConverter,order:['FeeRouter','LocalV4PrizeAdapter','PromoVault','LocalMarketPrizeConverter']};
  const router=await deploy('FeeRouter',[owner,predicted,quoteAddress,[now+86400,[futureConverter,ethers.ZeroAddress,ethers.ZeroAddress],[10000,0,0]]]);
  stage('native-launch');const deadline=(await provider.getBlock('latest')).timestamp+600;
  const params={name:'Local PAIR Promo Proof',symbol:'LOCAL',metadataURI:'https://example.invalid/local-fork-only',metadataHash:ethers.id('local fork evidence'),allocations:[[quoteAddress,10000]],modeId:1,modeConfiguration:coder.encode(['address[]','uint16[]'],[[router.target],[10000]]),feeRecipients:[],feeSharesBps:[],developerBuyRecipient:creatorAddress,developerBuy:[0,0,[]],deadline,userSalt:salt};
  e.launch={params,fee,router:router.target};e.launch.simulatedToken=await launch.launchV2Token.staticCall(params,{value:fee,gasLimit:16000000});assert.equal(e.launch.simulatedToken,predicted);
  const launchReceipt=await sent('native launch via public entrypoint',launch.launchV2Token(params,{value:fee,gasLimit:16000000}));
  stage('verify-vault-position');const vaultAddress=await registry.vaultOf(predicted);assert.notEqual(vaultAddress,ethers.ZeroAddress);
  const source=new ethers.Contract(vaultAddress,['function projectToken() view returns(address)','function modeId() view returns(uint32)','function epoch() view returns(uint64)','function epochRecipient(uint64,uint256) view returns(address,uint16)','function epochRecipientCount(uint64) view returns(uint256)','function positionCount() view returns(uint256)','function positionIdAt(uint256) view returns(uint256)','function positions(uint256) view returns(bool,address,bytes32)','function claimable(uint64,address,address) view returns(uint256)','event NativePositionRegistered(uint256 indexed positionId,bytes32 indexed poolId,address indexed quote)'],provider);
  assert.equal(await source.projectToken(),predicted);assert.equal(await source.modeId(),1n);assert.equal(await source.epoch(),1n);assert.equal(await source.epochRecipientCount(1),1n);assert.equal((await source.epochRecipient(1,0))[0],router.target);assert.equal((await source.epochRecipient(1,0))[1],10000n);assert.equal(await source.positionCount(),1n);
  const position=await source.positionIdAt(0),pos=await source.positions(position),manager=await launch.poolManager(),pmAddress=await launch.positionManager();
  const pm=new ethers.Contract(pmAddress,['function ownerOf(uint256) view returns(address)','function getPoolAndPositionInfo(uint256) view returns((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks),uint256)'],provider);
  assert.equal(await pm.ownerOf(position),vaultAddress);const [keyResult]=await pm.getPoolAndPositionInfo(position),key=keyResult.toArray();assert(pos[0]);assert.equal(pos[1].toLowerCase(),quoteAddress);assert.equal(pos[2],ethers.keccak256(coder.encode(['address','address','uint24','int24','address'],key)));assert.equal(key[2],10000n);assert.equal(key[3],200n);assert.equal(key[4].toLowerCase(),addresses.hook);assert.deepEqual(key.slice(0,2).map(x=>x.toLowerCase()).sort(),[predicted.toLowerCase(),quoteAddress].sort());
  const registration=launchReceipt.logs.filter(l=>l.address.toLowerCase()===vaultAddress.toLowerCase()&&l.topics[0]===source.interface.getEvent('NativePositionRegistered').topicHash).map(l=>source.interface.parseLog(l));assert.equal(registration.length,1);assert.equal(registration[0].args.positionId,position);assert.equal(registration[0].args.poolId,pos[2]);
  e.binding={vault:vaultAddress,position,poolId:pos[2],poolKey:key,manager,positionManager:pmAddress,epoch:1};
  stage('deploy-prize-path');const adapter=await deploy('LocalV4PrizeAdapter',[predicted,quoteAddress,reference.router,PERMIT,manager,key]);
  const prize=await deploy('PromoVault',[predicted,quoteAddress,adapter.target,100_000000]);
  const cap=ethers.parseEther('10000000'),converter=await deploy('LocalMarketPrizeConverter',[predicted,quoteAddress,prize.target,adapter.target,owner,owner,[cap,300,cap,3600,60]]);assert.equal(converter.target,futureConverter);
  e.prizePath={adapter:adapter.target,vault:prize.target,converter:converter.target};
  stage('binding-negatives');for(const id of [0n,position+1000000000n]){await assert.rejects(router.bindSource.staticCall(vaultAddress,id));assert.equal(await router.pairVault(),ethers.ZeroAddress);}e.invalidPositionsRejected=true;
  await sent('bind registered USDG source',router.bindSource(vaultAddress,position));assert.equal(await router.sourceEpoch(),1n);await assert.rejects(router.bindSource.staticCall(vaultAddress,position));
  stage('buyer-funding');const quote=new ethers.Contract(quoteAddress,erc,buyer),token=new ethers.Contract(predicted,erc,buyer);assert.equal(await quote.decimals(),6n);
  const trace=await rpc('debug_traceCall',[{to:quoteAddress,data:quote.interface.encodeFunctionData('balanceOf',[wallet])},'latest',{}]);let used;
  for(const slot of [...new Set(trace.structLogs.filter(l=>l.op==='SLOAD').map(l=>'0x'+l.stack.at(-1)))]){const snap=await rpc('evm_snapshot');await rpc('hardhat_setStorageAt',[quoteAddress,slot,ethers.zeroPadValue(ethers.toBeHex(1000_000000n),32)]);try{if(await quote.balanceOf(wallet)===1000_000000n){used=slot;break;}}catch{/* A proxy control slot is not the wallet balance; restore before the next probe. */}await rpc('evm_revert',[snap]);}assert(used);e.sandboxFunding={address:wallet,slot:used,amount:'1000000000'};
  await sent('buyer USDG approves Permit2',quote.approve(PERMIT,ethers.MaxUint256));const permit=new ethers.Contract(PERMIT,['function approve(address,address,uint160,uint48)'],buyer);
  await sent('buyer Permit2 allowance',permit.approve(quoteAddress,reference.router,100_000000n,deadline));
  // Ordinary buyer trades after the real copied launch-protection interval, never by mutating TOKEN state.
  const restrictions=await new ethers.Contract(predicted,['function restrictionsEndBlock() view returns(uint256)'],provider).restrictionsEndBlock();while(BigInt(await rpc('eth_blockNumber'))<=restrictions)await rpc('evm_mine');
  stage('native-pool-buy');const ur=new ethers.Contract(reference.router,['function execute(bytes,bytes[],uint256) payable'],buyer),before=await quote.balanceOf(wallet);
  const swap=coder.encode(['bytes','bytes[]'],['0x060b0e',[coder.encode([SWAP_TYPE],[[key,key[0].toLowerCase()===quoteAddress,100_000000n,1n,0,'0x']]),coder.encode(['address','uint256','bool'],[quoteAddress,0,true]),coder.encode(['address','address','uint256'],[predicted,wallet,0])]]);
  const bought=await sent('ordinary USDG buy through Universal Router',ur.execute('0x10',[swap],deadline,{gasLimit:3000000}));assert.equal(before-await quote.balanceOf(wallet),100_000000n);assert(await token.balanceOf(wallet)>0n);
  const swaps=bought.logs.filter(l=>l.address.toLowerCase()===manager.toLowerCase()&&l.topics[0]===SWAP_ABI.getEvent('Swap').topicHash);assert.equal(swaps.length,1);assert.equal(SWAP_ABI.parseLog(swaps[0]).args.id,pos[2]);e.buy={usdSpent:'100000000',tokenReceived:await token.balanceOf(wallet),transaction:bought.hash,route:'Universal Router direct native V4 pool; not PAIR UI/aggregator proof'};
  stage('collect-claim-fund');await sent('collect new LP fees',router.collect({gasLimit:4000000}));e.claims=[];
  for(const asset of [predicted,quoteAddress]){const due=await source.claimable(1,router.target,asset);await sent('harvest '+asset,router.harvest(asset,1));assert.equal(await router.received(1,asset),due);assert.equal(await router.credit(asset,converter.target),due);await sent('pay converter '+asset,router.pay(asset,converter.target));assert.equal(await router.credit(asset,converter.target),0n);e.claims.push({asset,due});}
  assert(e.claims[1].due>0n);await sent('forward earned USDG into reserves',converter.forwardQuote());const reserves=[await prize.freeShort(),await prize.freeCurrent(),await prize.freeNext()];assert.equal(reserves.reduce((a,b)=>a+b,0n),e.claims[1].due);assert.equal(await quote.balanceOf(prize.target),e.claims[1].due);assert.equal(await quote.balanceOf(converter.target),0n);e.result={reserves,receivedUSDG:e.claims[1].due,routerAccounted:await router.accounted(quoteAddress)};assert.equal(e.result.routerAccounted,0n);
  // No TOKEN fee inventory is invented just to force a conversion; a USDG-input BUY normally funds USDG fees.
  e.success=true;stage('complete');
 }catch(error){e.error=error.stack||String(error);e.errorData=error.data||error.info||null;process.exitCode=1;}
 finally{e.proxyStats=proxy?.stats;fs.writeFileSync(out,JSON.stringify(e,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,stage:e.stage,error:e.error,success:e.success,proxyStats:e.proxyStats}));await proxy?.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
