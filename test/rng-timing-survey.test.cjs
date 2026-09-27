const test=require('node:test'),assert=require('node:assert/strict');
const {summarize,survey}=require('../scripts/rng-timing-survey.cjs');
const evidence=require('../research/public-deployment/timing-2026-09-28.json');
test('saved observations distinguish timing headroom from incompatible cutoff window',()=>{
 const s=summarize(evidence.samples);assert.equal(s.valid,12);
 for(const r of s.rows){assert.equal(r.fitsRecentWindowAtNextBlock,false);assert.equal(r.assessments.candidate1800.authorizationToFreeze,false);assert.equal(r.assessments.fork60.status,'wait');}
});
test('cutoff window includes next execution block and rejects inconsistent heads',()=>{
 const s=structuredClone(evidence.samples[0]);s.latest.value.number='1000';
 for(const [gap,ok] of [[255,true],[256,false]]){s.finalized.value.number=String(1000-gap);assert.equal(summarize([s]).rows[0].fitsRecentWindowAtNextBlock,ok);}
 s.finalized.value.number='1001';assert.deepEqual(summarize([s]).rows[0].errors,['finalizedAheadOfLatest']);
});
test('malformed and unavailable RPC data remain diagnostic failures',()=>{
 for(const value of ['0x1','garbage']){const s=structuredClone(evidence.samples[0]);s.chainId.value=value;assert.equal(summarize([s]).valid,0);}
 const s=structuredClone(evidence.samples[0]);s.finalized={error:'unavailable'};assert.equal(summarize([s]).valid,0);
});
test('survey bounds reject unsafe inputs before network access',async()=>{
 for(const options of [{endpoints:[]},{endpoints:['file:///tmp/a']},{endpoints:['https://user:pass@example.com']},{endpoints:['https://example.com'],count:13}])await assert.rejects(survey(options));
});
