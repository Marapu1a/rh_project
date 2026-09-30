const {test}=require('node:test'),assert=require('node:assert/strict');
const {AbiCoder,id}=require('ethers');
const {encodeLaunch,TYPE}=require('../scripts/prepare-pair-launch.cjs');
test('draft PAIR calldata directs 3% creator revenue to collector, with single USDG pool',()=>{
 const coder=AbiCoder.defaultAbiCoder(),owner='0x'+'1'.repeat(40),collector='0x'+'2'.repeat(40),quote='0x'+'5'.repeat(40);
 const input={identity:[owner,'QIANQI','QIANQI','https://example.invalid/draft',id('metadata')],collector,quote,salt:id('salt'),deadline:1200,candidate:{quoteDecimals:6,sqrtPriceX96:'149396238185475008709',tickLower:-401800,tickUpper:401800,observedAt:1000,routeEvidence:id('route')}};
 const [p]=coder.decode([TYPE],encodeLaunch(input));
 assert.equal(p.mode,1n);assert.equal(p.feeBps,300n);assert.equal(coder.decode(['address'],p.modeData)[0],collector);assert.notEqual(collector,owner);
 assert.equal(p.allocations.length,1);assert.equal(p.allocations[0].quoteToken,quote);assert.equal(p.allocations[0].weightBps,10000n);
 assert.equal(p.sniperProtection,false);assert.equal(p.protectionBlocks,0n);assert.equal(p.policyEffectiveAt,0n);assert.equal(p.holderExcluded.length,0);
 const o=coder.decode(['uint8','uint160','int24','int24','uint256','bytes32','uint160','bool'],p.openingData[0]);
 assert.equal(o[1],BigInt(input.candidate.sqrtPriceX96));assert.equal(o[6],o[1]*2n);assert.equal(o[7],true);
 assert.deepEqual(Array.from(coder.decode(['string','string','string','bytes32'],p.identityData)),input.identity.slice(1));
});
