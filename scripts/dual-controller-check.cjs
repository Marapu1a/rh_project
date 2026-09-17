// Local size/readiness integration study. Uses mock RNG, never a deployment script.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers'),hre=require('hardhat');
const {compileVariant}=require('./controller-size-study.cjs'),dataset=require('./short-dataset.cjs'),model=require('./short-outcome.cjs');
const {monthlyRoot}=require('../test/fixtures/dual-controller.cjs'),{participants,normalRules}=require('../test/fixtures/short-outcome.cjs');
const {drawIdFor}=require('./draw-id.cjs');
const rpc=(m,p=[])=>hre.network.provider.send(m,p),sent=async p=>(await p).wait(),id=ethers.id;
async function main(){
  const {artifacts:a,report}=compileVariant({dual:true});await rpc('hardhat_reset');
  const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1}),admin=await provider.getSigner(),other=await provider.getSigner(1);
  const gas={},checks=[];
  const measured=async(label,tx)=>{const receipt=await sent(tx);gas[label]=String(receipt.gasUsed);return receipt;};
  const deploy=async(name,args=[])=>{const c=await new ethers.ContractFactory(a[name].abi,a[name].evm.bytecode.object,admin).deploy(...args);await c.waitForDeployment();return c;};
  const token=await deploy('MockToken'),quote=await deploy('MockToken'),registry=await deploy('ParticipantRegistry'),random=await deploy('SizeStudyRandom');
  const owner=await admin.getAddress(),futureVault=ethers.getCreateAddress({from:owner,nonce:await provider.getTransactionCount(owner)+2});
  const base={vault:futureVault,registry:registry.target,instance:id('dual size short'),governor:owner,publisher:owner,provider:random.target,
    confirmations:2,maxGasPrice:1000000000000n,nativeFloor:10};
  const short=await deploy('ShortRngSizeStudy',[{...base,notice:3600,maxBudget:10000},normalRules,[7,5,3]]);
  const monthly=await deploy('MonthlyRngSizeStudy',[{...base,instance:id('dual size monthly'),interval:30*86400},normalRules]);
  const vault=await deploy('DualControllerPromoVault',[token.target,quote.target,short.target,monthly.target,100]);assert.equal(vault.target,futureVault);
  for(const [name,c] of [['ShortRngSizeStudy',short],['MonthlyRngSizeStudy',monthly],['DualControllerPromoVault',vault]]){
    const size=(await provider.getCode(c.target)).length/2-1;assert.equal(size,report.sizes[name].runtime);assert(size<=24576);
  }
  checks.push('Both scoped controllers with roles and async RNG binding deploy under standard 24576-byte enforcement');
  await sent(quote.mint(owner,10000));await sent(quote.approve(vault.target,10000));
  await sent(vault.fundUSDG(1000,1));await sent(vault.fundUSDG(1000,2));await sent(vault.fundUSDG(100,3));
  await rpc('evm_increaseTime',[30*86400+1]);await rpc('evm_mine');
  const block=await provider.getBlock('latest');await rpc('hardhat_mine',['0x2']);
  const ps=participants(64,5),draw=drawIdFor('SHORT',id('size short')),pid=id('size proposal'),month=drawIdFor('MONTHLY',id('size month'));
  await measured('short.begin',short.begin(pid,{drawId:draw,campaignId:1,rulesEpoch:1,cutoffBlockNumber:block.number,cutoffBlockHash:block.hash,
    snapshotHash:id('synthetic short'),expectedRoot:dataset.rootFor(ps),expectedCount:64,expectedAttempts:320,budget:101}));
  await measured('short.publish64',short.publish(pid,ps));
  await measured('monthly.begin',monthly.beginMonth({drawId:month,snapshotHash:id('synthetic month'),root:monthlyRoot(ps),campaign:1,
    cutoff:block.number,cutoffHash:block.hash,count:64,attempts:320}));
  await measured('monthly.publish64',monthly.publishMonth(month,ps));
  const reject=async fn=>assert.rejects(async()=>sent(fn()));
  await reject(()=>short.seal(pid));await reject(()=>monthly.sealMonth(month));
  for(const c of [short,monthly])await sent(admin.sendTransaction({to:c.target,value:1000}));
  await sent(random.setFailure(true));await reject(()=>short.seal(pid));await reject(()=>monthly.sealMonth(month));
  assert.equal(await vault.reserved(quote.target),0n);assert.equal(await random.nextId(),0n);
  assert.equal(await short.pendingDatasetDraw(),ethers.ZeroHash);assert.equal(await monthly.pendingMonth(),ethers.ZeroHash);
  await sent(random.setFailure(false));await sent(random.setReady(false));await reject(()=>monthly.sealMonth(month));await sent(random.setReady(true));
  await reject(()=>monthly.sealMonth(month,{gasPrice:1000000000001n}));
  checks.push('Missing native funding, provider unavailable/failure and excessive gas prevent freeze; request failure atomically rolls back both paths');
  await measured('short.sealAndRequest',short.connect(other).seal(pid));await measured('monthly.sealAndRequest',monthly.connect(other).sealMonth(month));
  assert.equal(await vault.reserved(quote.target),1101n);
  const sk=await short.drawRequest(draw),mk=await monthly.drawRequest(month);
  await reject(()=>monthly.fulfill(mk,ethers.ZeroHash));
  await measured('short.callback',random.deliver(sk,ethers.ZeroHash));await reject(()=>random.deliver(sk,id('again')));
  await measured('monthly.callback',random.deliver(mk,ethers.ZeroHash));await reject(()=>random.deliver(mk,id('reroll')));
  const m=await monthly.month(month),expected=model.compute(m.context,ethers.ZeroHash,ps,normalRules,[m.budget]);
  await measured('monthly.process64',monthly.connect(other).processMonth(month,0,ps));
  assert.equal((await monthly.month(month)).winner.toLowerCase(),expected.winners[0]||ethers.ZeroAddress);
  await measured('monthly.finish',monthly.connect(other).finishMonth(month));
  assert.equal(await short.pendingDatasetDraw(),draw);
  await measured('short.process64',short.connect(other).processShort(draw,0,ps));await measured('short.finish',short.connect(other).finishShort(draw));
  checks.push('Independent concurrent draws finish through permissionless executors; wrong caller and repeat seed rejected; Monthly matches independent JS result');
  const total=await vault.freeShort()+await vault.freeCurrent()+await vault.freeNext()+await vault.reserved(quote.target)+await vault.claimable(quote.target);
  assert.equal(total,await quote.balanceOf(vault.target));
  const output={schema:'dual-controller-check-v1',solc:require('solc').version(),evmVersion:'cancun',optimizerRuns:200,viaIR:false,
    runtimeLimit:24576,sizes:Object.fromEntries(['ShortRngSizeStudy','MonthlyRngSizeStudy','DualControllerPromoVault'].map(n=>[n,report.sizes[n]])),
    participants:64,shortPrizes:3,gas,checks,sourceHashes:report.sourceHashes,
    limitations:['Local EVM and mock asynchronous RNG only','Study roles/readiness are not an approved production provider or policy','Gas figures exclude L2 data fees and are not USD quotes']};
  fs.writeFileSync('research/controller-size/dual-check.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({sizes:output.sizes,gas,checks},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
