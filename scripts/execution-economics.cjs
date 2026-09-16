// Small cash-flow sensitivity model, NOT a controller or a fee forecast.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const evidence=require('../research/short-scaling-study.json').streaming;
const a=evidence.find(x=>x.n===1000&&x.k===10),b=evidence.find(x=>x.n===5000&&x.k===10);
const slope=(Number(b.totalGas)-Number(a.totalGas))/4000;
const intercept=Number(a.totalGas)-slope*1000;
const round=x=>Math.round(x*100)/100;
// Linear interpolation/extrapolation, especially uncertain below N=1000.
function drawCost(n,multiplier=1){return (intercept+slope*n)*0.065e-9*2400*1.5*multiplier+1;}
function simulate({volume,rate=.005,share=.2,entriesPerWallet=5,spike=1,stop=false}){
  let ops=100,short=100,otherPrize=100,income=0,spent=0,paid=0,carry=0,open=0,draws=0,waits=0,minimumOps=ops,unpaidInfra=0;
  const months=[];
  for(let day=1;day<=90;day++){
    const daily=stop&&day>30?0:volume;
    const mult=day>=31&&day<=37?spike:1;
    // $1/day infrastructure and $5/month Monthly execution allowance, not quotes.
    const fixed=1+(day%30===0?5:0);const payable=Math.min(ops,fixed);
    ops-=payable;spent+=payable;unpaidInfra+=fixed-payable;
    for(let slot=0;slot<4;slot++){
      const revenue=daily/4*rate;income+=revenue;ops+=revenue*share;
      short+=revenue*(1-share)/2;otherPrize+=revenue*(1-share)/2;
      carry+=daily/4*.5/100;const minted=Math.floor(carry+1e-9);carry-=minted;open+=minted;
      if(short>=100&&open>0){
        const cost=drawCost(Math.ceil(open/entriesPerWallet),mult);
        // Candidate gate: max $20, max 10% of net prize, leave $10 operational buffer.
        if(cost<=20&&cost<=short*.1&&ops>=cost+10){ops-=cost;spent+=cost;paid+=short;short=0;open=0;draws++;}
        else waits++;
      }
      minimumOps=Math.min(minimumOps,ops);
    }
    if(day%30===0)months.push({day,ops:round(ops),draws,paid:round(paid),unpaidInfra:round(unpaidInfra)});
  }
  assert(Math.abs(300+income-(ops+short+otherPrize+spent+paid))<1e-6,'Conservation');
  assert(ops>=0&&short>=0&&otherPrize>=0,'Negative reserve');
  return {volume,rate,share,entriesPerWallet,spike,stop,draws,waitSlots:waits,opsEnd:round(ops),opsMin:round(minimumOps),
    expenses:round(spent),prizesAssigned:round(paid),freePrizes:round(short+otherPrize),openEntries:open,unpaidInfra:round(unpaidInfra),months};
}
const results=[];
for(const rate of [.002,.005])for(const volume of [1000,5000,10000,25000,50000,100000])results.push(simulate({volume,rate}));
for(const extra of [{share:.1},{entriesPerWallet:1},{volume:50000,spike:10},{volume:50000,spike:50},{stop:true},{volume:0}])results.push(simulate({volume:5000,rate:.002,...extra}));
const report={assumptions:{days:90,initialOps:100,initialPrizes:200,buyFraction:.5,entryUSD:100,entriesPerWallet:5,
  creatorRates:[.002,.005],opsShare:.2,shortFractionOfPrizes:.5,minShort:100,maxDrawsPerDay:4,
  gasGwei:.065,ethUSD:2400,executionMargin:1.5,extraPerDrawUSD:1,infrastructurePerDayUSD:1,monthlyExecutionUSD:5,
  gate:{absoluteUSD:20,relative:.1,remainingOpsUSD:10},fit:{intercept,slope}},results};
fs.writeFileSync('research/execution-economics.json',JSON.stringify(report,null,2)+'\n');
console.table(results.map(({volume,rate,share,entriesPerWallet,spike,stop,draws,opsEnd,expenses,unpaidInfra})=>({volume,rate,share,entriesPerWallet,spike,stop,draws,opsEnd,expenses,unpaidInfra})));
console.log('Cash conservation checked in every scenario. No network calls.');
