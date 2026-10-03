const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
function verify(directory){
 const root=fs.realpathSync(directory),m=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8'));
 if(m.schema!=='qianqi-runtime-build-v1'||m.publicExecution!==false||!m.files||!Object.keys(m.files).length)throw Error('Invalid release manifest');
 for(const [name,expected]of Object.entries(m.files)){
  if(name.includes('\\')||name.split('/').some(p=>!p||p==='.'||p==='..')||path.isAbsolute(name))throw Error('Invalid release path');
  const file=path.join(root,name),real=fs.realpathSync(file);
  if(!real.startsWith(root+path.sep)||!fs.statSync(file).isFile()||createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==expected)throw Error('Release file mismatch: '+name);
 }
 return {status:'verified',files:Object.keys(m.files).length,publicExecution:false};
}
if(require.main===module){try{console.log(JSON.stringify(verify(process.argv[2])));}catch{console.error('Release integrity verification failed');process.exitCode=78;}}
module.exports={verify};
