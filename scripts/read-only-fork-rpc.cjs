// Research transport only: rate-limit EDR's concurrent reads without changing state/results.
const http=require('node:http');
const {keccak256,toQuantity,isAddress}=require('ethers');
const allowed=new Set(['eth_chainId','net_version','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_getStorageAt','eth_getBalance','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_gasPrice','eth_call','eth_getLogs']);
async function startReadProxy(upstream) {
  let tail=Promise.resolve();
  const stats={requests:0,retries:0,errors:0};
  const cache=new Map(),emptyStorage=new Set();
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function forward(q) {
    if(!allowed.has(q.method)&&q.method!=='eth_getProof') return {jsonrpc:'2.0',id:q.id,error:{code:-32601,message:'Research proxy permits read-only RPC methods only'}};
    if(q.method==='eth_getStorageAt'&&emptyStorage.has(JSON.stringify([q.params[0].toLowerCase(),q.params[2]])))return {jsonrpc:'2.0',id:q.id,result:'0x'+'00'.repeat(32)};
    const key=JSON.stringify([q.method,q.params]);
    const mutable=/latest|pending|safe|finalized/.test(key)||['eth_blockNumber','eth_gasPrice'].includes(q.method);
    if(!mutable && cache.has(key))return {...cache.get(key),id:q.id};
    for(let attempt=0;attempt<4;attempt++) {
      stats.requests++;
      try {
        const r=await fetch(upstream,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(q),signal:AbortSignal.timeout(20000)});
        if(!r.ok)throw new Error(`upstream HTTP ${r.status}`);
        const j=await r.json();
        if(j.error && /rate|limit|too many/i.test(j.error.message))throw new Error(j.error.message);
        if(!mutable && 'result' in j)cache.set(key,j);
        if(j.error)stats.errors++;
        await sleep(60);
        return {...j,id:q.id};
      }catch(e) {
        if(attempt===3){stats.errors++;return {jsonrpc:'2.0',id:q.id,error:{code:-32000,message:`Read proxy transport failure: ${e.message}`}};}
        stats.retries++;await sleep(1000*(attempt+1));
      }
    }
  }
  const server=http.createServer(async(req,res)=>{
    try {
      let body='';for await(const chunk of req)body+=chunk;
      const request=JSON.parse(body);
      const handle=q=>{const work=tail.then(()=>forward(q));tail=work.catch(()=>{});return work;};
      const result=Array.isArray(request)?await Promise.all(request.map(handle)):await handle(request);
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));
    }catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  async function pinEmptyStorage(address,blockNumber){
    if(!isAddress(address)||!Number.isSafeInteger(blockNumber)||blockNumber<0)throw Error('Explicit address/block required');
    const tag=toQuantity(blockNumber),a=address.toLowerCase();
    const reply=await forward({jsonrpc:'2.0',id:1,method:'eth_getProof',params:[a,[],tag]});
    if(reply.error)throw Error('Empty storage snapshot unavailable: '+reply.error.message);
    const proof=reply.result;
    const zero='0x'+'00'.repeat(32);
    const absent=proof&&proof.storageHash===zero&&proof.codeHash===zero&&BigInt(proof.nonce)===0n&&BigInt(proof.balance)===0n&&Array.isArray(proof.accountProof)&&proof.accountProof.length>0;
    const empty=proof&&proof.storageHash===keccak256('0x80')&&proof.codeHash===keccak256('0x');
    if(!proof||proof.address.toLowerCase()!==a||!empty&&!absent)throw Error('Account is not proven empty at fork anchor');
    // This is the base state at one fixed block, not local post-deployment storage.
    // EDR still owns every deployment/write. Never substitute values for live accounts.
    emptyStorage.add(JSON.stringify([a,tag]));return {address:a,blockNumber,storageHash:proof.storageHash,codeHash:proof.codeHash};
  }
  return {url:`http://127.0.0.1:${server.address().port}`,stats,pinEmptyStorage,close:()=>{server.closeAllConnections();server.close();}};
}
module.exports={startReadProxy};
