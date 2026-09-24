const fs=require('node:fs');
const {JsonRpcProvider}=require('ethers');
const {prepareBuyPolicy,publishBuyPolicy}=require('./publish-buy-policy.cjs');
async function main(){
 const a=process.argv.slice(2),o={};
 for(let i=0;i<a.length;i+=2){if(!['--config','--next','--rpc','--output','--local-signer','--journal'].includes(a[i])||!a[i+1]||o[a[i]])throw Error('Invalid options');o[a[i]]=a[i+1];}
 for(const k of ['--config','--next','--rpc'])if(!o[k])throw Error('Required --config FILE --next FILE --rpc URL');
 const config=JSON.parse(fs.readFileSync(o['--config'],'utf8')),next=JSON.parse(fs.readFileSync(o['--next'],'utf8'));
 if(!config.buyPolicy)throw Error('Pinned buyPolicy trust required');
 const provider=new JsonRpcProvider(o['--rpc'],undefined,{cacheTimeout:-1});
 try{
 const options={trust:config.buyPolicy,genesis:config.manifest,next,rpc:(m,p)=>provider.send(m,p)};
 if(o['--local-signer']!==undefined){
  const url=new URL(o['--rpc']);if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||(await provider.getNetwork()).chainId!==31337n)throw Error('CLI send restricted to local 31337; production wallets submit prepared calldata');
  if(!/^\d+$/.test(o['--local-signer'])||!o['--journal'])throw Error('Local signer index and journal required');
  const file=o['--journal'];let fd=fs.openSync(file,'wx');fs.writeFileSync(fd,'{"status":"reserved"}\n');fs.fsyncSync(fd);fs.closeSync(fd);
  const persist=async row=>{const temp=file+'.tmp';const handle=fs.openSync(temp,'wx');try{fs.writeFileSync(handle,JSON.stringify(row,null,2)+'\n');fs.fsyncSync(handle);}finally{fs.closeSync(handle);}fs.renameSync(temp,file);};
  const tx=await publishBuyPolicy({...options,signer:await provider.getSigner(Number(o['--local-signer'])),persist});
  console.log(JSON.stringify({status:'broadcast',transactionHash:tx.hash,journal:file}));
 }else{
  const prepared=await prepareBuyPolicy(options);const text=JSON.stringify(prepared,null,2)+'\n';
  if(o['--output'])fs.writeFileSync(o['--output'],text,{flag:'wx'});else process.stdout.write(text);
 }
 }finally{provider.destroy();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
