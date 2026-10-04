const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('crypto');
const {canonical}=require('../scripts/direct-buy.cjs'),{indexerChecksum}=require('../scripts/indexer-checksum.cjs'),{jsonChunks}=require('../scripts/indexer-json.cjs'),{pagedLogs}=require('../scripts/paged-log-read.cjs');
test('chunked snapshot preserves historical checksum and exact JSON bytes',()=>{
 for(let n=0;n<30;n++){const state={schema:'x',index:{blocks:Array.from({length:n*100},(_,i)=>({number:i,hash:'0x'+'a'.repeat(64),nested:{z:[null,true,'юникод\\"'],a:i}}))},jobs:{SHORT:[],MONTHLY:[]}};
 assert.equal(indexerChecksum(state),'sha256-v1:'+createHash('sha256').update(canonical(state)).digest('hex'));
 assert.equal([...jsonChunks(state)].join(''),JSON.stringify(state));}
});
test('paged logs partitions range and rejects incomplete or out of range pages',async()=>{
 const calls=[];const rows=await pagedLogs(7,20007,async(a,b)=>{calls.push([a,b]);return [{blockNumber:a}]});
 assert.deepEqual(calls,[[7,10006],[10007,20006],[20007,20007]]);assert.equal(rows.length,3);
 await assert.rejects(pagedLogs(0,20000,async(a)=>{if(a)throw Error('outage');return []}),/outage/);
 await assert.rejects(pagedLogs(0,1,async()=>[{blockNumber:2}]),/outside/);
 await assert.rejects(pagedLogs(0,1,async()=>[{blockNumber:1,removed:true}]),/outside/);
 assert.deepEqual(await pagedLogs(2,1,()=>assert.fail()),[]);
});
