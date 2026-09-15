// All transactions are on local Hardhat. Stress overrides exist only in compiler memory.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {compile}=require('./compile.cjs');
const model=require('./short-outcome.cjs');
const atomic=require('../test/fixtures/short-outcome.cjs');
const stream=require('../test/fixtures/short-streaming.cjs');
const LIMIT=32000000n,seed=ethers.id('scaling study seed');
const stringify=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2);
const max=values=>values.reduce((a,b)=>a>b?a:b,0n);
async function main(){
  const report={schema:'short-settlement-scaling-study-v1',environment:{hardfork:'cancun',chainId:31337,
    solc:require('solc').version(),optimizerRuns:200,localTransactionBudget:LIMIT},atomic:[],streaming:[]};
  const normal=compile();
  const original=fs.readFileSync('contracts/ShortOutcome.sol','utf8');
  const admission='if (random >= threshold(p.lastAttempt - p.firstAttempt + 1, rules)) continue;';
  const selection='Candidate memory candidate = Candidate(p.wallet, uint256(keccak256(abi.encode(ORDER, context, seed, p.wallet))));';
  assert.equal(original.split(admission).length,2);assert.equal(original.split(selection).length,2);
  const synthetic=original.replace(admission,'if (random == threshold(p.lastAttempt - p.firstAttempt + 1, rules)) revert InvalidOutcomeInput();')
    .replace(selection,'uint256 measuredRank = uint256(keccak256(abi.encode(ORDER, context, seed, p.wallet)));\n            if (measuredRank == 0) revert InvalidOutcomeInput();\n            Candidate memory candidate = Candidate(p.wallet, type(uint256).max - i);');
  report.stressVariant={description:'NOT a valid draw: hash/threshold work retained; forced all-admitted and descending ranks force every top-K shift. Extra guards revert on hash equality/zero; observed cases never hit them.',
    originalSourceHash:ethers.keccak256(ethers.toUtf8Bytes(original.replace(/\r\n/g,'\n'))),
    syntheticSourceHash:ethers.keccak256(ethers.toUtf8Bytes(synthetic.replace(/\r\n/g,'\n')))};
  const worst=compile({sourceOverrides:{'contracts/ShortOutcome.sol':synthetic},writeArtifacts:false});
  for(const [profile,compiled,cases] of [
    ['real-hashes',normal,[[1000,1],[1000,10],[1000,32],[1000,64],[2000,10],[5000,10]]],
    ['forced-worst-insertion',worst,[[64,64],[1000,10],[1000,64],[2000,10]]]]){
    for(const [n,k] of cases){
      const ps=atomic.participants(n,1000000),f=await atomic.fixture(compiled);
      const draw=await f.freeze(ps,atomic.nearCertainRules,Array(k).fill(1));
      const row={profile,n,k,freezeGas:draw.receipt.gasUsed,calldataBytes:132+96*n};
      try{
        const receipt=await atomic.sent(f.source.settle(draw.request.drawId,seed,ps,{gasLimit:LIMIT}));
        const events=receipt.logs.filter(l=>l.address===f.source.target).map(l=>f.source.interface.parseLog(l));
        const measured=events.find(e=>e.name==='Measured');
        Object.assign(row,{status:'settled',gas:receipt.gasUsed,verificationGas:measured.args.verificationGas,finalizeGas:measured.args.finalizeGas});
        if(profile==='real-hashes'){
          const expected=model.compute(draw.context,seed,ps,draw.rules,draw.prizes);
          assert.equal(events.find(e=>e.name==='AttemptsConsumed').args.resultHash,expected.resultHash);
          row.admitted=expected.admittedCount;
        }
      }catch(error){
        if(!/out of gas|ran out of gas/i.test(error.message))throw error;
        Object.assign(row,{status:'out-of-gas-at-budget',error:error.shortMessage||error.message,
          reservedAfterFailure:await f.vault.reserved(f.quote.target),pendingAfterFailure:await f.source.pendingShortDrawId()});
      }
      report.atomic.push(row);console.log(profile,n,k,row.status,String(row.gas||LIMIT));
    }
  }
  for(const [n,k] of [[1000,10],[5000,10],[1000,64]]){
    const ps=atomic.participants(n,1000000),f=await stream.fixture(normal,ps,{rules:atomic.nearCertainRules,weights:Array(k).fill(1)});
    const chunks=stream.split(ps,64),publication=[],processing=[];
    for(const chunk of chunks)publication.push((await stream.sent(f.source.publish(chunk,{gasLimit:LIMIT}))).gasUsed);
    assert.equal(await f.vault.reserved(f.quote.target),0n);
    const seal=(await stream.sent(f.source.connect(f.other).seal({gasLimit:LIMIT}))).gasUsed;
    const supplySeed=(await stream.sent(f.source.supplySeed(seed))).gasUsed;
    // Read back the dataset from public transaction calldata, not the publisher's array.
    const recovered=await stream.recoverChunks(f.provider,f.source);
    for(let i=0;i<recovered.length;i++)processing.push((await stream.sent(f.source.connect(i%2?f.third:f.other).process(i,recovered[i],{gasLimit:LIMIT}))).gasUsed);
    const actual=await f.source.result(),context=await f.source.context(),expected=model.compute(context,seed,ps,f.rules,f.prizes);
    assert.deepEqual(stream.normalize(actual),stream.normalize(expected));
    assert.equal(actual.resultHash,stream.resultHash(context,seed,await f.source.root(),f.rules,f.prizes,expected));
    const finish=(await stream.sent(f.source.connect(f.third).finish({gasLimit:LIMIT}))).gasUsed;
    const awarded=expected.amounts.reduce((a,b)=>a+b,0n);
    assert.equal(await f.vault.claimable(f.quote.target),awarded);assert.equal(await f.vault.freeShort()+awarded,f.setup.budget);
    const total=[f.beginReceipt.gasUsed,...publication,seal,supplySeed,...processing,finish].reduce((a,b)=>a+b,0n);
    const row={n,k,chunkSize:64,chunks:chunks.length,context,seed,orderedRoot:await f.source.root(),
      resultHash:actual.resultHash,admitted:actual.admittedCount,winners:actual.winners.length,
      maxPublicationGas:max(publication),maxProcessGas:max(processing),maxCallGas:max([f.beginReceipt.gasUsed,...publication,seal,supplySeed,...processing,finish]),
      beginGas:f.beginReceipt.gasUsed,sealGas:seal,seedGas:supplySeed,finishGas:finish,totalGas:total,
      maxPublishCalldataBytes:68+96*Math.min(n,64),maxProcessCalldataBytes:100+96*Math.min(n,64),
      publicationGas:publication,processingGas:processing};
    report.streaming.push(row);console.log('stream',n,k,'max call',String(row.maxCallGas),'total',String(total));
  }
  const files=['contracts/ShortOutcome.sol','contracts/PromoVault.sol','test/contracts/ShortStreamingStudy.sol',
    'scripts/compile.cjs','scripts/short-scaling-study.cjs','test/fixtures/short-streaming.cjs'];
  report.sourceHashes=Object.fromEntries(files.map(p=>[p,ethers.keccak256(ethers.toUtf8Bytes(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')))]));
  fs.writeFileSync('research/short-scaling-study.json',stringify(report)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
