const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {withState}=require('../scripts/local-scheduler-state.cjs'),{createBoundary,reconcilePending}=require('../scripts/pons-transaction-journal.cjs');
const {sendLocalTransaction,withTransactionBoundary}=require('../scripts/local-receipt.cjs');
for(const failAt of [1,2])test('disk full at intent save '+failAt+' stops sends and preserves recoverable state',async t=>{
 const dir=fs.mkdtempSync(path.resolve('.local/logs/disk-fault-')),file=path.join(dir,'state.json');t.after(()=>{for(const f of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,f));fs.rmdirSync(dir);});
 await withState(file,{},(s,save)=>save(s));const before=fs.readFileSync(file),original=fs.writeFileSync;let writes=0,sends=0;
 const tx={hash:'0x123',nonce:1,wait:async()=>assert.fail('must not wait after failed persistence')};
 const method=Object.assign(async()=>{sends++;return tx;},{fragment:{name:'claim'},populateTransaction:async()=>({to:'vault',data:'0x12',value:0}),estimateGas:async()=>100n});
 fs.writeFileSync=(target,...args)=>{if(typeof target==='number'&&String(args[0]).startsWith('{')&&++writes===failAt)throw Object.assign(Error('disk full'),{code:'ENOSPC'});return original(target,...args);};
 try{await assert.rejects(withState(file,{},async(state,save)=>{const boundary=createBoundary({state,save,provider:{},sender:'wallet',guard:async()=>{},onConfirmed:async()=>{}});await withTransactionBoundary(boundary,()=>sendLocalTransaction(method,[],{}));}),e=>e.code==='SCHEDULER_STORAGE_ERROR');}finally{fs.writeFileSync=original;}
 assert.equal(sends,failAt===1?0:1);
 if(failAt===1)assert.deepEqual(fs.readFileSync(file),before);
 else await withState(file,{},async(state,save)=>{assert(state.pending);assert.equal(state.pending.transactionHash,undefined);assert.equal((await reconcilePending(state,save,{},'wallet')).reason,'unknownHash');});
 assert.equal(fs.existsSync(file+'.lock'),false);
});
