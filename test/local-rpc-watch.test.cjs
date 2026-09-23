const {test}=require('node:test'),assert=require('node:assert/strict');
const {transientRpc,retryableRead,runWatch,sleep}=require('../scripts/local-rpc-watch.cjs');
const transport=()=>Object.assign(Error('connection reset'),{code:'ECONNRESET'});
test('watch transport allowlist rejects semantic, storage, changed-network and cleanup failures',()=>{
  for(const e of [transport(),{code:'TIMEOUT'},{name:'TimeoutError'},
    {code:'SERVER_ERROR',response:{statusCode:503}},{code:'RPC_HTTP_ERROR',statusCode:429},
    {cause:transport()},{code:'NETWORK_ERROR',event:'initial-network-discovery',info:{error:transport()}}])assert(retryableRead(e));
  for(const e of [{code:'CALL_EXCEPTION',cause:transport()},{code:'SCHEDULER_STORAGE_ERROR',cause:transport()},
    {code:'NETWORK_ERROR',event:'changed',cause:transport()}, {code:'SERVER_ERROR',response:{statusCode:401}},
    {code:'UNKNOWN_ERROR'},Error('RPC HTTP 503'),{...transport(),cleanupErrors:[Error('unlink')]},
    new AggregateError([transport()]),{code:'TRANSACTION_REPLACED',cause:transport()}])assert(!transientRpc(e));
  for(const stage of ['broadcast','confirm'])assert(!retryableRead({...transport(),stage}));
  assert(!retryableRead({...transport(),transactionHash:'0x123'}));
});
test('watch backoff is bounded, resets after recovery and never retries a one-shot failure',async()=>{
  const stop=new AbortController(),delays=[],events=[];let calls=0;
  const code=await runWatch({watch:true,pollMs:77,signal:stop.signal,wait:async ms=>delays.push(ms),emit:r=>events.push(r),
    pass:async()=>{calls++;if(calls<=7||calls===9)throw transport();if(calls===10)return {status:'stopped'};return {status:'complete'};}});
  assert.equal(code,0);assert.deepEqual(delays,[1000,2000,4000,8000,16000,30000,30000,77,1000]);
  assert.equal(events.filter(r=>r.reason==='rpcUnavailable').length,8);
  calls=0;await assert.rejects(()=>runWatch({pollMs:77,pass:async()=>{calls++;throw transport();}}));assert.equal(calls,1);
});
test('watch keeps unknown sends, policy halt and unconfirmed receipts stopped',async()=>{
  for(const result of [{status:'blocked',reason:'unknownHash'}, {status:'blocked',reason:'unknownTransaction',pending:{},retryableRpcRead:true},
    {status:'blocked',reason:'unconfirmedReceipt',pending:{transactionHash:'0x123'}},
    {status:'blocked',requiresOperatorAction:true,retryableRpcRead:true}, {status:'error',error:{code:'SCHEDULER_STORAGE_ERROR'}}]){
    let calls=0;assert.equal(await runWatch({watch:true,pollMs:1,pass:async()=>{calls++;return result;},wait:()=>assert.fail('must not retry')}),1);assert.equal(calls,1);
  }
});
test('watch polls only a known pending receipt and continues through a new pass',async()=>{
  let calls=0;const events=[],delays=[];
  assert.equal(await runWatch({watch:true,pollMs:17,emit:r=>events.push(r),wait:async ms=>delays.push(ms),
    pass:async()=>++calls===1?{status:'blocked',reason:'pendingReceipt',pending:{transactionHash:'0x123'}}:{status:'stopped'}}),0);
  assert.deepEqual(delays,[17]);assert.equal(events[0].transactionHash,'0x123');
});
test('watch abort interrupts backoff without another pass; cleanup failure stays fatal',async()=>{
  const stop=new AbortController();let calls=0;
  assert.equal(await runWatch({watch:true,pollMs:1,signal:stop.signal,pass:async()=>{calls++;throw transport();},
    emit:r=>{if(r.status==='waiting')setImmediate(()=>stop.abort());}}),0);assert.equal(calls,1);
  await sleep(30000,stop.signal);
  await assert.rejects(()=>runWatch({watch:true,pollMs:1,pass:async()=>{throw new AggregateError([transport()], 'cleanup');}}),/cleanup/);
});
test('real HTTP RPC outage is classified and recovers without replacing the provider',async t=>{
  const http=require('node:http'),{ethers}=require('ethers');let outage=true;
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    if(outage){res.writeHead(503);res.end('offline');return;}
    const q=JSON.parse(body),answer=q=>({jsonrpc:'2.0',id:q.id,result:q.method==='eth_chainId'?'0x7a69':'0x1'});
    res.setHeader('content-type','application/json');res.end(JSON.stringify(Array.isArray(q)?q.map(answer):answer(q)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const provider=new ethers.JsonRpcProvider('http://127.0.0.1:'+server.address().port,undefined,{cacheTimeout:-1});t.after(()=>provider.destroy());
  const events=[];let reads=0;
  assert.equal(await runWatch({watch:true,pollMs:1,emit:r=>events.push(r),wait:async()=>{outage=false;},pass:async()=>{
    reads++;assert.equal((await provider.getNetwork()).chainId,31337n);return {status:'stopped'};
  }}),0);
  assert.equal(reads,2);assert.equal(events[0].reason,'rpcUnavailable');
});
