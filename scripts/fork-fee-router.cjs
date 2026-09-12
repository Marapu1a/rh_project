// All transactions below run on the in-process Hardhat fork. No public signer/provider.
// Historical baseline reproduction. Current combined test: npm run test:fork (economics-fork.cjs).
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {ethers} = require('ethers');
const hre = require('hardhat');
const {compile} = require('./compile.cjs');
const RPC = 'https://rpc.mainnet.chain.robinhood.com';
const PROXY = '0x8660a7f019c7943b0b0a91b8e39aff3b6db6ae62';
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951';
const POSITIONS = '0x58daec3116aae6d93017baaea7749052e8a04fa7';
const TYPE = '(string,string,string,bytes32,(address,uint16)[],uint32,bytes,address[],uint16[],address,(uint256,uint256,(address,uint256,uint256)[]),uint256,bytes32)';
const report = {observedAtUtc: new Date().toISOString(), mode: 'local-fork-only', transactions: []};
const save = () => fs.writeFileSync('research/fee-router-rollover-fork-result.json', JSON.stringify(report,null,2));
async function main() {
  const compiled = compile();
  // Pin the known-good PAIR launch state; live launch changes are a separate recon task.
  const baseline = JSON.parse(fs.readFileSync('research/fee-router-fork-result.json'));
  const forkBlockNumber = Number(baseline.forkBlock);
  report.requestedForkBlock = baseline.forkBlock;
  report.success = false;
  report.status = 'running';
  save(); // Also leaves an honest incomplete record if the native EVM process aborts.
  await hre.network.provider.send('hardhat_reset',[{forking:{jsonRpcUrl:RPC,blockNumber:forkBlockNumber}}]);
  const provider = new ethers.BrowserProvider(hre.network.provider, undefined, {cacheTimeout: -1});
  assert.equal((await provider.getNetwork()).chainId,31337n);
  report.forkBlock = await hre.network.provider.send('eth_blockNumber');
  const source = JSON.parse(fs.readFileSync('research/native-launch-corrected.json'));
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
  const promo = await deploy('PromoVaultFixture');
  const now = Number((await provider.getBlock('latest')).timestamp);
  const router = await deploy('FeeRouter',[await admin.getAddress(),tokenAddress,USDG,[now+86400,[promo.target,ethers.ZeroAddress,ethers.ZeroAddress],[10000,0,0]]]);
  report.router=router.target; report.promoFixture=promo.target; report.token=tokenAddress;
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
  const ercABI=['function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)','function transfer(address,uint256) returns(bool)'];
  const token=new ethers.Contract(tokenAddress,ercABI,trader),quote=new ethers.Contract(USDG,ercABI,trader);
  const sell=(await token.balanceOf(creator))/10n;
  assert.ok(sell>0n,'Developer buy did not deliver token');
  const swap=await deploy('SwapFixture',[MANAGER]);
  await tx('approve local swap fixture',token.approve(swap.target,sell));
  await tx('sell TOKEN to generate TOKEN fees',swap.connect(trader).trade(key,key[0].toLowerCase()===tokenAddress,sell,{gasLimit:3000000}));
  await tx('keeper collects PAIR position fees',router.connect(keeper).collect({gasLimit:3000000}));
  const pair=new ethers.Contract(vault,['function epoch() view returns(uint64)'],provider);
  const epoch=await pair.epoch();
  report.assets={};
  for(const [symbol,asset] of [['TOKEN',token],['USDG',quote]]) {
    const before=await asset.balanceOf(promo.target);
    await tx(`keeper harvests ${symbol}`,router.connect(keeper).harvest(asset.target,epoch,{gasLimit:3000000}));
    const credit=await router.credit(asset.target,promo.target);
    assert.ok(credit>0n,`${symbol}: expected actual earned fees`);
    await tx(`keeper pays ${symbol} to PromoVault fixture`,router.connect(keeper).pay(asset.target,promo.target));
    const after=await asset.balanceOf(promo.target);
    assert.equal(after-before,credit);
    assert.equal(await router.credit(asset.target,promo.target),0n);
    assert.equal(await router.accounted(asset.target),0n);
    report.assets[symbol]={asset:asset.target,credited:String(credit),promoReceived:String(after-before)};
  }
  // Leave fresh pool fees uncollected and direct deposits unrecognized until rollover.
  await tx('approve pre-rollover sale',token.approve(swap.target,sell));
  await tx('pre-rollover sale',swap.connect(trader).trade(key,key[0].toLowerCase()===tokenAddress,sell,{gasLimit:3000000}));
  await tx('direct TOKEN before rollover',token.transfer(router.target,17));
  await tx('direct USDG before rollover',quote.transfer(router.target,17));
  const oldBefore=await router.received(1,tokenAddress);
  await hre.network.provider.send('evm_setNextBlockTimestamp',[now+86420]);
  await hre.network.provider.send('evm_mine');
  const nextRecipient=await admin.getAddress();
  const next=[now+172800,[nextRecipient,ethers.ZeroAddress,ethers.ZeroAddress],[10000,0,0]];
  await tx('atomic rollover with outstanding PAIR fees',router.rollCampaign(1,next,{gasLimit:5000000}));
  assert.equal(await router.campaignId(),2n);
  assert.ok(await router.received(1,tokenAddress)>oldBefore+17n,'Final collect must harvest actual new TOKEN fees');
  report.rollover={};
  for(const [symbol,asset] of [['TOKEN',token],['USDG',quote]]) {
    const oldCredit=await router.credit(asset.target,promo.target);
    const oldTotal=await router.received(1,asset.target);
    assert.ok(oldCredit>=17n);
    assert.equal(await router.received(2,asset.target),0n);
    await tx(`direct ${symbol} after rollover`,asset.transfer(router.target,23));
    await tx(`recognize new campaign ${symbol}`,router.connect(keeper).sync(asset.target));
    assert.equal(await router.received(2,asset.target),23n);
    assert.equal(await router.credit(asset.target,nextRecipient),23n);
    assert.equal(await router.received(1,asset.target),oldTotal);
    await tx(`pay old unpaid ${symbol} after rollover`,router.connect(keeper).pay(asset.target,promo.target));
    report.rollover[symbol]={oldTotal:String(oldTotal),oldUnpaidAtBoundary:String(oldCredit),newRevenue:'23'};
  }
  await assert.rejects(()=>router.rollCampaign.staticCall(1,next));
  report.success=true;report.status='complete';save();console.log(JSON.stringify({success:true,forkBlock:report.forkBlock,router:report.router,vault,assets:report.assets,rollover:report.rollover},null,2));
}
main().catch(e=>{report.success=false;report.status='failed';report.error=e.stack;save();console.error(e);process.exitCode=1;});
