const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {summarize,deliver}=require('../scripts/ops-notify.cjs');
test('notification filters untrusted details; ordinary funding wait is silent',()=>{
 assert.equal(summarize({state:'waiting',reasons:[{code:'prizeFunding'},{code:'secret-rpc-url'}]},{ready:true}),'ok');
 assert.equal(summarize({state:'waiting',reasons:[{code:'nativeFunding'}]},{ready:true}),'nativeFunding');
 assert.match(summarize({state:'unavailable'},null),/indexer not ready/);
});
test('delivery failure retries; dedup survives reload, reminder and recovery work',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qianqi-notify-')),file=path.join(dir,'state.json');let sent=0;
 const send=async()=>{sent++;};
 try{
  await assert.rejects(deliver({file,summary:'nativeFunding',send:async()=>{throw Error('offline');},now:1000}));
  assert.equal(fs.existsSync(file),false);
  assert.equal(await deliver({file,summary:'nativeFunding',send,now:2000}),'delivered');
  assert.equal(await deliver({file,summary:'nativeFunding',send,now:3000}),'suppressed');
  assert.equal(await deliver({file,summary:'nativeFunding',send,now:22000000}),'delivered');
  assert.equal(await deliver({file,summary:'ok',send,now:22000001}),'delivered');assert.equal(sent,3);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
