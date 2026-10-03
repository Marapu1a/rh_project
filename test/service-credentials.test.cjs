const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {rpc,readCredential}=require('../scripts/service-credentials.cjs');
test('credential files take a bounded name and require HTTPS without userinfo',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qianqi-credentials-')),env={CREDENTIALS_DIRECTORY:dir};
 try{
  fs.writeFileSync(path.join(dir,'rpc-url'),'https://example.invalid/private-token\n');
  assert.equal(rpc(env),'https://example.invalid/private-token');
  assert.throws(()=>readCredential('../rpc-url',env),/Unknown/);
  assert.throws(()=>rpc({}),/directory/);
  for(const value of ['http://example.invalid','https://user:secret@example.invalid','']){
   fs.writeFileSync(path.join(dir,'rpc-url'),value);assert.throws(()=>rpc(env));
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
