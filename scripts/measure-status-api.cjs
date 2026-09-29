// Local synthetic non-BUY traffic over preserved legacy fork evidence. Not Infinity throughput.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture}=require('../test/fixtures/status-snapshot.cjs');
const {createReader,walletStatus}=require('./user-status-api.cjs');
const results=[];
for(const extra of [0,1000,5000]){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'status-measure-'));
 try{
  const f=fixture(dir,extra),reader=createReader(f.config),query={wallet:f.wallet};
  let start=performance.now();for(let i=0;i<5;i++)if(walletStatus({config:f.config,...query}).status==='unavailable')throw Error('Invalid baseline');
  const uncachedMeanMs=(performance.now()-start)/5;
  start=performance.now();reader.read(query);const coldMs=performance.now()-start;
  start=performance.now();for(let i=0;i<1000;i++)reader.read({wallet:'0x'+BigInt(i+1).toString(16).padStart(40,'0')});
  results.push({extraUnrelatedTransactions:extra,blocks:f.state.index.blocks.length,stateBytes:fs.statSync(f.config.indexer.statePath).size,uncachedMeanMs,coldMs,warmMeanMs:(performance.now()-start)/1000,cache:reader.metrics()});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
console.log(JSON.stringify({mode:'synthetic legacy history; admitted fixture only; no RPC, Infinity or production qualification',results},null,2));
