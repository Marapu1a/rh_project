// Read-only whole-range project log audit; one RPC remains a stated trust boundary.
const D=require('./direct-buy.cjs'),P=require('./project-history.cjs');
const check=(v,m)=>{if(!v)throw Error('Project audit: '+m);},n=x=>Number(BigInt(x)),low=x=>String(x).toLowerCase();
function identity(l){check(!l.removed,'removed log');return JSON.stringify([n(l.blockNumber),low(l.blockHash),low(l.transactionHash),n(l.logIndex??l.index),low(l.address),l.topics.map(low),low(l.data)]);}
async function audit({config,state,rpc,extra=[],pageSize=10000}){
 const {checksum,...stored}=state;check(require('./indexer-checksum.cjs').validIndexerChecksum(stored,checksum),'checksum');check(stored.configHash===D.hash({kind:'persistent-buy-indexer-v1',config}),'config identity');
 check(Number.isInteger(pageSize)&&pageSize>0&&pageSize<=10000,'page size');
 const m=config.manifest,input=state.index.manifest,head=state.index.head,headHash=state.index.blocks.at(-1).hash,from=n(m.anchor.number)+1;
 check(BigInt(await rpc('eth_chainId',[]))===BigInt(m.chainId),'chain');
 const final=await rpc('eth_getBlockByNumber',['finalized',false]);check(n(final.number)>=head,'unfinalized head');
 const boundary=async()=>{check(low((await rpc('eth_getBlockByNumber',['0x'+head.toString(16),false])).hash)===low(headHash),'head changed');check(low((await rpc('eth_getBlockByNumber',['0x'+n(m.anchor.number).toString(16),false])).hash)===low(m.anchor.hash),'anchor changed');};await boundary();
 const addresses=P.watched(input,config.lifecycle,[config.buyPolicy?.source,...extra]),expected=new Set(),actual=new Set();
 for(const b of state.index.blocks)for(const row of b.transactions)for(const l of row.receipt.logs)if(P.relevant(l,m,addresses))expected.add(identity(l));
 let requests=0;for(let start=from;start<=head;start+=pageSize){const end=Math.min(head,start+pageSize-1),range={fromBlock:'0x'+start.toString(16),toBlock:'0x'+end.toString(16)};
 const filters=[{...range,address:addresses}];if(m.manager&&m.poolId)filters.push({...range,address:m.manager,topics:[null,m.poolId]});
 for(const f of filters){const logs=await rpc('eth_getLogs',[f]);requests++;check(Array.isArray(logs),'log response');for(const l of logs){check(n(l.blockNumber)>=start&&n(l.blockNumber)<=end&&P.relevant(l,m,addresses),'out-of-range log');actual.add(identity(l));}}}
 await boundary();const missing=[...actual].filter(x=>!expected.has(x)),extraSaved=[...expected].filter(x=>!actual.has(x));check(!missing.length&&!extraSaved.length,`log mismatch: missing=${missing.length}, extraSaved=${extraSaved.length}`);
 return {schema:'project-log-audit-v1',trust:'same QuickNode source; consistency, not independent execution proof',configHash:stored.configHash,stateChecksum:checksum,fromBlock:from,head,headHash,addresses,logs:actual.size,logIdentityHash:D.hash([...actual].sort()),requests,checkedAt:new Date().toISOString(),matched:true};
}
module.exports={audit,identity};
