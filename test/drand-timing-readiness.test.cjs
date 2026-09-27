const {test}=require('node:test'),assert=require('node:assert/strict');
const {assessDrandTiming:assess}=require('../scripts/drand-timing-readiness.cjs');
const g=1727521075n,now=g+300000n;
const input={now,latestTimestamp:now,finalizedTimestamp:now-1200n,beaconRound:100001n,lead:3600n,maxClockLag:30n,maxClockAhead:5n,maxFinalizedLag:1800n,maxBeaconLag:15n};
test('timing observation never authorizes freeze; healthy candidate has future target',()=>{const r=assess(input);assert.equal(r.status,'observedHealthy');assert.equal(r.authorizationToFreeze,false);assert(BigInt(r.targetTime)>now+3600n);});
test('stale chain clock exposing a known beacon is detected',()=>{const r=assess({...input,latestTimestamp:now-7200n,finalizedTimestamp:now-8000n});assert(r.reasons.includes('staleChainClock'));assert(r.reasons.includes('targetAlreadyKnown'));});
test('overheated finality, stale beacon and insufficient lead wait',()=>{assert(assess({...input,finalizedTimestamp:now-2000n}).reasons.includes('finalityLag'));assert(assess({...input,beaconRound:99900n}).reasons.includes('staleBeacon'));assert(assess({...input,lead:2n}).reasons.includes('insufficientObservedHeadroom'));});
test('invalid/missing observations cannot pass and later degradation is re-evaluated',()=>{assert.throws(()=>assess({...input,beaconRound:undefined}));assert.throws(()=>assess({...input,finalizedTimestamp:now+1n}));assert.equal(assess(input).status,'observedHealthy');assert.equal(assess({...input,now:now+3601n}).status,'wait');});
