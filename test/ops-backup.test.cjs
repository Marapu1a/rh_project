const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {backup,restore}=require('../scripts/ops-backup.cjs');
test('offline copy preserves intents; restore stages only new paths and rejects corruption or locks',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qianqi-backup-')),source=path.join(root,'live'),copy=path.join(root,'backup');fs.mkdirSync(source);const file=path.join(source,'automation.json');fs.writeFileSync(file,'{"pending":{"transactionHash":null}}');
 try{
  fs.writeFileSync(file+'.lock','owner');assert.throws(()=>backup(source,copy),/Stop writers/);fs.unlinkSync(file+'.lock');
  fs.writeFileSync(path.join(source,'__proto__'),'must be hashed');
  assert(Object.hasOwn(backup(source,copy).files,'__proto__'));fs.writeFileSync(file,'newer state');assert.throws(()=>restore(copy,source),/New destination/);
  const result=restore(copy,path.join(root,'staged'));assert.equal(result.activation,false);assert.equal(fs.readFileSync(file,'utf8'),'newer state');assert.match(fs.readFileSync(path.join(root,'staged/automation.json'),'utf8'),/pending/);
  fs.appendFileSync(path.join(copy,'state/automation.json'),'x');assert.throws(()=>restore(copy,path.join(root,'bad')),/integrity/);
 }finally{function clean(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())clean(f);else fs.unlinkSync(f);}fs.rmdirSync(dir);}clean(root);}
});
