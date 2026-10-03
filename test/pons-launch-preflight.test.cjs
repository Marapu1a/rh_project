const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers:E}=require('ethers');
const {inspect}=require('../scripts/pons-launch-preflight.cjs');
function fixture(){
 const addr=i=>E.getAddress(E.toBeHex(i,20)),code='0x01',codeHash=E.keccak256(code),roles={governor:addr(10),executor:addr(11)};
 const dependencies={contracts:Object.fromEntries(['factory','hook','escrow','quote','operator'].map((n,i)=>[n,{address:addr(i+1),runtimeHash:codeHash}]))};
 const settings={roles,timing:{maxFinalizedLag:'1200'},quoteImplementation:{kind:'eip1967',address:addr(8),codeHash}};
 const iface=new E.Interface([...require('../scripts/integrations/pons-v2.cjs').FAB,...require('../scripts/integrations/pons-v2.cjs').ERC]);
 const p={getNetwork:async()=>({chainId:4663n}),getBlock:async tag=>({number:100,hash:E.id('head'),timestamp:tag==='finalized'?900:1000,baseFeePerGas:1n}),getCode:async()=>code,getStorage:async()=>E.zeroPadValue(addr(8),32),getTransactionCount:async()=>1,getBalance:async()=>100n,call:async tx=>{
  const name=iface.parseTransaction({data:tx.data}).name;
  return iface.encodeFunctionResult(name,[{memeHook:addr(2),feeEscrow:addr(3),canLaunch:true,approvedPairTokens:true,launchFee:5n,previewLaunchEconomics:E.id('economics'),decimals:6,balanceOf:101000000n}[name]]);
 }};return {p,settings,dependencies};
}
test('snapshot checks dependencies, funding facts and finality without authorizing launch',async()=>{
 const f=fixture(),r=await inspect(f.p,f.settings,f.dependencies);assert.equal(r.status,'snapshotMatched');assert.equal(r.authorizationToLaunch,false);assert.equal(r.wallets.executor.quoteRaw,'101000000');
});
test('changed runtime, pending nonce and excessive finality lag require review',async()=>{
 const f=fixture();f.dependencies.contracts.hook.runtimeHash=E.id('changed');f.p.getTransactionCount=async(a,tag)=>tag==='pending'?2:1;
 f.settings.timing.maxFinalizedLag='10';const r=await inspect(f.p,f.settings,f.dependencies);assert(r.changes.includes('hookRuntime'));assert(r.changes.includes('governorPendingTransactions'));assert(r.changes.includes('finalityLag'));
});
test('wrong chain and changed USDG implementation fail closed',async()=>{
 const f=fixture();f.p.getNetwork=async()=>({chainId:1n});await assert.rejects(inspect(f.p,f.settings,f.dependencies));
 const g=fixture();g.p.getStorage=async()=>E.ZeroHash;await assert.rejects(inspect(g.p,g.settings,g.dependencies));
});
