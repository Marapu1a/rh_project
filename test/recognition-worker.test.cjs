const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),D=require('../scripts/direct-buy.cjs'),W=require('../scripts/recognition-worker.cjs');
test('worker disabled never sends; only reviewed router candidates selected and public gates fail closed',async t=>{
 let sent=false;assert.equal((await W.run({config:{},send:()=>{sent=true;}})).status,'disabled');assert(!sent);
 const f=require('./fixtures/purchase-recognition.cjs').fixture();assert.deepEqual(W.select({manifest:f.manifest,blocks:f.marked(),config:{manifest:f.m}},1),[f.proof.transactionHash]);
 const alt=structuredClone(f.marked());alt[0].transactions[0].tx.to='0x'+'9'.repeat(40);alt[0].transactions[0].receipt.to=alt[0].transactions[0].tx.to;assert.deepEqual(W.select({manifest:f.manifest,blocks:alt,config:{manifest:f.m}},1),[]);
 const dir=fs.mkdtempSync(path.resolve('.local/logs/recognition-worker-'));t.after(()=>{assert.equal(path.dirname(fs.realpathSync(dir)),fs.realpathSync('.local/logs'));fs.rmSync(dir,{recursive:true,force:true});});
 const c={executor:f.recognition.publisher,recognition:{...f.recognition,publication:{url:'https://example.com/notice',sha256:require('crypto').createHash('sha256').update('notice').digest('hex'),publishedAt:'2020-01-01T00:00:00Z',notBefore:'2020-01-02T00:00:00Z'}},recognitionPublishing:{enabled:true,batchSize:1,publicDirectory:dir,publicBaseUrl:'https://example.com/bundles'}};
 const b=f.bundle(),key=D.hash(b),file=path.join(dir,'private.json');fs.writeFileSync(file,JSON.stringify(b));W.publish(c,{file,bundleHash:key});assert.equal(D.hash(JSON.parse(fs.readFileSync(path.join(dir,key+'.json')))),key);
 const response=(text)=>({ok:true,arrayBuffer:async()=>Buffer.from(text),text:async()=>text});await W.publicChecks(c,key,async url=>response(url.endsWith('/notice')?'notice':JSON.stringify(b)));
 await assert.rejects(W.publicChecks(c,key,async()=>({ok:false})),/notice unavailable/);
 await assert.rejects(W.publicChecks(c,key,async()=>response('tampered')),/notice changed/);
 await assert.rejects(W.publicChecks(c,key,async url=>response(url.endsWith('/notice')?'notice':'{}')),/bundle mismatch/);
 c.recognition.publication.publishedAt='2099-01-01T00:00:00Z';c.recognition.publication.notBefore='2099-01-02T00:00:00Z';await assert.rejects(W.publicChecks(c,key,async()=>{throw Error('must not fetch');}),/not elapsed/);
});

test('coordinator recognition waits for indexed receipt, availability failure sends nothing, success stops new freezes',async()=>{
 const f=require('./fixtures/purchase-recognition.cjs').fixture(),c={executor:f.recognition.publisher,recognition:{...f.recognition,publication:{url:'https://example.com/notice',sha256:'a'.repeat(64),publishedAt:'2020-01-01T00:00:00Z',notBefore:'2020-01-02T00:00:00Z'}},recognitionPublishing:{enabled:true,batchSize:1,publicDirectory:path.resolve('.local/logs'),publicBaseUrl:'https://example.com/bundles'}};
 let sent=0;const args={config:c,send:async()=>{sent++;return {hash:'tx'};}},deps={history:()=>({state:{index:{head:10}}}),prepare:async()=>({bundleHash:'bundle'}),publish:()=>{},publicChecks:async()=>{throw Error('unavailable');}};
 assert.equal((await W.run({...args,lastResolved:{action:'confirm',blockNumber:11}},deps)).reason,'recognitionIndexCatchup');assert.equal(sent,0);
 await assert.rejects(W.run(args,deps),/unavailable/);assert.equal(sent,0);
 const result=await W.run(args,{...deps,publicChecks:async()=>{}});assert.equal(sent,1);assert.equal(result.status,'waiting');assert.equal(result.reason,'recognitionIndexCatchup');
});
