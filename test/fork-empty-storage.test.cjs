const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),{keccak256}=require('ethers');
const {startReadProxy}=require('../scripts/read-only-fork-rpc.cjs');
const address='0x1111111111111111111111111111111111111111';
test('Fork snapshot caches only proof-confirmed empty storage at the exact anchor',async()=>{
 let nonempty=false,absent=false,reads=0;
 const upstream=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;const q=JSON.parse(body);let result;
  if(q.method==='eth_getProof')result=absent?{address,storageHash:'0x'+'00'.repeat(32),codeHash:'0x'+'00'.repeat(32),nonce:'0x0',balance:'0x0',accountProof:['0x1234']}:{address,storageHash:nonempty?keccak256('0x1234'):keccak256('0x80'),codeHash:keccak256('0x')};
  else if(q.method==='eth_getLogs'){reads++;result=[];}
  else{reads++;result='0x'+'12'.repeat(32);}res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
 });
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const proxy=await startReadProxy('http://127.0.0.1:'+upstream.address().port);
 const rpc=async(method,params)=>(await(await fetch(proxy.url,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:7,method,params})})).json());
 try{
  await proxy.pinEmptyStorage(address,10);
  for(const slot of ['0x0','0x1234'])assert.equal((await rpc('eth_getStorageAt',[address,slot,'0xa'])).result,'0x'+'00'.repeat(32));
  assert.equal(reads,0);
  assert.equal((await rpc('eth_getStorageAt',[address,'0x0','0xb'])).result,'0x'+'12'.repeat(32));
  assert.equal((await rpc('eth_getStorageAt',[address,'0x0','latest'])).result,'0x'+'12'.repeat(32));assert.equal(reads,2);
  nonempty=true;await assert.rejects(proxy.pinEmptyStorage(address,12),/not proven empty/);
  assert.equal((await rpc('eth_getStorageAt',[address,'0x0','0xc'])).result,'0x'+'12'.repeat(32));
  absent=true;await proxy.pinEmptyStorage(address,13);assert.equal((await rpc('eth_getStorageAt',[address,'0x777','0xd'])).result,'0x'+'00'.repeat(32));
  assert.deepEqual((await rpc('eth_getLogs',[{fromBlock:'0xa',toBlock:'0xa',address}])).result,[]);
  assert.equal((await rpc('eth_sendTransaction',[{}])).error.code,-32601);
  assert.equal((await rpc('eth_sendRawTransaction',['0x1234'])).error.code,-32601);
 }finally{proxy.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));}
});
