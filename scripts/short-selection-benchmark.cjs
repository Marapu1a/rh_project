// Local Hardhat only. Compare code on exactly the SAME frozen state/context/seed.
// setCode is a measurement tool here, NOT a production upgrade mechanism.
const fs=require('node:fs'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const {ethers}=require('ethers'),hre=require('hardhat');
const {compile}=require('./compile.cjs'),dataset=require('./short-dataset.cjs'),model=require('./short-settlement.cjs');
const {participants,normalRules,nearCertainRules,rpc,sent}=require('../test/fixtures/short-outcome.cjs');
const {split}=require('../test/fixtures/short-streaming.cjs');
const BASELINE='2586de843b8ea81c62fecaa250285dca8b42f494';
const GAS=32000000,instance=ethers.id('selection benchmark'),seed=ethers.id('selection benchmark seed');
const files=['contracts/ShortOutcome.sol','contracts/ShortSettlement.sol','test/contracts/ShortOutcomeFixture.sol'];
const digest=s=>ethers.keccak256(ethers.toUtf8Bytes(s.replace(/\r\n/g,'\n')));
const total=xs=>xs.reduce((a,b)=>a+b,0n),max=xs=>xs.reduce((a,b)=>a>b?a:b,0n);
async function deployFixture(compiled,rules,k){
  await rpc('hardhat_reset');await rpc('evm_setNextBlockTimestamp',[2000000000]);
  const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1}),admin=await provider.getSigner();
  const deploy=async(name,args=[])=>{const a=compiled[name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,admin).deploy(...args);await c.waitForDeployment();return c;};
  const token=await deploy('MockToken'),quote=await deploy('MockToken'),registry=await deploy('ParticipantRegistry');
  const predicted=ethers.getCreateAddress({from:await admin.getAddress(),nonce:await provider.getTransactionCount(await admin.getAddress())+1});
  const weights=Array.from({length:k},(_,i)=>k-i);
  const source=await deploy('ShortSettlementFixture',[predicted,registry.target,instance,3600,rules,weights]);
  const vault=await deploy('PromoVault',[token.target,quote.target,source.target,100]);
  return {provider,admin,source,vault,quote};
}
async function main(){
  const baselineSources=Object.fromEntries(files.map(f=>[f,execFileSync('git',['show',`${BASELINE}:${f}`],{encoding:'utf8'})]));
  const before=compile({sourceOverrides:baselineSources,writeArtifacts:false}),after=compile({writeArtifacts:false});
  const size=a=>a.ShortSettlementFixture.evm.deployedBytecode.object.length/2;
  const report={schema:'short-selection-benchmark-v1',baselineCommit:BASELINE,
    environment:{solc:require('solc').version(),optimizerRuns:200,hardfork:'cancun',chainId:31337,transactionGasBudget:GAS},
    method:'Deploy both versions at identical addresses and timestamps; capture optimized runtime. Prepare baseline frozen state once, snapshot, run baseline, revert, inject captured optimized runtime with local hardhat_setCode, run same chunks/seed. No public transactions.',
    scope:'Runtime size and process/finish receipt gas only. Excludes deployment, publication, RNG provider, claims, L1 DA and fiat pricing. Cases are measurements, not worst-case bounds.',
    sourceHashes:Object.fromEntries(files.map(f=>[f,{before:digest(baselineSources[f]),after:digest(fs.readFileSync(f,'utf8'))}])),
    runtimeBytes:{before:size(before),after:size(after),limit:24576},cases:[]};
  for(const [n,k,profile] of [[128,1,'normal'],[128,10,'normal'],[128,64,'near-certain'],[1000,10,'normal'],[1000,64,'near-certain']]){
    const rules=profile==='normal'?normalRules:nearCertainRules,ps=participants(n,20),chunks=split(ps,64);
    const optimized=await deployFixture(after,rules,k),optimizedCode=await optimized.provider.getCode(optimized.source.target);
    const startedAt=await optimized.source.shortRulesStartedAt();
    const f=await deployFixture(before,rules,k);assert.equal(f.source.target,optimized.source.target);
    assert.equal(await f.source.shortRulesStartedAt(),startedAt);
    await sent(f.quote.mint(await f.admin.getAddress(),1000000));await sent(f.quote.approve(f.vault.target,1000000));await sent(f.vault.fundUSDG(1000000,1));
    await rpc('evm_increaseTime',[21601]);await rpc('evm_mine');const block=await f.provider.getBlock('latest');
    const drawId=ethers.id('benchmark draw'),pid=ethers.id('benchmark proposal');
    await sent(f.source.begin(pid,{drawId,campaignId:1,rulesEpoch:1,cutoffBlockNumber:block.number,cutoffBlockHash:block.hash,
      snapshotHash:ethers.id('synthetic dataset'),expectedRoot:dataset.rootFor(ps),expectedCount:n,expectedAttempts:n*20,budget:1000000}));
    for(const chunk of chunks)await sent(f.source.publish(pid,chunk,{gasLimit:GAS}));
    await sent(f.source.seal(pid));await sent(f.source.supplySeed(drawId,seed));
    const context=(await f.source.datasetProposal(pid)).context,prizes=Array.from(await f.source.datasetBasket(pid));
    const expected=model.compute(context,seed,ps,rules,prizes),checkpoint=await rpc('evm_snapshot');
    const row={n,k,profile,chunkSize:64,context,seed,resultHash:expected.resultHash,admitted:expected.admittedCount};
    for(const variant of ['before','after']){
      if(variant==='after'){await rpc('evm_revert',[checkpoint]);await rpc('hardhat_setCode',[f.source.target,optimizedCode]);}
      const gas=[];
      for(let i=0;i<chunks.length;i++)gas.push((await sent(f.source.processShort(drawId,i,chunks[i],{gasLimit:GAS}))).gasUsed);
      assert.equal((await f.source.shortResult(drawId)).resultHash,expected.resultHash);
      const finish=(await sent(f.source.finishShort(drawId,{gasLimit:GAS}))).gasUsed;
      assert.equal(await f.vault.claimable(f.quote.target),total(expected.amounts));
      assert.equal(await f.vault.freeShort(),1000000n-total(expected.amounts));
      assert.equal(await f.vault.reserved(f.quote.target),0n);
      row[variant]={processing:gas,processingTotal:total(gas),maxProcess:max(gas),finish,total:total(gas)+finish};
    }
    assert(row.after.processingTotal<row.before.processingTotal);
    report.cases.push(row);console.log(`${n}/${k} ${profile}: process ${row.before.processingTotal} -> ${row.after.processingTotal}; finish ${row.before.finish} -> ${row.after.finish}`);
  }
  assert(report.runtimeBytes.after<report.runtimeBytes.before);
  fs.writeFileSync('research/short-selection-benchmark.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
  console.log('runtime',report.runtimeBytes);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
