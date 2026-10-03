// Read-only reconciliation of the six signed CREATEs against the approved plan.
const assert=require('node:assert/strict'),{ethers:E}=require('ethers');
async function inspect(provider,plan,journal){
 require('./deployment-signing-plan.cjs').validate(plan);
 assert.equal(journal.planHash,plan.planHash);assert.equal(journal.pending,null);
 assert.equal(journal.completed.length,6);assert.equal((await provider.getNetwork()).chainId,4663n);
 const transactions=[];
 for(let i=0;i<6;i++){
  const row=journal.completed[i],step=plan.transactions[i];assert.equal(row.index,i);
  const tx=await provider.getTransaction(row.hash),r=await provider.getTransactionReceipt(row.hash);
  assert(tx&&r);assert.equal(r.status,1);assert.equal(tx.to,null);assert.equal(tx.chainId,4663n);
  assert.equal(tx.from.toLowerCase(),plan.governor.toLowerCase());assert.equal(tx.nonce,plan.startNonce+i);
  assert.equal(tx.data.toLowerCase(),step.request.data.toLowerCase());assert.equal(tx.value,0n);
  assert.equal(r.contractAddress.toLowerCase(),step.predictedAddress.toLowerCase());
  const block=await provider.getBlock(r.blockNumber),code=await provider.getCode(r.contractAddress,r.blockNumber);
  assert.equal(block.hash,r.blockHash);assert(require('./deployment-signing-queue.cjs').runtimeMatches(code,step,block.timestamp));
  assert.equal(await provider.getCode(r.contractAddress),code,'Runtime changed since deployment');
  transactions.push({index:i,label:step.label,hash:r.hash,address:r.contractAddress,nonce:tx.nonce,blockNumber:r.blockNumber,blockHash:r.blockHash,timestamp:block.timestamp,runtimeHash:E.keccak256(code),gasUsed:String(r.gasUsed)});
 }
 for(const r of transactions)assert.equal((await provider.getBlock(r.blockNumber)).hash,r.blockHash,'Receipt reorg');
 return {schema:'qianqi-public-prefix-evidence-v1',observedAt:new Date().toISOString(),chainId:4663,planHash:plan.planHash,publicSends:false,transactions,anchor:{number:transactions[5].blockNumber,hash:transactions[5].blockHash},limits:['Canonical receipts and runtime at observation; not a finality guarantee']};
}
module.exports={inspect};
