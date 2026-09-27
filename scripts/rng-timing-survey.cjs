const fs=require('node:fs'),{observe}=require('./rng-timing-observe.cjs'),{assessDrandTiming}=require('./drand-timing-readiness.cjs');
const CANDIDATES={fork60:{lead:60n,maxClockLag:30n,maxClockAhead:5n,maxFinalizedLag:20n,maxBeaconLag:15n},candidate1800:{lead:1800n,maxClockLag:30n,maxClockAhead:5n,maxFinalizedLag:1200n,maxBeaconLag:15n},fixture3600:{lead:3600n,maxClockLag:30n,maxClockAhead:5n,maxFinalizedLag:1800n,maxBeaconLag:15n}};
function summarize(samples){
 const rows=samples.map(s=>{
  const errors=[];for(const k of ['chainId','latest','finalized'])if(!s[k]?.value)errors.push(k+':'+(s[k]?.error||'missing'));

  if(!s.drand?.beacon?.value)errors.push('missingBeacon');
  if(errors.length)return {rpcUrl:s.rpcUrl,observedAt:s.observedAt,errors};
  try{
   if(BigInt(s.chainId.value)!==4663n)throw Error("wrongChain");
   const gap=BigInt(s.latest.value.number)-BigInt(s.finalized.value.number);
   if(gap<0n)throw Error("finalizedAheadOfLatest");
   const now=BigInt(Math.floor(Date.parse(s.observedAt)/1000)),latestTimestamp=BigInt(s.latest.value.timestamp),finalizedTimestamp=BigInt(s.finalized.value.timestamp),beaconRound=BigInt(s.drand.beacon.value.round);
   const beaconTimestamp=1727521075n+(beaconRound-1n)*3n;
   return {rpcUrl:s.rpcUrl,observedAt:s.observedAt,finalizedBlockLag:String(gap),fitsRecentWindowAtNextBlock:gap+1n<=256n,clockLag:String(now-latestTimestamp),finalizedLag:String(now-finalizedTimestamp),beaconLag:String(now-beaconTimestamp),assessments:Object.fromEntries(Object.entries(CANDIDATES).map(([k,v])=>[k,assessDrandTiming({now,latestTimestamp,finalizedTimestamp,beaconRound,...v})]))};
  }catch(e){return {rpcUrl:s.rpcUrl,observedAt:s.observedAt,errors:[e.message]};}
 });
 return {rows,valid:rows.filter(r=>!r.errors).length,total:rows.length,limitation:'Bounded non-atomic RPC observations; HTTP beacons are not authenticated by this summary. No worst-case bound, consensus proof or launch authorization.'};
}
async function survey({endpoints,count=6,intervalMs=15000,onSample=()=>{}}){
 if(!Array.isArray(endpoints)||!endpoints.length||endpoints.length>4||new Set(endpoints).size!==endpoints.length||!Number.isInteger(count)||count<1||count>12||!Number.isInteger(intervalMs)||intervalMs<1000||intervalMs>30000)throw Error('Invalid bounded survey');
 for(const endpoint of endpoints){const u=new URL(endpoint);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('HTTP(S) RPC required');}
 const samples=[];for(let i=0;i<count;i++){const batch=await Promise.all(endpoints.map(rpcUrl=>observe({rpcUrl})));samples.push(...batch);await onSample(batch,i);if(i+1<count)await new Promise(r=>setTimeout(r,intervalMs));}
 return {schema:'rng-timing-survey-v1',startedAt:samples[0].latest.startedAt,finishedAt:new Date().toISOString(),samples,summary:summarize(samples)};
}
if(require.main===module){const [out,...endpoints]=process.argv.slice(2);if(!out||fs.existsSync(out))throw Error('New output path required');survey({endpoints,onSample:(_,i)=>console.log('completed observation '+(i+1))}).then(x=>{fs.writeFileSync(out,JSON.stringify(x,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(x.summary));}).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={survey,summarize};
