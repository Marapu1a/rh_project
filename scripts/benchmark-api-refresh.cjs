// Same synthetic admitted workload as benchmark-pons-admitted; no network/signing.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {fixture}=require('./benchmark-pons-admitted.cjs');
const {indexOnce}=require('./persistent-buy-indexer.cjs');
const {createReader}=require('./user-status-api.cjs');
async function worker(dir,size){
 const statePath=path.join(dir,`state-${size}.json`),f=fixture(size,statePath);let result;
 do{result=await indexOnce({...f,statePath,batchSize:1000});}while(result.state==='catchingUp');
 const reader=createReader(f.config),rows=[];
 function measure(mode,expected){const t=performance.now();for(const [wallet,raw] of expected){const r=reader.read({wallet});assert.equal(r.status,'observed');for(const kind of ['SHORT','MONTHLY'])assert.equal(r.balances[kind].open,String(raw/100000000n));assert.equal(r.balances.carryRaw,String(raw%100000000n));}rows.push({mode,elapsedMs:performance.now()-t,metrics:reader.metrics(),peakRssKiB:process.resourceUsage().maxRSS});}
 measure('cold',f.expected);await indexOnce({...f,statePath,batchSize:1000});measure('idle-refresh',f.expected);
 const next=fixture(size+1,statePath);await indexOnce({...next,statePath,batchSize:1000});measure('append-refresh',next.expected);
 console.log(JSON.stringify({size,stateBytes:fs.statSync(statePath).size,rows}));
}
async function main(){
 if(process.argv[2]==='--worker')return worker(path.resolve(process.argv[3]),Number(process.argv[4]));
 const dir=process.argv[2],sizes=(process.argv[3]||'1000,5000,10000').split(',').map(Number);
 if(!dir||fs.existsSync(dir)||sizes.some(n=>!Number.isSafeInteger(n)||n<100||n>20000))throw Error('New output directory and sizes 100..20000 required');
 fs.mkdirSync(dir,{recursive:true});const report={date:new Date().toISOString(),scope:'Synthetic admitted curve, 100 wallets; same API reader across idle and append snapshots; no HTTP, public reserves or draw events',results:[]};
 for(const size of sizes){const p=spawnSync(process.execPath,[__filename,'--worker',path.resolve(dir),String(size)],{encoding:'utf8',timeout:300000});if(p.status!==0)throw Error(p.stderr||String(p.error));const row=JSON.parse(p.stdout.trim());report.results.push(row);fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(size,row.rows.map(r=>r.mode+' '+Math.round(r.elapsedMs)+'ms').join(', '));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
