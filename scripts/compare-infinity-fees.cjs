// Scenario arithmetic, not a live quote or an Infinity integration.
// V is the quote-denominated policy-fee base, NOT necessarily UI trade volume.
const assert=require('node:assert/strict');
const RAW=1000000n;
function allocation(volume,percent,next=0n){
 const revenue=BigInt(volume)*RAW*BigInt(percent)/100n;
 const project=revenue/10n,prize=revenue-project,short=prize/2n;
 const missing=100n*RAW-next,nominalNext=prize/6n;
 assert(missing>=0n);const toNext=nominalNext<missing?nominalNext:missing;
 const current=prize-short-toNext;
 assert.equal(project+short+current+toNext,revenue);
 return {revenue,project,short,current,next:toNext};
}
const money=n=>Number(n)/1e6;
const output={assumptions:{projectShare:0.1,prizeShare:0.9,nextTarget:100,
 source:'https://pair.fund/docs',checked:'2026-09-27',protocolFeeBps:30,
 caveat:'Documentation-level model; pool/router/gas costs excluded. No live fee-base or recipient-vault verification.'},rates:[]};
for(let fee=1;fee<=5;fee++){
 const daily=[1000,5000,10000,25000,50000,100000].map(volume=>{
  const a=allocation(volume,fee),b=allocation(volume,fee,100n*RAW);
  assert.equal(a.short,b.short);assert.equal(a.current+a.next,b.current);
  return {volume,...Object.fromEntries(Object.entries(a).map(([k,v])=>[k,money(v)])),
   shortPerSixHours:money(a.short)/4,hoursToFirst100:Math.max(6,2400/money(a.short))};
 });
 const monthly=allocation(10000*30,fee);
 output.rates.push({fee,daily,minDailyVolumeForFour100Shorts:400/(0.45*fee/100),
  feeOn100BuyPlus100Sell:2*(fee+0.3),
  monthAt10000DailyNoJackpotSettlement:Object.fromEntries(Object.entries(monthly).map(([k,v])=>[k,money(v)]))});
}
assert.deepEqual(allocation(10000,2),{revenue:200000000n,project:20000000n,short:90000000n,current:60000000n,next:30000000n});
assert.equal(allocation(300000,2).current,2600000000n);
console.log(JSON.stringify(output,null,2));
