// Offline consistency of saved public receipts, not a live deployment/fork test.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const e=require('../research/infinity-source-audit/evidence-2026-09-27.json');
const hook=new ethers.Interface(require('../research/infinity-source-audit/hook.json').abi);
const manager=new ethers.Interface(require('../research/infinity-source-audit/manager.json').abi);
const adapter=new ethers.Interface(require('../research/infinity-source-audit/adapter.json').abi);
for(const n of ['hook','engine','adapter'])assert.equal(e.contracts[n].hash,require('../research/infinity-source-audit/'+n+'.json').onchainBytecodeHash);
assert.equal(e.creator.hash,require('../research/infinity-source-audit/creator.json').onchainBytecodeHash);
for(const [name,{tx,receipt}]of Object.entries(e.transactions)){
 assert.equal(receipt.status,'0x1');assert.equal(tx.hash,receipt.transactionHash);
 const parse=(iface,l)=>{try{return iface.parseLog(l)}catch{return null}};
 const fees=receipt.logs.filter(l=>l.address.toLowerCase()===e.contracts.hook.address.toLowerCase()).map(l=>parse(hook,l)).filter(Boolean);
 const swaps=receipt.logs.filter(l=>l.address.toLowerCase()==='0xee04c68742e6bf434be8039580d2e89bbe55bc6f').map(l=>parse(manager,l)).filter(l=>l?.name==='Swap');
 assert.equal(swaps.length,1);const swap=swaps[0].args;
 const base=name==='buy'?adapter.parseTransaction({data:tx.input}).args[2]:swap.amount0;
 assert(base>0n);if(name==='buy')assert.equal(-swap.amount0,base);
 assert.equal(fees.find(l=>l.name==='ModeFeeAccrued').args[3],base*500n/10000n);
 assert.equal(fees.find(l=>l.name==='ProtocolFeeAccrued').args[2],base*30n/10000n);
 assert.equal(swap.fee,11098n);
 console.log(name+': 5% policy + 0.3% hook protocol; pool fee 11098 pips; formulas OK');
}
