// Local synthetic participants and caller-injected seed. NO public transactions.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {compile}=require('./compile.cjs');
const model=require('./short-outcome.cjs');
const {fixture,participants,normalRules,nearCertainRules,sent}=require('../test/fixtures/short-outcome.cjs');
async function main(){
  const compiled=compile(),rows=[],seed=ethers.id('short gas experiment v1');
  for(const profile of ['normal','all-admitted'])for(const n of [10,50,100,250,500,1000]){
    const f=await fixture(compiled),rules=profile==='normal'?normalRules:nearCertainRules;
    const ps=participants(n,profile==='normal'?undefined:1000000),draw=await f.freeze(ps,rules);
    const expected=model.compute(draw.context,seed,ps,rules,draw.prizes);
    if(profile==='all-admitted')assert.equal(expected.admittedCount,BigInt(n),'Expected worst admission sample; do not silently relabel');
    const data=f.source.interface.encodeFunctionData('settle',[draw.request.drawId,seed,ps]);
    const receipt=await sent(f.source.settle(draw.request.drawId,seed,ps));
    const events=receipt.logs.filter(l=>l.address===f.source.target).map(l=>f.source.interface.parseLog(l));
    const measured=events.find(e=>e.name==='Measured'),terminal=events.find(e=>e.name==='AttemptsConsumed');
    assert.equal(terminal.args.resultHash,expected.resultHash);
    const awarded=expected.amounts.reduce((a,b)=>a+b,0n),returned=draw.request.budget-awarded;
    assert.equal(await f.vault.freeShort(),returned);assert.equal(await f.vault.claimable(f.quote.target),awarded);
    assert.equal(await f.vault.reserved(f.quote.target),0n);
    const block=await f.provider.getBlock(receipt.blockNumber);
    rows.push({profile,n,k:draw.prizes.length,rules,weights:draw.basket.weights,budget:draw.request.budget,seed,
      context:draw.context,attemptSnapshotHash:draw.request.attemptSnapshotHash,evmParticipantsHash:draw.request.evmParticipantsHash,
      resultHash:expected.resultHash,admitted:expected.admittedCount,winners:expected.winners.length,awarded,returned,
      calldataBytes:(data.length-2)/2,freezeGas:draw.receipt.gasUsed,verificationGas:measured.args.verificationGas,
      finalizeGas:measured.args.finalizeGas,totalTransactionGas:receipt.gasUsed,localBlockGasLimit:block.gasLimit});
    console.log(`${profile} N=${n}: ${receipt.gasUsed} gas, ${(data.length-2)/2} calldata bytes, ${expected.winners.length} winners`);
  }
  const files=['contracts/ShortOutcome.sol','contracts/ShortDrawCommitment.sol','contracts/PromoVault.sol',
    'test/contracts/ShortOutcomeFixture.sol','test/fixtures/short-outcome.cjs','scripts/short-outcome.cjs','scripts/short-outcome-gas.cjs'];
  const report={schema:'short-outcome-gas-v1',environment:{chainId:31337,hardfork:'cancun',solc:require('solc').version(),optimizerRuns:200},
    limits:'Local fixture only. Includes test terminal gas, excludes production seed authentication/scheduling and L1 data fees. All-admitted is not worst-case rank insertion. Block hashes/context may vary between runs.',
    sourceHashes:Object.fromEntries(files.map(file=>[file,ethers.keccak256(ethers.toUtf8Bytes(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')))])),rows};
  const output=path.resolve('research/short-outcome-gas.json');
  fs.writeFileSync(output,JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
  console.log(`Saved ${output}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
