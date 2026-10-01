// Local fork boundary, used through Playwright bindings, not an HTTP/public signer.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const planner=require('./pons-direct-purchase.cjs');
function createBridge({rpc,instanceId,manifest,account,journal,prepare=planner.prepare,identity=async()=>({account,chainId:'0x1237'})}){
  const plans=new Map();let busy=false;
  let state=fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal,'utf8')):{instanceId,pending:null,completed:{}};
  assert.equal(state.instanceId,instanceId,'Journal belongs to another fork');
  function save(){fs.mkdirSync(path.dirname(journal),{recursive:true});const tmp=journal+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state));fs.renameSync(tmp,journal);}
  const guarded=()=>planner.guard(rpc,instanceId);
  async function current(){await guarded();const value=await identity();assert.equal(value.account.toLowerCase(),account.toLowerCase(),'Account changed');assert.equal(value.chainId,'0x1237','Chain changed');return value;}
  function view(plan,id){return {id,kind:plan.kind,amountRaw:plan.amountRaw,quote:plan.quoteOut,minimum:plan.minimumOut,tokenDecimals:18,venue:plan.venue,expiresAt:Math.min(plan.expiresAt*1000,Date.now()+60000),request:plan.request};}
  async function reconcile(hash){
    await guarded();const saved=state.pending?.hash===hash?state.pending:state.completed[hash];assert(saved,'Unknown transaction');
    const receipt=await rpc('eth_getTransactionReceipt',[hash]);if(!receipt)return null;
    const tx=await rpc('eth_getTransactionByHash',[hash]),block=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]),expected=saved.plan.request.params[0];
    assert.equal(receipt.transactionHash.toLowerCase(),hash.toLowerCase());assert.equal(tx.hash.toLowerCase(),hash.toLowerCase());
    assert.equal(receipt.blockHash,block.hash,'Noncanonical receipt');assert.equal(tx.blockHash,receipt.blockHash);assert.equal(BigInt(tx.blockNumber),BigInt(receipt.blockNumber));
    for(const field of ['from','to']){assert.equal(tx[field].toLowerCase(),expected[field].toLowerCase(),'Transaction identity mismatch');assert.equal(receipt[field].toLowerCase(),expected[field].toLowerCase());}
    assert.equal(tx.input.toLowerCase(),expected.data.toLowerCase(),'Transaction calldata mismatch');assert.equal(BigInt(tx.value),0n);assert.equal(BigInt(tx.chainId),4663n);
    assert([0n,1n].includes(BigInt(receipt.status)));
    const result={hash,status:BigInt(receipt.status)===1n?'success':'reverted',blockNumber:Number(BigInt(receipt.blockNumber)),blockHash:receipt.blockHash};
    state.completed[hash]=saved;if(state.pending?.hash===hash)state.pending=null;save();return result;
  }
  return {
    identity:async()=>{await guarded();return identity();},
    recover:async()=>{await guarded();return state.pending?{...state.pending.view,hash:state.pending.hash??null}:null;},
    prepare:async({amountRaw})=>{
      assert(!busy&&!state.pending,'Unresolved request; reconcile before a new purchase');busy=true;
      try{await current();const plan=await prepare({rpc,instanceId,manifest,account,amountRaw});const id=crypto.randomUUID(),v=view(plan,id);
        plans.clear();plans.set(id,{plan,view:v});return structuredClone(v);
      }finally{busy=false;}
    },
    send:async submitted=>{
      // Synchronous lock before any await; retrying an ID never submits it twice.
      assert(!busy,'Request already being checked');busy=true;
      try{
        await current();
        const existing=state.pending?.view.id===submitted.id?state.pending:Object.values(state.completed).find(x=>x.view.id===submitted.id);
        if(existing){assert.deepEqual(submitted,existing.view,'Changed request');assert(existing.hash,'Unknown submission; never resend');return existing.hash;}
        assert(!state.pending,'Another submission is unresolved');const saved=plans.get(submitted.id);assert(saved,'Review a new quote');assert.deepEqual(submitted,saved.view,'Changed request');
        assert(saved.view.expiresAt>Date.now(),'Review expired');
        const block=await rpc('eth_getBlockByNumber',[`0x${saved.plan.snapshot.number.toString(16)}`,false]);assert.equal(block.hash,saved.plan.snapshot.hash,'Quote reorg');
        const fresh=await prepare({rpc,instanceId,manifest,account,amountRaw:saved.plan.amountRaw});assert.equal(fresh.kind,saved.plan.kind,'Next step changed');assert.equal(fresh.request.params[0].to.toLowerCase(),saved.plan.request.params[0].to.toLowerCase(),'Route changed');
        await current();assert(saved.view.expiresAt>Date.now(),'Review expired');
        const tx=saved.plan.request.params[0];await rpc('eth_call',[{from:tx.from,to:tx.to,data:tx.data,value:tx.value},'latest']);
        await current();assert(saved.view.expiresAt>Date.now(),'Review expired');
        // No untrusted input is used as calldata; send the retained exact request.
        state.pending=saved;save();
        const hash=await rpc(saved.plan.request.method,saved.plan.request.params);
        assert(/^0x[0-9a-f]{64}$/i.test(hash),'Missing transaction hash');state.pending={...saved,hash};save();return hash;
      }finally{busy=false;}
    },
    receipt:reconcile
  };
}
module.exports={createBridge};
