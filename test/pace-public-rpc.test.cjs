const {test}=require('node:test'),assert=require('node:assert/strict');
const {paceProvider}=require('../scripts/pace-public-rpc.cjs');
test('public RPC queue serializes requests and never retries an ambiguous send',async()=>{
 const calls=[],waits=[];let release;const first=new Promise(r=>release=r);const p=paceProvider({send:async(method)=>{calls.push(method);if(method==='eth_call')await first;if(method==='eth_sendRawTransaction')throw Error('unknown outcome');return method;}},{wait:async ms=>waits.push(ms)});
 const a=p.send('eth_call'),b=p.send('eth_sendRawTransaction'),c=p.send('eth_blockNumber');const rejection=assert.rejects(b,/unknown outcome/);await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['eth_call']);release();assert.equal(await a,'eth_call');await rejection;assert.equal(await c,'eth_blockNumber');assert.deepEqual(calls,['eth_call','eth_sendRawTransaction','eth_blockNumber']);assert.deepEqual(waits,[120,120,120]);
});
