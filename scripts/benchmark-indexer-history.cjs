// Synthetic Pons curve fixture, local disk only. No network or signer.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {id}=require('ethers'),{indexOnce}=require('./persistent-buy-indexer.cjs');
function chain(size){
 const f=require('../test/fixtures/pons-indexer.cjs').fixture({after(){}}),templates=structuredClone(f.blocks);
 f.blocks.length=0;const byNumber=new Map(),byTx=new Map();
 for(let i=0;i<size;i++){
  const n=11+i,b={number:n,hash:id('benchmark-block-'+n),parentHash:f.blocks.at(-1)?.hash??f.m.anchor.hash,timestamp:n,transactions:[]};
  if(i%10===0){const p=structuredClone(templates[(i/10)%2].transactions[0]),th=id('benchmark-tx-'+n);
   Object.assign(p.tx,{hash:th,blockHash:b.hash,blockNumber:n});Object.assign(p.receipt,{transactionHash:th,blockHash:b.hash,blockNumber:n});
   for(const l of p.receipt.logs)Object.assign(l,{transactionHash:th,blockHash:b.hash,blockNumber:n});
   b.transactions.push(p);byTx.set(th,p.receipt);
  }
  f.blocks.push(b);byNumber.set(n,b);
 }
 const counters={};const rpc=async(method,params=[])=>{
  counters[method]=(counters[method]||0)+1;
  if(method==='eth_getBlockByNumber'){
   const n=params[0]==='finalized'?f.blocks.at(-1).number:Number(BigInt(params[0]));if(n===10)return f.m.anchor;
   const b=byNumber.get(n);if(!b)throw Error('Missing fixture block');return {...b,transactions:params[1]?b.transactions.map(x=>x.tx):[]};
  }
  if(method==='eth_getTransactionReceipt')return byTx.get(params[0]);
  return f.rpc(method,params);
 };
 return {...f,rpc,counters};
}
async function worker(dir,size,mode){
 const f=chain(size+(mode==='append'||mode==='restart'?1:0)),statePath=path.join(dir,'state-'+size+'.json');
 let result;const started=performance.now();
 if(mode==='seed'){do{result=await indexOnce({config:f.config,rpc:f.rpc,statePath,batchSize:1000});}while(result.state==='catchingUp');}
 else result=await indexOnce({config:f.config,rpc:f.rpc,statePath,batchSize:1000});
 const elapsedMs=performance.now()-started,memory=process.resourceUsage().maxRSS;
 const state=JSON.parse(fs.readFileSync(statePath));
 console.log(JSON.stringify({size,mode,elapsedMs,peakRssKiB:memory,rpc:f.counters,metrics:result.metrics,cacheRows:Object.keys(state.index.cache).length,ledgerHash:state.index.ledgerHash,wallets:state.index.ledger.wallets}));
}
async function main(){
 if(process.argv[2]==='--worker')return worker(path.resolve(process.argv[3]),Number(process.argv[4]),process.argv[5]);
 const dir=process.argv[2];if(!dir||fs.existsSync(dir))throw Error('Supply a new output directory');
 const sizes=(process.argv[3]||'100,1000,5000').split(',').map(Number);if(sizes.some(n=>!Number.isSafeInteger(n)||n<10||n>50000))throw Error('Invalid fixture sizes');
 fs.mkdirSync(dir,{recursive:true});const report={date:new Date().toISOString(),scope:'Synthetic unadmitted Pons curve; one BUY per 10 blocks; mocked RPC; fresh OS process per pass; no lifecycle/public projection',rows:[]};
 for(const size of sizes)for(const mode of ['seed','idle','append','restart']){
  const p=spawnSync(process.execPath,[__filename,'--worker',path.resolve(dir),String(size),mode],{encoding:'utf8',timeout:300000});
  if(p.status!==0)throw Error(p.stderr||String(p.error));const row=JSON.parse(p.stdout.trim());report.rows.push(row);
  fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(size,mode,Math.round(row.elapsedMs)+'ms',row.metrics.stateBytes+' bytes',row.cacheRows+' cache rows');
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
