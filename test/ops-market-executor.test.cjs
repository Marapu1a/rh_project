const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const engine=require('../scripts/ops-market-executor.cjs'),market=require('../scripts/ops-market-quote.cjs');
function fixture(t,action='swap'){
 const source='0x'+'ab'.repeat(20),stamp=Math.floor(Date.now()/1000),head={number:10,hash:ethers.id('head'),timestamp:stamp,gasLimit:30000000n};
 const f={sends:0,state:{},disk:{},failSave:0,saves:0};
 const config={amountRaw:'10000000',maxUsdPerPeriod:'10000000',periodSeconds:'86400',cooldownSeconds:'0',allowanceSeconds:'600',maxNativeFeesPerPeriod:'10000000000000000',slippageBps:50,maxImpactBps:100,maxAgeSeconds:30,deadlineSeconds:120,maxGasPrice:'100',maxGasUnits:'30000',nativeFloor:'100',extraFeeWei:'0',localFork:false};
 const abi=new ethers.Interface(['function allowance(address,address) view returns(uint256)']);
 const provider={getNetwork:async()=>({chainId:31337n}),getBlock:async()=>head,getFeeData:async()=>({maxFeePerGas:10n}),getBalance:async()=>100000000n,getTransactionCount:async()=>0,getTransactionReceipt:async()=>f.receipt,getTransaction:async()=>f.tx,call:async()=>abi.encodeFunctionResult('allowance',[action==='approveUSDG'?0n:10000000n])};
 const original=market.prepareSwap;market.prepareSwap=async()=>({status:action==='swap'?'prepared':'waiting',reason:action==='swap'?undefined:'allowanceRequired',observation:{blockNumber:10,blockHash:head.hash,timestamp:stamp},minOut:'900',deadline:stamp+120,transaction:market.transaction(source,10000000n,900n,stamp+120)});t.after(()=>{market.prepareSwap=original;});
 const signer={provider,getAddress:async()=>source,estimateGas:async()=>25000n,sendTransaction:async request=>{
  f.sends++;f.tx={...request,chainId:31337n,hash:ethers.id('tx'),value:0n};
  const logs=[];if(action==='swap'){
   const erc=new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']),weth=new ethers.Interface(['event Withdrawal(address indexed src,uint256 wad)']);
   logs.push({address:market.profile.pins.quote[0],...erc.encodeEventLog('Transfer',[source,market.profile.pins.router[0],10000000n])},{address:market.profile.pins.weth[0],...weth.encodeEventLog('Withdrawal',[market.profile.pins.router[0],1000n])});
  }
  f.receipt={hash:f.tx.hash,blockNumber:10,blockHash:head.hash,status:1,gasUsed:25000n,gasPrice:10n,logs};
  if(f.unknown)throw Error('lost broadcast response');
  return {hash:f.tx.hash,wait:async()=>{if(f.timeout)throw Object.assign(Error('lost receipt'),{code:'TIMEOUT'});return f.receipt;}};
 }};
 f.args={provider,signer,source,config,ops:{maxGasPrice:'100'},state:f.state,save:s=>{if(++f.saves===f.failSave)throw Error('disk failure');const {hash}=require('../scripts/direct-buy.cjs');assert.equal(hash(s),hash(JSON.parse(JSON.stringify(s))),'journal checksum must survive JSON serialization');f.disk=structuredClone(s);}};
 return f;
}
for(const action of ['approveUSDG','approvePermit2','swap'])for(const unknown of [false,true])test(action+' restart '+(unknown?'unknown':'known')+' never duplicates send',async t=>{
 const f=fixture(t,action);f.unknown=unknown;f.timeout=!unknown;await assert.rejects(engine.execute(f.args),/lost|Receipt timeout/);assert.equal(f.sends,1);
 const state=structuredClone(f.disk);const r=await engine.reconcile({...f.args,state});
 if(unknown){assert.equal(r.reason,'unknownHash');await assert.rejects(engine.execute({...f.args,state}),/Resolve existing/);}
 else{assert.equal(r.status,'confirmed');assert(!state.pending);if(action==='swap'){assert.equal(state.lastOpsSwap.nativeOutput,'1000');assert.equal(state.opsSwapHistory.spent,'10000000');}}
 assert.equal(f.sends,1);
});
test('failed intent save never broadcasts; failed hash save retains unknown intent',async t=>{
 const f=fixture(t);f.failSave=1;await assert.rejects(engine.execute(f.args),/disk failure/);assert.equal(f.sends,0);
 f.failSave=3;await assert.rejects(engine.execute(f.args),/disk failure/);assert.equal(f.sends,1);assert(f.disk.pending);assert(!f.disk.pending.transactionHash);
});
test('receipt save failure keeps intent; recovery charges once and period cap stops further swaps',async t=>{
 const f=fixture(t);f.failSave=3;await assert.rejects(engine.execute(f.args),/disk failure/);assert(f.state.pending.transactionHash);
 await engine.reconcile(f.args);assert.equal(f.state.opsSwapHistory.spent,'10000000');assert.equal((await engine.execute(f.args)).reason,'opsSwapPeriodLimit');assert.equal(f.sends,1);
});
test('mismatched receipt output halts swap without losing history',async t=>{
 const f=fixture(t);f.timeout=true;await assert.rejects(engine.execute(f.args),/lost|Receipt timeout/);f.receipt.logs=[];await engine.reconcile(f.args);assert(f.state.opsSwapHalt);assert.equal(f.state.opsSwapHistory.spent,'10000000');assert.equal((await engine.execute(f.args)).reason,'opsSwapHalt');
});
test('definite revert is charged and stops automatic gas-burning retries',async t=>{
 const f=fixture(t);f.timeout=true;await assert.rejects(engine.execute(f.args),/lost|Receipt timeout/);f.receipt.status=0;await engine.reconcile(f.args);assert.equal(f.state.opsSwapHistory.spent,'0');assert.equal(f.state.opsSwapHistory.fees,'250000');assert.equal((await engine.execute(f.args)).reason,'opsSwapHalt');
});

test('WETH ERC20 burn is measured once and receipt fee budget limits later stages',async t=>{
 const f=fixture(t);f.timeout=true;await assert.rejects(engine.execute(f.args),/Receipt timeout/);
 const abi=new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
 f.receipt.logs[1]={address:market.profile.pins.weth[0],...abi.encodeEventLog('Transfer',[market.profile.pins.router[0],ethers.ZeroAddress,1000n])};
 await engine.reconcile(f.args);assert.equal(f.state.lastOpsSwap.nativeOutput,'1000');assert(!f.state.opsSwapHalt);
});
test('gas spending cap and seed shortage wait before creating intent',async t=>{
 const f=fixture(t);f.args.config.maxNativeFeesPerPeriod='1';assert.equal((await engine.execute(f.args)).reason,'opsSwapFeeLimit');assert.equal(f.sends,0);assert(!f.state.pending);
 f.args.config.maxNativeFeesPerPeriod='100000000';f.args.provider.getBalance=async()=>0n;assert.equal((await engine.execute(f.args)).reason,'sourceNeedsETH');assert.equal(f.sends,0);
});

for(const unknown of [false,true])test('collector credit '+(unknown?'unknown':'known')+' recovery keeps one send and charges gas only',async t=>{
 const f=fixture(t,'collectOps'),address='0x'+'cd'.repeat(20),quote=market.profile.pins.quote[0],code='0x6000';
 const abi=new ethers.Interface(['function credit(address) view returns(uint256)','function quoteToken() view returns(address)','function pay(address)','function balanceOf(address) view returns(uint256)']);
 f.args.collection={collector:[address,ethers.keccak256(code)],quote:[quote,ethers.keccak256(code)],recipient:f.args.source};
 f.args.provider.getCode=async()=>code;
 f.args.provider.call=async req=>{const x=abi.parseTransaction(req);return abi.encodeFunctionResult(x.name,[x.name==='quoteToken'?quote:x.name==='credit'?(f.sends?0n:10000000n):(f.sends?10000000n:0n)]);};
 const send=f.args.signer.sendTransaction;f.args.signer.sendTransaction=async req=>{assert.equal(req.to,address);assert.equal(abi.parseTransaction(req).args[0],ethers.getAddress(f.args.source));const tx=await send(req);const e=new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);f.receipt.logs=[{address:quote,...e.encodeEventLog('Transfer',[address,f.args.source,10000000n])}];return tx;};
 f.unknown=unknown;f.timeout=!unknown;
 await assert.rejects(engine.execute(f.args),/lost|Receipt timeout/);assert.equal(f.sends,1);assert.equal(f.state.pending.action,'collectOps');
 const result=await engine.reconcile(f.args);
 if(unknown)assert.equal(result.reason,'unknownHash');else{assert.equal(result.status,'confirmed');assert.equal(f.state.lastOpsSwap.usdReceived,'10000000');assert.equal(f.state.opsSwapHistory.spent,'0');assert.equal(f.state.opsSwapHistory.fees,'250000');assert(!f.state.opsSwapHalt);}
 assert.equal(f.sends,1);
});
test('collector pin mismatch rejects before intent or send',async t=>{
 const f=fixture(t);f.args.collection={collector:['0x'+'cd'.repeat(20),ethers.id('wrong')],quote:market.profile.pins.quote,recipient:f.args.source};f.args.provider.getCode=async()=> '0x6000';
 await assert.rejects(engine.execute(f.args),/pin mismatch/);assert.equal(f.sends,0);assert(!f.state.pending);
});
