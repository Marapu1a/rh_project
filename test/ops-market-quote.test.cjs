const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {prepareSwap,profile,interfaces,transaction}=require('../scripts/ops-market-quote.cjs');
// RPC fixture uses synthetic runtimes/hashes; live pins are exercised by the separate fork.
function fixture(t){
 const original=structuredClone(profile.pins),codes={};let i=1;
 for(const [name,pin]of Object.entries(profile.pins)){codes[pin[0].toLowerCase()]='0x'+String(i++).padStart(2,'0');pin[1]=ethers.keccak256(codes[pin[0].toLowerCase()]);}
 t.after(()=>{for(const name of Object.keys(original))profile.pins[name]=original[name];});
 const source='0x'+'ab'.repeat(20),options={source,amountRaw:'10000000',slippageBps:50,maxImpactBps:100,maxAgeSeconds:30,deadlineSeconds:60,maxGasPrice:'100',maxGasUnits:'300000',nativeFloor:'1000',extraFeeWei:'2000'};
 const f={options,now:1000,stamp:1000,liquidity:1000n,out:1000000000n,allowance:10000000n,permitAmount:10000000n,permitExpiry:2000n,gasPrice:10n,gas:200000n,native:1000000000n,hash:ethers.id('head'),calls:[]};
 const encode=(name,method,v)=>interfaces[name].encodeFunctionResult(method,v);
 f.provider={send:async(method,args)=>{
 f.calls.push([method,args]);if(f.fail===method)throw Error('RPC unavailable');
 if(method==='eth_chainId')return '0x1237';
 if(method==='eth_getBlockByNumber')return {number:'0x10',hash:f.changed&&args[0]!=='latest'?ethers.ZeroHash:f.hash,timestamp:ethers.toQuantity(f.stamp),gasLimit:'0x1c9c380'};
 if(method==='eth_getCode')return args[0].toLowerCase()===source.toLowerCase()?'0x':codes[args[0].toLowerCase()];
 if(method==='eth_gasPrice')return ethers.toQuantity(f.gasPrice);
 if(method==='eth_getBalance')return ethers.toQuantity(f.native);
 if(method==='eth_estimateGas')return ethers.toQuantity(f.gas);
 if(method!=='eth_call')throw Error('Unexpected mutation: '+method);
 const tx=args[0],name=Object.keys(interfaces).find(n=>profile.pins[n][0].toLowerCase()===tx.to.toLowerCase()),parsed=interfaces[name].parseTransaction(tx),fn=parsed.name;
 if(name==='router'){if(f.rejectSimulation)throw Object.assign(Error('revert'),{code:3});return '0x';}
 if(fn==='poolManager')return encode(name,fn,[profile.pins.manager[0]]);
 if(fn==='poolIdToPoolKey')return encode(name,fn,profile.poolKey);
 if(fn==='getLiquidity')return encode(name,fn,[f.liquidity]);
 if(fn==='quoteExactInputSingle'){const small=parsed.args[0][2]<10000000n;return encode(name,fn,[small?10000000n:f.out,50000n]);}
 if(fn==='balanceOf')return encode(name,fn,[100000000n]);
 if(name==='quote'&&fn==='allowance')return encode(name,fn,[f.allowance]);
 if(name==='permit2')return encode(name,fn,[f.permitAmount,f.permitExpiry,0n]);
 throw Error('Unexpected call '+fn);
 }};
 f.run=()=>prepareSwap(f.provider,f.options,{now:()=>f.now});return f;
}
test('quote prepares exact swap+unwrap without sends and pins calls to one block',async t=>{
 const f=fixture(t),r=await f.run();assert.equal(r.status,'prepared',JSON.stringify(r));assert.equal(r.authorizationToSend,false);
 assert.deepEqual(r.transaction,transaction(f.options.source,10000000n,995000000n,1060));
 for(const [m,a]of f.calls.filter(([m])=>['eth_call','eth_estimateGas'].includes(m)))assert.equal(a[1],'0x10');
 assert(f.calls.every(([m])=>!m.includes('sendTransaction')&&!m.includes('snapshot')));
});
for(const [reason,patch]of [['staleQuote',{now:1040}],['staleQuote',{changed:true}],['insufficientLiquidity',{liquidity:0n}],['priceImpact',{out:500000000n}],['allowanceRequired',{allowance:0n}],['allowanceRequired',{permitExpiry:1001n}],['allowanceRequired',{permitAmount:0n}],['expensiveGas',{gasPrice:101n}],['gasBound',{gas:300001n}],['sourceNeedsETH',{native:0n}],['simulationRejected',{rejectSimulation:true}],['rpcUnavailable',{fail:'eth_call'}]])test('quote waits for '+reason+' '+Object.keys(patch),async t=>{
 const f=fixture(t);Object.assign(f,patch);assert.equal((await f.run()).reason,reason);
});
test('runtime mismatch blocks quote before simulation',async t=>{const f=fixture(t);profile.pins.quoter[1]=ethers.ZeroHash;assert.equal((await f.run()).reason,'marketPinMismatch');});

test('deadline expiry is rejected even when RPC head stalls within max age',async t=>{
 const f=fixture(t);f.options.maxAgeSeconds=120;f.now=1070;assert.equal((await f.run()).reason,'staleQuote');
});
