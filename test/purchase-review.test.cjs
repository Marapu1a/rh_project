const {test}=require('node:test'),assert=require('node:assert/strict');
const {Review,amountRaw}=require('../web/purchase-demo/review.js');
const hash='0x'+'a'.repeat(64),pause=ms=>new Promise(r=>setTimeout(r,ms));
function setup(){
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 let identity={account:'buyer',chainId:'0x1237'},sends=0,now=1000;
 const adapter={identity:async()=>identity,prepare:async({amountRaw})=>({amountRaw,kind:'buy',expiresAt:2000}),send:async()=>{sends++;return hash;},receipt:async h=>({hash:h,status:'success'})};
 const options={adapter,storage,now:()=>now,timeout:10};
 return {adapter,storage,data,flow:new Review(options),options,identity:x=>identity=x,time:x=>now=x,sends:()=>sends};
}
test('USDG input is exact; malformed, zero and over-precision inputs fail',()=>{
 assert.equal(amountRaw('101'),'101000000');assert.equal(amountRaw('0.000001'),'1');assert.equal(amountRaw('60.4'),'60400000');
 for(const s of ['0','-1','01','1e3','1.0000001',' 1','1,2','Infinity'])assert.throws(()=>amountRaw(s));
});
test('double confirmation sends once; pending reload and receipt check do not resend',async()=>{
 const x=setup();await x.flow.review('101');await Promise.all([x.flow.confirm(),x.flow.confirm()]);assert.equal(x.sends(),1);
 const restored=new Review(x.options);assert.equal(restored.state.status,'pending');await restored.review('101');await restored.confirm();assert.equal(x.sends(),1);
 await restored.check();assert.equal(restored.state.status,'confirmed');assert.equal(x.sends(),1);
});
test('wallet change without event and expired quote stop before send',async()=>{
 for(const mutate of [x=>x.identity({account:'other',chainId:'0x1237'}),x=>x.identity({account:'buyer',chainId:'0x1'}),x=>x.time(2000)]){
  const x=setup();await x.flow.review('101');mutate(x);await x.flow.confirm();assert.equal(x.sends(),0);assert.equal(x.flow.state.status,'error');
 }
});
test('stale async quote cannot replace edited amount',async()=>{
 const x=setup();let resolve;x.adapter.prepare=()=>new Promise(r=>resolve=r);const task=x.flow.review('101');await pause(0);x.flow.invalidate();resolve({amountRaw:'101000000',kind:'buy',expiresAt:2000});await task;assert.equal(x.flow.state.status,'idle');
});
test('rejection permits fresh review; transport uncertainty stays blocked across reload',async()=>{
 const x=setup();x.adapter.send=async()=>{throw {code:4001};};await x.flow.review('101');await x.flow.confirm();assert.equal(x.flow.state.status,'rejected');
 x.adapter.send=async()=>{throw Error('network');};await x.flow.review('101');await x.flow.confirm();assert.equal(x.flow.state.status,'unknown');
 const restored=new Review(x.options);restored.invalidate();await restored.review('60');assert.equal(restored.state.status,'unknown');
});
test('timeout stays blocked; a late hash is retained and can be reconciled',async()=>{
 const x=setup();let resolve;x.adapter.send=()=>new Promise(r=>resolve=r);await x.flow.review('101');const sending=x.flow.confirm();await pause(30);assert.equal(x.flow.state.status,'unknown');
 resolve(hash);await sending;assert.equal(x.flow.state.status,'pending');assert.equal(x.flow.state.hash,hash);await x.flow.check();assert.equal(x.flow.state.status,'confirmed');
});
test('pending receipt outage and account events retain hash; reverted receipt is not success',async()=>{
 const x=setup();await x.flow.review('101');await x.flow.confirm();x.flow.invalidate();x.adapter.receipt=async()=>{throw Error('offline');};await x.flow.check();assert.equal(x.flow.state.status,'pending');assert.equal(x.flow.state.hash,hash);
 x.adapter.receipt=async()=>({hash,status:'reverted'});await x.flow.check();assert.equal(x.flow.state.status,'reverted');assert.equal(x.sends(),1);
});
test('cannot send if durable pre-send save fails',async()=>{
 const x=setup();await x.flow.review('101');const save=x.storage.setItem;x.storage.setItem=(k,v)=>{if(JSON.parse(v).status==='submitting')throw Error('quota');save(k,v);};await x.flow.confirm();assert.equal(x.sends(),0);assert.equal(x.flow.state.status,'error');
});
