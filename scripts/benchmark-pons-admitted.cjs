// Local synthetic admitted curve load. No network RPC, signer or real funds.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),E=require('ethers');
const D=require('./direct-buy.cjs'),P=require('./pons-curve-buy.cjs');
const {indexOnce,readSnapshot}=require('./persistent-buy-indexer.cjs');
const {ABI}=require('./buy-policy-admission.cjs'),F=require('./buy-policy-format.cjs');
const {createReader,createAsyncReader}=require('./user-status-api.cjs');
const addr=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
function fixture(size,statePath){
 const f=require('../test/fixtures/pons-indexer.cjs').fixture({after(){}}),m=f.m;
 // Registry is a lifecycle domain field; the automatic curve route does not use it.
 m.registry=addr(800);const source=addr(900),publisher=addr(901),instanceId=E.id('admitted load');
 const trust={source,publisher,instanceId,sourceCodeHash:E.keccak256('0x01'),genesisHash:D.hash(m),chainId:4663,noticeBlocks:20};
 const lifecycle={schema:'attempt-lifecycle-v1',source:addr(902),sourceCodeHash:E.keccak256('0x01'),instanceId,vault:addr(903)};
 const config={manifest:m,buyPolicy:trust,lifecycle,indexer:{statePath,maxAgeSeconds:60}};
 const blocks=[],receipts=new Map(),expected=new Map(),counters={};
 for(let i=0;i<size;i++){
  const n=i+11,wallet=addr(1000+i%100),amount=Math.floor(i/100)%2?40000000n:60000000n;
  expected.set(wallet,(expected.get(wallet)||0n)+amount);
  const bh=E.id('admitted-load-block-'+n),th=E.id('admitted-load-tx-'+n),logs=[];
  const emit=(abi,event,args,address)=>logs.push({address,...abi.encodeEventLog(abi.getEvent(event),args),blockHash:bh,blockNumber:n,transactionHash:th,transactionIndex:0,logIndex:logs.length,removed:false});
  emit(P.TRANSFER,'Transfer',[wallet,m.curve,amount],m.quote);emit(P.TRANSFER,'Transfer',[m.curve,wallet,amount*2n],m.token);
  emit(P.EVENTS,'CurveBuy',[wallet,wallet,amount,amount*2n,amount/100n,amount*3n/100n],m.curve);
  const tx={hash:th,blockHash:bh,blockNumber:n,transactionIndex:0,from:wallet,to:m.curve,chainId:4663,value:'0x0',input:P.CALL.encodeFunctionData('buy',[amount,amount*2n,wallet])};
  const receipt={transactionHash:th,blockHash:bh,blockNumber:n,transactionIndex:0,from:wallet,to:m.curve,status:1,logs};
  receipts.set(th,receipt);blocks.push({number:n,hash:bh,parentHash:blocks.at(-1)?.hash??m.anchor.hash,timestamp:n,transactions:[tx]});
 }
 const rpc=async(method,params=[])=>{
  counters[method]=(counters[method]||0)+1;
  if(method==='eth_getLogs')return [];
  if(method==='eth_getBlockByNumber'){const n=params[0]==='finalized'?size+10:Number(BigInt(params[0]));if(n===10)return m.anchor;const b=blocks[n-11];assert(b,'missing block');return {...b,transactions:params[1]?b.transactions:[]};}
  if(method==='eth_getTransactionReceipt')return receipts.get(params[0]);
  if(method==='eth_call'&&params[0].to===source){const name=ABI.parseTransaction({data:params[0].data}).name;
   const values={instanceId,genesisHash:trust.genesisHash,publisher,noticeBlocks:20,SCHEMA_VERSION:1,genesisAdaptersHash:F.genesisAdaptersHash(m),publishedCount:0,currentHash:trust.genesisHash,lastFromBlock:0};return ABI.encodeFunctionResult(name,[values[name]]);}
  return f.rpc(method,params);
 };
 return {config,rpc,counters,expected};
}
async function worker(dir,size,mode){
 const statePath=path.join(dir,'state-'+size+'.json'),count=size+(['append','restart','api','restore'].includes(mode)?1:0);
 const f=fixture(count,statePath),start=performance.now();let result,api;
 if(mode==='seed'){do{result=await indexOnce({...f,statePath,batchSize:1000});}while(result.state==='catchingUp');}
 else if(mode==='api'){
  const reader=createReader(f.config),t=performance.now();
  for(const [wallet,raw] of f.expected){const r=reader.read({wallet});assert.equal(r.status,'observed');for(const kind of ['SHORT','MONTHLY'])assert.equal(r.balances[kind].open,String(raw/100000000n));assert.equal(r.balances.carryRaw,String(raw%100000000n));}
  const coldAndWalletsMs=performance.now()-t,warm=[];
  for(let i=0;i<1000;i++){const t=performance.now();assert.equal(reader.read({wallet:addr(1000+i%100)}).status,'observed');warm.push(performance.now()-t);}
  const asyncReader=createAsyncReader(f.config),at=performance.now();let parallel;
  try{parallel=await Promise.all(Array.from({length:32},(_,i)=>asyncReader.read({wallet:addr(1000+i)})));assert(parallel.every(r=>r.status==='observed'));}finally{await asyncReader.close();}
  warm.sort((a,b)=>a-b);api={coldAndWalletsMs,warmP95Ms:warm[949],parallel32Ms:performance.now()-at,cache:reader.metrics()};
 }else{
  if(mode==='restore'){const good=fs.readFileSync(statePath);fs.writeFileSync(statePath+'.backup',good);fs.writeFileSync(statePath,'{"broken":');assert.equal(createReader(f.config).read({wallet:addr(1000)}).status,'unavailable');fs.writeFileSync(statePath+'.restore',fs.readFileSync(statePath+'.backup'));fs.renameSync(statePath+'.restore',statePath);}
  result=await indexOnce({...f,statePath,batchSize:1000});
  assert.equal(result.metrics.scannedBlocks,mode==='append'?1:0);
  assert.equal(result.metrics.replayedBlocks,mode==='append'?1:0);
 }
 const elapsedMs=performance.now()-start,state=JSON.parse(fs.readFileSync(statePath));assert.equal(state.index.policyStatus.mode,'admitted');
 assert.equal(state.index.ledger.decisions.length,count);assert(state.index.ledger.decisions.every(d=>d.status==='ELIGIBLE'));
 for(const w of state.index.ledger.wallets){const raw=f.expected.get(w.wallet);assert.equal(w.entriesMinted,String(raw/100000000n));assert.equal(w.carryRaw,String(raw%100000000n));}
 assert.equal(state.index.ledger.wallets.length,f.expected.size);
 const t=performance.now();await readSnapshot({config:f.config,statePath,manifest:state.index.manifest,cutoff:count+10,rpc:f.rpc});const consumerMs=performance.now()-t;
 console.log(JSON.stringify({size,mode,elapsedMs,consumerMs,peakRssKiB:process.resourceUsage().maxRSS,stateBytes:fs.statSync(statePath).size,rpc:f.counters,metrics:result?.metrics,ledgerHash:state.index.ledgerHash,api}));
}
async function main(){
 if(process.argv[2]==='--worker')return worker(path.resolve(process.argv[3]),Number(process.argv[4]),process.argv[5]);
 const dir=process.argv[2],sizes=(process.argv[3]||'100,1000,5000').split(',').map(Number);
 if(!dir||fs.existsSync(dir)||sizes.some(n=>!Number.isSafeInteger(n)||n<100||n>20000))throw Error('Supply a new directory and sizes 100..20000');
 fs.mkdirSync(dir,{recursive:true});const report={date:new Date().toISOString(),scope:'Synthetic admitted Pons curve: one BUY/block, 100 wallets; mock policy/runtime/RPC; lifecycle v1 open balances, no freezes/payouts/public reserves; fresh OS process per pass',rows:[]};
 for(const size of sizes)for(const mode of ['seed','idle','append','restart','api','restore']){
  const p=spawnSync(process.execPath,[__filename,'--worker',path.resolve(dir),String(size),mode],{encoding:'utf8',timeout:300000,maxBuffer:1024*1024});
  if(p.status!==0)throw Error(p.stderr||String(p.error));const row=JSON.parse(p.stdout.trim());report.rows.push(row);
  const prev=report.rows.find(r=>r.size===size&&r.mode==='append');if(prev&&['restart','api','restore'].includes(mode))assert.equal(row.ledgerHash,prev.ledgerHash);
  fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(size,mode,Math.round(row.elapsedMs)+'ms',row.stateBytes+' bytes');
 }
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture};
