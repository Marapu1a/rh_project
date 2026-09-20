const fs=require('node:fs'),path=require('node:path');
const {hash}=require('./direct-buy.cjs');
const {randomUUID}=require('node:crypto');
function inspectLock(lock){
  let fd;
  try{fd=fs.openSync(lock,'r');const stat=fs.fstatSync(fd),buffer=Buffer.alloc(128);
    const size=fs.readSync(fd,buffer,0,buffer.length,0);
    return {path:lock,exists:true,owner:buffer.subarray(0,size).toString(),mtimeMs:stat.mtimeMs,size:stat.size};
  }catch(e){return {path:lock,exists:e.code==='ENOENT'?false:null,error:e.code};}
  finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}
}
function traceLock(event,runId,lock,detail={}){
  if(process.env.LOCAL_STATE_LOCK_TRACE!=='1')return;
  try{process.stderr.write(JSON.stringify({event,runId,pid:process.pid,time:new Date().toISOString(),lock,...detail})+'\n');}catch{}
}
// One local process per state file. This is not a distributed lease or mempool journal.
async function withState(file,config,action,{legacyConfigs=[]}={}){
  file=path.resolve(file);fs.mkdirSync(path.dirname(file),{recursive:true});
  const lock=file+'.lock',runId=randomUUID();let fd;
  traceLock('acquire',runId,lock);
  try{fd=fs.openSync(lock,'wx');}
  catch(e){if(e.code==='EEXIST'){const detail=inspectLock(lock);traceLock('conflict',runId,lock,{detail});
    throw Object.assign(Error('Scheduler state locked; another process or stale lock: '+JSON.stringify(detail)),{lock:detail});}throw e;}
  traceLock('acquired',runId,lock);
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
      if(checksum!==hash(stored)||stored.schema!==state.schema)
        throw Error('Scheduler state checksum/config mismatch');
      if(!Array.isArray(stored.jobs?.SHORT)||!Array.isArray(stored.jobs?.MONTHLY))throw Error('Invalid scheduler state');
      if(stored.configHash!==state.configHash){
        if(!legacyConfigs.some(c=>hash(c)===stored.configHash))throw Error('Scheduler state checksum/config mismatch');
        if(stored.pending)throw Error('Resolve pending with previous configuration before enabling budget profile');
        stored.configHash=state.configHash;save(stored);
      }
      state=stored;
    }
    return await action(state,save);
  }finally{
    traceLock('release',runId,lock);
    try{fs.unlinkSync(lock);if(process.env.LOCAL_STATE_LOCK_TRACE==='1')traceLock('released',runId,lock,{remaining:inspectLock(lock)});}
    catch(e){traceLock('releaseError',runId,lock,{code:e.code});throw e;}
  }
}
module.exports={withState,inspectLock};
