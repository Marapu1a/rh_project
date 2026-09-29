// Synthetic responsiveness probe, not a live Infinity or throughput qualification.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture}=require('../test/fixtures/status-snapshot.cjs');
const {createAsyncReader}=require('./user-status-api.cjs');
async function main(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'status-worker-measure-'));let reader,timer;
 try{
  const f=fixture(dir,5000);reader=createAsyncReader(f.config);
  let ticks=0,maxGapMs=0,last=performance.now();
  timer=setInterval(()=>{const now=performance.now();maxGapMs=Math.max(maxGapMs,now-last);last=now;ticks++;},10);
  let start=performance.now();const cold=await reader.read({wallet:f.wallet});const coldMs=performance.now()-start;
  clearInterval(timer);if(cold.status!=='observed')throw Error('Snapshot unavailable');
  start=performance.now();for(let i=0;i<100;i++)if((await reader.read({wallet:f.wallet})).status!=='observed')throw Error('Warm request failed');
  console.log(JSON.stringify({mode:'synthetic legacy 5013 blocks; no RPC or production qualification',coldMs,mainThreadTimerTicks:ticks,maxTimerGapMs:maxGapMs,warmRoundTripMeanMs:(performance.now()-start)/100},null,2));
 }finally{clearInterval(timer);reader?.close();fs.rmSync(dir,{recursive:true,force:true});}
}
if(require.main===module)main().catch(()=>{console.error('Measurement failed');process.exitCode=1;});
