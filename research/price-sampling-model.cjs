// Source-level counterexample, not an EVM exploit or live-market measurement.
const assert = require('node:assert/strict');
function consult(observations, now) {
  const end = observations.at(-1).time;
  if (now-end > 300) throw new Error('stale');
  const target=end-1800;
  let cursor=end, weighted=0;
  for(let i=observations.length-2;i>=0;i--) {
    const o=observations[i], from=Math.max(o.time,target);
    if(cursor>from) weighted+=o.tick*(cursor-from);
    if(o.time<=target) return Math.trunc(weighted/1800);
    cursor=o.time;
  }
  throw new Error('history');
}
// At t=3600 a swap changes tick 0 -> 10000; next swap at t=5400.
// Hook stores pre-swap ticks. Its window [3600,5400] weights tick 0.
const observations=[{time:3600,tick:0},{time:5400,tick:10000}];
assert.equal(consult(observations,5400),0);
const actualIntervalTick=10000;
assert.notEqual(consult(observations,5400),actualIntervalTick);
assert.equal(consult([{time:3600,tick:42},{time:5400,tick:42}],5400),42);
assert.throws(()=>consult(observations,5701),/stale/);
assert.throws(()=>consult([{time:4000,tick:0},{time:5400,tick:10000}],5400),/history/);
console.log(JSON.stringify({checks:4,hookTick:0,actualIntervalTick,priceRatio:Math.pow(1.0001,actualIntervalTick)}));
