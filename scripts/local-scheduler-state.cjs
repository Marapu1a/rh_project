const fs=require('node:fs'),path=require('node:path');
const {hash}=require('./direct-buy.cjs');
// One local process per state file. This is not a distributed lease or mempool journal.
async function withState(file,config,action){
  file=path.resolve(file);fs.mkdirSync(path.dirname(file),{recursive:true});
  const lock=file+'.lock';let fd;
  try{fd=fs.openSync(lock,'wx');}
  catch(e){if(e.code==='EEXIST')throw Error('Scheduler state locked; another process or stale lock: '+lock);throw e;}
  fs.writeFileSync(fd,String(process.pid));fs.closeSync(fd);
  const save=state=>{
    try{
    const payload={...state};delete payload.checksum;
    const encoded=JSON.stringify({...payload,checksum:hash(payload)},null,2)+'\n';
    const temp=file+'.tmp';let out;
    try{out=fs.openSync(temp,'w');fs.writeFileSync(out,encoded);fs.fsyncSync(out);}
    finally{if(out!==undefined)fs.closeSync(out);}
    fs.renameSync(temp,file);
    }catch(e){e.code='SCHEDULER_STORAGE_ERROR';throw e;}
  };
  try{
    let state={schema:'local-scheduler-state-v1',configHash:hash(config),jobs:{SHORT:[],MONTHLY:[]}};
    if(fs.existsSync(file)){
      const {checksum,...stored}=JSON.parse(fs.readFileSync(file,'utf8'));
      if(checksum!==hash(stored)||stored.schema!==state.schema||stored.configHash!==state.configHash)
        throw Error('Scheduler state checksum/config mismatch');
      if(!Array.isArray(stored.jobs?.SHORT)||!Array.isArray(stored.jobs?.MONTHLY))throw Error('Invalid scheduler state');
      state=stored;
    }
    return await action(state,save);
  }finally{fs.unlinkSync(lock);}
}
module.exports={withState};
