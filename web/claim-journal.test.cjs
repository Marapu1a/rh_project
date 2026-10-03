const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('ethers'),Claim=require('./claim.js');
function fixture(){
 const winner='0x'+'1'.repeat(40),vault='0x'+'2'.repeat(40),asset='0x'+'3'.repeat(40),A=E.id('A'),B=E.id('B'),block=E.id('block'),anchor=E.id('anchor'),drawId=E.id('draw');
 const abi=new E.Interface(['function claim(bytes32,address)','function reward(bytes32,address) view returns(uint256)','function draws(bytes32) view returns(address,uint64,uint8,uint256,uint256,uint256)','function quoteToken() view returns(address)']);
 const deployment={schema:'qianqi-site-actions-v1',mode:'local-test',chainId:31337,vault,asset,decimals:6,vaultCodeHash:E.keccak256('0x6000'),assetCodeHash:E.keccak256('0x6000'),anchor:{number:1,hash:anchor}},reward={winner,drawId,asset,amountRaw:'30000000'},tx={from:winner,to:vault,data:abi.encodeFunctionData('claim',[drawId,winner]),value:'0x0'};
 let raw=JSON.stringify({state:'pending',hash:A,tx}),sends=0,tail=Promise.resolve(),held=false;
 const storage={getItem:()=>raw,setItem:(_,v)=>raw=v};
 const lock=(_,fn)=>{const result=tail.then(async()=>{assert.equal(held,false);held=true;try{return await fn();}finally{held=false;}});tail=result.catch(()=>{});return result;};
 const state={receiptStatus:'0x0',due:30000000n,missing:false,wrongFrom:false,current:true};
 let release,entered;const ready=new Promise(resolve=>entered=resolve);
 const provider=delayed=>({request:async({method,params})=>{switch(method){case 'eth_chainId':return '0x7a69';case 'eth_accounts':return [winner];case 'eth_getCode':return '0x6000';case 'eth_getBlockByNumber':return {hash:params[0]==='0x1'?anchor:block};case 'eth_getTransactionReceipt':if(delayed){entered();await new Promise(resolve=>release=resolve);}return state.missing?null:{transactionHash:params[0],blockHash:block,blockNumber:'0x2',status:state.receiptStatus};case 'eth_getTransactionByHash':return {...tx,from:state.wrongFrom?asset:winner,input:tx.data,hash:params[0],blockHash:block};case 'eth_estimateGas':return '0x186a0';case 'eth_sendTransaction':sends++;return B;case 'eth_call':{const name=abi.parseTransaction({data:params[0].data}).name;return name==='claim'?'0x':abi.encodeFunctionResult(name,name==='quoteToken'?[asset]:name==='reward'?[state.due]:[asset,1,2,30000000n,30000000n,0]);}default:throw Error(method);}}});
 const create=delayed=>Claim.create({deployment,provider:provider(delayed),storage,lock,current:()=>state.current});
 return {A,B,reward,state,create,ready,release:()=>release(),set:v=>raw=JSON.stringify(v),get:()=>JSON.parse(raw),sends:()=>sends};
}
for(const outcome of ['reverted','confirmed'])test(`checks and sends share lock across instances: delayed ${outcome} receipt`,async()=>{
 const f=fixture();if(outcome==='confirmed'){f.state.receiptStatus='0x1';f.state.due=0n;}
 const first=f.create(true),second=f.create(false),a=first.check(f.reward);await f.ready;
 let done=false;const b=second.check(f.reward).then(x=>{done=true;return x;});await new Promise(r=>setImmediate(r));assert.equal(done,false);assert.equal(f.sends(),0);
 f.release();await a;await b;
 if(outcome==='reverted'){await second.send(f.reward);assert.equal(f.get().hash,f.B);await assert.rejects(()=>first.send(f.reward),/already pending/);assert.equal(f.sends(),1);}
 else{await assert.rejects(()=>second.send(f.reward),/already pending/);assert.equal(f.sends(),0);}
});
test('defensive compare prevents late old receipt from overwriting a newer journal',async()=>{
 const f=fixture(),engine=f.create(true),pending=engine.check(f.reward);await f.ready;
 f.set({state:'pending',hash:f.B});f.release();assert.equal((await pending).hash,f.B);assert.equal(f.get().hash,f.B);
 await assert.rejects(()=>f.create(false).send(f.reward),/already pending/);assert.equal(f.sends(),0);
});
test('account change during receipt check never writes an obsolete result',async()=>{
 const f=fixture(),a=f.create(true).check(f.reward);await f.ready;f.state.current=false;f.release();await assert.rejects(()=>a,/Wallet changed/);assert.equal(f.get().state,'pending');
});
for(const initial of ['unknown','submitting','pending'])test(`verified replacement/payment hash recovers ${initial}, never authorizes another send`,async()=>{
 const f=fixture(),engine=f.create(false);f.set({state:initial,...(initial==='pending'?{hash:f.A}:{})});
 const before=f.get();f.state.missing=true;await assert.rejects(()=>engine.recover(f.reward,f.B),/does not prove/);assert.deepEqual(f.get(),before);
 f.state.missing=false;await assert.rejects(()=>engine.recover(f.reward,f.B),/does not prove/);assert.deepEqual(f.get(),before);
 f.state.receiptStatus='0x1';f.state.due=0n;f.state.wrongFrom=true;await assert.rejects(()=>engine.recover(f.reward,f.B),/does not match/);assert.deepEqual(f.get(),before);
 f.state.wrongFrom=false;assert.equal((await engine.recover(f.reward,f.B)).state,'confirmed');assert.equal(f.get().hash,f.B);
 await assert.rejects(()=>engine.send(f.reward),/already pending/);assert.equal(f.sends(),0);
});
