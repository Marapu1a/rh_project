// All transactions below run on the in-process Hardhat fork. No public signer/provider.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {ethers} = require('ethers');
const hre = require('hardhat');
const {compile} = require('./compile.cjs');
const {startReadProxy}=require('./read-only-fork-rpc.cjs');
const RPC = process.env.RH_RPC_URL || 'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public';
const PROXY = '0x8660a7f019c7943b0b0a91b8e39aff3b6db6ae62';
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951';
const POSITIONS = '0x58daec3116aae6d93017baaea7749052e8a04fa7';
const TYPE = '(string,string,string,bytes32,(address,uint16)[],uint32,bytes,address[],uint16[],address,(uint256,uint256,(address,uint256,uint256)[]),uint256,bytes32)';
const farming = process.argv.includes('--farming');
const report = {observedAtUtc: new Date().toISOString(), mode: 'local-fork-only', transactions: []};
const output = farming ? 'research/farming-fork-2026-09-12.json' : 'research/economics-fork-2026-09-12.json';
const save = () => fs.writeFileSync(output, JSON.stringify(report,null,2));
let readProxy;
async function main() {
  const compiled = compile();
  report.success=false;report.status='running';save();
  readProxy=await startReadProxy(RPC);
  report.rpcStats=readProxy.stats;
  await hre.network.provider.send('hardhat_reset',[{forking:{jsonRpcUrl:readProxy.url}}]);
  const provider = new ethers.BrowserProvider(hre.network.provider, undefined, {cacheTimeout: -1});
  assert.equal((await provider.getNetwork()).chainId,31337n);
  report.forkBlock = await hre.network.provider.send('eth_blockNumber');
  save();console.log('Fork ready',report.forkBlock);
  const source = JSON.parse(fs.readFileSync('research/current-launch-2026-09-12.json'));
  const creator = source.vanity.creator, tokenAddress = source.vanity.predicted;
  assert.equal(await provider.getCode(tokenAddress),'0x','Vanity salt already used; remine before replay');
  await hre.network.provider.send('hardhat_impersonateAccount',[creator]);
  await hre.network.provider.send('hardhat_setBalance',[creator,ethers.toBeHex(ethers.parseEther('10'))]);
  const admin = await provider.getSigner(0), trader = new ethers.JsonRpcSigner(provider,creator), keeper = await provider.getSigner(1);
  async function tx(label, promise) {
    const receipt = await (await promise).wait();
    report.transactions.push({label,hash:receipt.hash,status:receipt.status,gasUsed:String(receipt.gasUsed),logs:receipt.logs.map(l=>({address:l.address,topics:[...l.topics],data:l.data}))});
    save(); return receipt;
  }
  async function deploy(name,args=[]) {
    const a=compiled[name], c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,admin).deploy(...args);
    await c.waitForDeployment(); return c;
  }
  const controller = await deploy('DrawControllerFixture');
  const promo = await deploy('PromoVault',[tokenAddress,USDG,controller.target,100n*10n**6n]);
  report.prizeAccounting='USDG Short/Current source reservations; Next locked; legacy TOKEN prizes only for fixture integration, not current product';
  const now = Number((await provider.getBlock('latest')).timestamp);
  const router = await deploy('FeeRouter',[await admin.getAddress(),tokenAddress,USDG,[now+86400,[promo.target,ethers.ZeroAddress,ethers.ZeroAddress],[10000,0,0]]]);
  report.router=router.target; report.promoVault=promo.target; report.token=tokenAddress;
  const original = source.reads.find(r=>r.method==='eth_call' && r.params[0].data.startsWith('0xb802af88'));
  const coder=ethers.AbiCoder.defaultAbiCoder();
  const params=coder.decode([TYPE],'0x'+original.params[0].data.slice(10))[0].toArray(true);
  params[6]=coder.encode(['address[]','uint16[]'],[[router.target],[10000]]);
  params[11]=now+1200;
  const input='0xb802af88'+coder.encode([TYPE],[params]).slice(2);
  const launch=await tx('PAIR launch with our FeeRouter',trader.sendTransaction({to:PROXY,data:input,value:original.params[0].value,gasLimit:15000000}));
  const launchTopic=ethers.id('CanonicalProjectLaunched(address,address,address,uint32,uint256,address,bytes32)');
  const log=launch.logs.find(l=>l.topics[0]===launchTopic && l.topics[1].slice(-40).toLowerCase()===tokenAddress.slice(2));
  assert.ok(log,'Missing PAIR launch event');
  const vault='0x'+log.topics[3].slice(-40);
  const nft=launch.logs.find(l=>l.address.toLowerCase()===POSITIONS && l.topics[0]===ethers.id('Transfer(address,address,uint256)') && l.topics[2].slice(-40).toLowerCase()===vault.slice(2));
  assert.ok(nft,'No position NFT transferred to vault');
  const position=BigInt(nft.topics[3]);
  report.vault=vault;report.positionId=String(position);
  await tx('bind source',router.bindSource(vault,position));
  const initInterface=new ethers.Interface(['event Initialize(bytes32 indexed id,address indexed currency0,address indexed currency1,uint24 fee,int24 tickSpacing,address hooks,uint160 sqrtPriceX96,int24 tick)']);
  const init=launch.logs.filter(l=>l.address.toLowerCase()===MANAGER).map(l=>{try{return initInterface.parseLog(l);}catch{return null;}}).find(l=>l && [l.args.currency0.toLowerCase(),l.args.currency1.toLowerCase()].includes(tokenAddress));
  assert.ok(init,'Missing pool initialization');
  const key=[init.args.currency0,init.args.currency1,init.args.fee,init.args.tickSpacing,init.args.hooks];
  report.pool={id:init.args.id,currency0:key[0],currency1:key[1],fee:String(key[2]),tickSpacing:String(key[3]),hook:key[4]};
  const ercABI=['function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)','function transfer(address,uint256) returns(bool)'];
  const token=new ethers.Contract(tokenAddress,ercABI,trader),quote=new ethers.Contract(USDG,ercABI,trader);
  assert.equal(await token.decimals(),18n);
  assert.equal(await quote.decimals(),6n);
  const participant = await provider.getSigner(2), wallet = await participant.getAddress();
  const swap=await deploy('SwapFixture',[MANAGER]);
  const participantToken=token.connect(participant),participantQuote=quote.connect(participant);
  // Sandbox capital only: discover the actual USDG balance slot from an EVM read trace.
  // No pool reserves, token prices, PAIR fees, or TOKEN supply are modified.
  const balanceData=quote.interface.encodeFunctionData('balanceOf',[wallet]);
  const trace=await hre.network.provider.send('debug_traceCall',[{to:USDG,data:balanceData},'latest',{}]);
  const slots=[...new Set(trace.structLogs.filter(l=>l.op==='SLOAD').map(l=>'0x'+l.stack.at(-1)))];
  let fundedSlot;
  for(const slot of slots) {
    const snapshot=await hre.network.provider.send('evm_snapshot');
    await hre.network.provider.send('hardhat_setStorageAt',[USDG,slot,ethers.zeroPadValue(ethers.toBeHex(10000n*10n**6n),32)]);
    let balance;try {balance=await quote.balanceOf(wallet);}catch{}
    if(balance===10000n*10n**6n) {fundedSlot=slot;break;}
    await hre.network.provider.send('evm_revert',[snapshot]);
  }
  assert.ok(fundedSlot,'Unable to identify USDG fixture balance slot');
  report.sandboxFunding={wallet,asset:USDG,balanceRaw:'10000000000',slot:fundedSlot,method:'local storage override of participant USDG balance only; not an onchain mint'};
  await tx('approve participant USDG',participantQuote.approve(swap.target,ethers.MaxUint256));
  await tx('approve participant TOKEN',participantToken.approve(swap.target,ethers.MaxUint256));
  const pair=new ethers.Contract(vault,['function epoch() view returns(uint64)'],provider),epoch=await pair.epoch();
  async function harvest(label) {
    await tx(label+' collect',router.connect(keeper).collect({gasLimit:3000000}));
    const amounts={};
    for(const [symbol,asset] of [['TOKEN',token],['USDG',quote]]) {
      const before=await router.received(1,asset.target);
      await tx(label+' harvest '+symbol,router.connect(keeper).harvest(asset.target,epoch,{gasLimit:3000000}));
      amounts[symbol]=String((await router.received(1,asset.target))-before);
    }
    return amounts;
  }
  await harvest('clear developer-buy fees');
  for(const asset of [token,quote]) await tx('fund PromoVault from launch fees',router.connect(keeper).pay(asset.target,promo.target));
  await tx('recognize launch USDG funding',promo.syncUSDG());
  const swapInterface=new ethers.Interface(['event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)']);
  const decodeSwap=receipt=>receipt.logs.map(l=>{try{return l.address.toLowerCase()===MANAGER?swapInterface.parseLog(l):null;}catch{return null;}}).find(l=>l && l.args.id===init.args.id);
  const initialSwap=decodeSwap(launch);
  let sqrt=initialSwap?initialSwap.args.sqrtPriceX96:init.args.sqrtPriceX96;
  const initialSqrt=sqrt;
  const spot=x=>key[0].toLowerCase()===USDG ? 2**192/Number(x)**2*1e12 : Number(x)**2/2**192*1e12;
  report.initialSpotUSDGPerToken=spot(sqrt);
  report.assumptions={quoteDollarValue:'1 USDG = $1 scenario assumption, not a peg guarantee',entries:'hypothetical enrolled independent wallet: cumulative gross direct BUY USDG / 100; developer buy excluded',gas:'local EVM gas units only; Nitro L1 data fees are not reproduced',market:'fresh single-pool PAIR launch; fixed initial developer buy .00001 ETH, baseline fees cleared'};
  let baseline=await hre.network.provider.send('evm_snapshot');
  async function reset(){await hre.network.provider.send('evm_revert',[baseline]);baseline=await hre.network.provider.send('evm_snapshot');sqrt=initialSqrt;}
  report.scenarios=[];
  async function trade(direction,amount) {
    const q0=await quote.balanceOf(wallet),t0=await token.balanceOf(wallet),beforeSpot=spot(sqrt);
    const receipt=await tx(direction+' '+amount,swap.connect(participant).trade(key,direction==='BUY'?key[0].toLowerCase()===USDG:key[0].toLowerCase()===tokenAddress,amount,{gasLimit:3000000}));
    const event=decodeSwap(receipt);assert.ok(event,'Missing actual swap log');sqrt=event.args.sqrtPriceX96;
    const q1=await quote.balanceOf(wallet),t1=await token.balanceOf(wallet);
    const quoteDelta=q1-q0,tokenDelta=t1-t0;
    const fees=await harvest(direction+' fees');
    return {direction,requestedInputRaw:String(amount),quoteDeltaRaw:String(quoteDelta),tokenDeltaRaw:String(tokenDelta),creatorFeesRaw:fees,gasUnits:String(receipt.gasUsed),poolSwapFee:String(event.args.fee),spotBefore:beforeSpot,spotAfter:spot(sqrt),executionUSDGPerToken:Math.abs(Number(quoteDelta)/Number(tokenDelta))*1e12,endingTick:String(event.args.tick)};
  }
  async function awardFromSources(label,asset,parts) {
    for(const [source,budget] of parts) {
      if(budget===0n) continue;
      const draw=ethers.id(label+' '+source);
      const method=asset.target.toLowerCase()===USDG?'reserveUSDG':'reserve';
      const args=asset.target.toLowerCase()===USDG?[draw,1,source,budget]:[draw,1,asset.target,budget];
      await tx(label+' reserve '+source,controller.execute(promo.target,promo.interface.encodeFunctionData(method,args)));
      await tx(label+' finalize '+source,controller.execute(promo.target,promo.interface.encodeFunctionData('finalize',[draw,[wallet],[budget]])));
      const before=await asset.balanceOf(wallet);
      await tx(label+' claim '+source,promo.connect(participant).claim(draw,wallet));
      assert.equal((await asset.balanceOf(wallet))-before,budget);
    }
  }
  async function selfFundedPayout(scenario) {
    // Maximal attacker allocation: owns every entry. No RNG fairness claim.
    // Baseline developer fees already sit in PromoVault and are never awarded here.
    assert.equal(await token.balanceOf(wallet),0n,'Trade inventory must be closed before prizes');
    const beforeQuote=await quote.balanceOf(wallet);
    const eligibleShort=BigInt(scenario.entries)>=30n;
    const payout={eligibleShort,allocation:'eligible self-funded distributable prizes to sole participant; Next excluded; no RNG',assets:{}};
    for(const [symbol,asset] of [['TOKEN',token],['USDG',quote]]) {
      const ownFees=await router.credit(asset.target,promo.target);
      let budget=symbol==='TOKEN' && !eligibleShort ? 0n : ownFees;
      if(budget===0n) {
        payout.assets[symbol]={ownFeesRaw:String(ownFees),awardedRaw:'0'};
        continue;
      }
      const beforeShort=await promo.freeShort(),beforeCurrent=await promo.freeCurrent(),beforeNext=await promo.freeNext();
      await tx('pay own fees '+symbol,router.connect(keeper).pay(asset.target,promo.target));
      let parts=[[0,budget]];
      if(symbol==='USDG') {
        await tx('recognize own USDG fees',promo.syncUSDG());
        parts=[[0,(await promo.freeShort())-beforeShort],[1,(await promo.freeCurrent())-beforeCurrent]];
        budget=parts.reduce((sum,part)=>sum+part[1],0n);
      }
      payout.assets[symbol]={ownFeesRaw:String(ownFees),awardedRaw:String(budget),nextHeldRaw:symbol==='USDG'?String((await promo.freeNext())-beforeNext):'0'};
      await awardFromSources('self-funded '+scenario.name+' '+symbol,asset,parts);
      assert.equal(await promo.claimable(asset.target),0n);
      assert.equal(await promo.reserved(asset.target),0n);
    }
    const rewardToken=await token.balanceOf(wallet);
    if(rewardToken>0n) payout.liquidation=await trade('SELL',rewardToken);
    assert.equal(await token.balanceOf(wallet),0n,'Prize must be liquidated completely');
    payout.realizedRewardsUSDGRaw=String((await quote.balanceOf(wallet))-beforeQuote);
    const tradeNet=scenario.legs.reduce((total,leg)=>total+BigInt(leg.quoteDeltaRaw),0n);
    payout.netAfterPrizesUSDGRaw=String(tradeNet+BigInt(payout.realizedRewardsUSDGRaw));
    payout.limitations='excludes gas and waiting costs; monthly prize paid immediately; fees from prize liquidation remain for later draws, not recursively refunded';
    scenario.selfFundedPayout=payout;
  }
  for(const dollars of (farming ? [1000,3000] : [25,100,500])) {
    await reset();
    const scenario={name:`BUY ${dollars} then SELL received TOKEN`,requestedBuyUSDG:dollars,legs:[]};
    report.scenarios.push(scenario);
    try {
      const buy=await trade('BUY',BigInt(dollars)*10n**6n);scenario.legs.push(buy);
      const sell=await trade('SELL',BigInt(buy.tokenDeltaRaw));scenario.legs.push(sell);
      const gross=-BigInt(buy.quoteDeltaRaw),returned=BigInt(sell.quoteDeltaRaw);
      scenario.grossBuyRaw=String(gross);scenario.quoteReturnedRaw=String(returned);
      scenario.roundTripLossUSDG=Number(gross-returned)/1e6;
      scenario.roundTripLossPercent=Number(gross-returned)/Number(gross)*100;
      scenario.entries=String(gross/(100n*10n**6n));scenario.carryUSDGRaw=String(gross%(100n*10n**6n));
      if(farming) await selfFundedPayout(scenario);
      scenario.status='complete';
    } catch(e) {scenario.status='failed';scenario.error=e.shortMessage||e.message;}
    save();console.log(scenario.name,scenario.status,scenario.roundTripLossUSDG??scenario.error);
  }
  await reset();
  const cycles=farming?30:5;
  const repeated={name:`${cycles} cycles BUY 100 / SELL all received TOKEN, one wallet`,legs:[],status:'running'};
  report.scenarios.push(repeated);
  let gross=0n,net=0n;
  try {
    for(let i=0;i<cycles;i++) {
      const b=await trade('BUY',100n*10n**6n);repeated.legs.push(b);gross-=BigInt(b.quoteDeltaRaw);net+=BigInt(b.quoteDeltaRaw);
      const s=await trade('SELL',BigInt(b.tokenDeltaRaw));repeated.legs.push(s);net+=BigInt(s.quoteDeltaRaw);
      if(farming && (i+1)%5===0) console.log('Farming cycles completed',i+1,'/',cycles);
    }
    repeated.grossBuyRaw=String(gross);repeated.roundTripLossUSDG=Number(-net)/1e6;
    repeated.entries=String(gross/(100n*10n**6n));repeated.carryUSDGRaw=String(gross%(100n*10n**6n));
    if(farming) await selfFundedPayout(repeated);
    repeated.status='complete';
  }catch(e){repeated.status='failed';repeated.error=e.shortMessage||e.message;}
  save();console.log(repeated.name,repeated.status,repeated.roundTripLossUSDG??repeated.error);
  // Integration branch starts from the untouched post-launch baseline.
  await reset();
  await trade('BUY',25n*10n**6n);
  const tokenBalance=await token.balanceOf(wallet);
  // Leave this sale's fees uncollected until rollover.
  await tx('sell before rollover without harvesting',swap.connect(participant).trade(key,key[0].toLowerCase()===tokenAddress,tokenBalance,{gasLimit:3000000}));
  await tx('direct USDG before rollover',participantQuote.transfer(router.target,17));
  // Creator owns the developer buy inventory; donation is excluded from economic scenarios.
  await tx('direct TOKEN before rollover',token.transfer(router.target,17));
  await hre.network.provider.send('evm_setNextBlockTimestamp',[now+86420]);await hre.network.provider.send('evm_mine');
  await tx('rollover final collect and claim',router.rollCampaign(1,[now+172800,[promo.target,ethers.ZeroAddress,ethers.ZeroAddress],[10000,0,0]],{gasLimit:5000000}));
  assert.equal(await router.campaignId(),2n);
  report.integration={rollover:true,assets:{}};
  for(const [symbol,asset] of [['TOKEN',token],['USDG',quote]]) {
    const oldTotal=await router.received(1,asset.target),credit=await router.credit(asset.target,promo.target);
    assert.ok(credit>0n);
    await tx('pay old credit '+symbol,router.connect(keeper).pay(asset.target,promo.target));
    assert.equal(await router.credit(asset.target,promo.target),0n);
    if(symbol==='USDG') await tx('recognize integration USDG',promo.syncUSDG());
    const parts=symbol==='USDG'?[[0,await promo.freeShort()],[1,await promo.freeCurrent()]]:[[0,await promo.available(asset.target)]];
    const budget=parts.reduce((sum,part)=>sum+part[1],0n);assert.ok(budget>0n);
    await awardFromSources('integration '+symbol,asset,parts);
    assert.equal(await promo.claimable(asset.target),0n);
    assert.equal(await promo.reserved(asset.target),0n);
    const transferAsset=asset.connect(participant);
    await tx('post-rollover donation '+symbol,transferAsset.transfer(router.target,7));
    await tx('sync new campaign '+symbol,router.sync(asset.target));
    assert.equal(await router.received(2,asset.target),7n);
    assert.equal(await router.received(1,asset.target),oldTotal);
    report.integration.assets[symbol]={oldRevenueRaw:String(oldTotal),winnerPaidRaw:String(budget),nextHeldRaw:symbol==='USDG'?String(await promo.freeNext()):'0',newRevenueRaw:'7'};
  }
  await assert.rejects(()=>router.rollCampaign.staticCall(1,[now+200000,[promo.target,ethers.ZeroAddress,ethers.ZeroAddress],[10000,0,0]]));
  assert.ok(report.scenarios.every(s=>s.status==='complete'),'At least one economic scenario failed; inspect report');
  report.status='complete';report.success=true;save();console.log('Integration and experiment completed',report.integration);
}
main().catch(e=>{report.success=false;report.status='failed';report.error=e.stack;save();console.error(e);process.exitCode=1;}).finally(()=>readProxy?.close());
