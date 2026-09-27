// Offline handoff within one deployment. No transactions and no automatic unlocks.
const fs=require('node:fs'),path=require('node:path'),{ethers}=require('ethers');
const {withState}=require('./local-scheduler-state.cjs');
const {prepareRuntime,normalize}=require('./promo-automation.cjs');
const {hash}=require('./direct-buy.cjs');
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
function physical(file){
 const parent=fs.realpathSync(path.dirname(path.resolve(file)));
 if(fs.existsSync(file))check(!fs.lstatSync(file).isSymbolicLink(),'Symlink runtime not supported');
 return path.join(parent,path.basename(file)).toLowerCase();
}
async function handoffRuntime(previous,next,{afterRetire=async()=>{}}={}){
 const old=await prepareRuntime(previous),fresh=await prepareRuntime(next);
 check(!old.dual||fresh.dual,'Handoff cannot disable Monthly automation');
 check(previous.provider===next.provider&&same(old.sender,fresh.sender),'Handoff must preserve provider and signer');
 check(previous.rpcUrl===next.rpcUrl,'Handoff must preserve RPC');
 for(const key of ['collector','adapter','vault','short','monthly'])check(same(previous[key].target,next[key].target),'Handoff cannot change deployment '+key);
 for(const key of ['manifest','lifecycle','buyPolicy'])check(hash(previous.schedulerConfig[key]??null)===hash(next.schedulerConfig[key]??null),'Handoff cannot change BUY/lifecycle policy');
 check(BigInt(next.fundingJob.campaignId)>=BigInt(previous.fundingJob.campaignId),'Campaign cannot go backwards');
 fs.mkdirSync(path.dirname(fresh.files.main),{recursive:true});
 const names=[...Object.values(old.files),...Object.values(fresh.files)].flatMap(f=>[f,f+'.lock',f+'.tmp']).map(physical);
 check(new Set(names).size===names.length,'Runtime paths overlap');
 check(fs.existsSync(old.files.main),'Previous runtime state required');
 const token=hash({from:old.identity,to:fresh.identity});
 const oldConfigs={main:old.identity,funding:normalize({worker:'infinity-v1',job:previous.fundingJob,sender:old.sender}),rng:normalize({worker:'drand-delivery-v1',job:previous.deliveryJob,sender:old.sender}),scheduler:previous.schedulerConfig};
 const newConfigs={main:fresh.identity,funding:normalize({worker:'infinity-v1',job:next.fundingJob,sender:fresh.sender}),rng:normalize({worker:'drand-delivery-v1',job:next.deliveryJob,sender:fresh.sender}),scheduler:next.schedulerConfig};
 const snapshots={},writers={};
 async function lockAll(entries,i,action){if(i===entries.length)return action();const [key,file,config]=entries[i];return withState(file,config,async(s,save)=>{snapshots[key]=s;writers[key]=save;return lockAll(entries,i+1,action);});}
 // Same ordering as the worker: main then children. Never hold a child while acquiring main.
 const entries=Object.keys(old.files).map(k=>['old:'+k,old.files[k],oldConfigs[k]]);
 return lockAll(entries,0,async()=>{
  const root=snapshots['old:main'];
  if(root.handoff)check(root.handoff.token===token&&root.handoff.target===fresh.files.main,'Different handoff already committed');
  for(const k of Object.keys(old.files))check(!snapshots['old:'+k].pending,'Resolve '+k+' pending in previous runtime first');
  const p=previous.provider,at=await p.getBlock('latest'),tag={blockTag:at.number};
  check(await p.getTransactionCount(old.sender,'pending')===await p.getTransactionCount(old.sender,'latest'),'Signer has pending transactions');
  for(const [kind,c,active,pending]of [['SHORT',previous.short,'activeProposal','pendingDatasetDraw'],['MONTHLY',previous.monthly,'activeMonth','pendingMonth']]){
   check(await c[active](tag)===ethers.ZeroHash&&await c[pending](tag)===ethers.ZeroHash,'Finish active '+kind+' before handoff');
   for(const entry of snapshots['old:scheduler'].jobs[kind]){
    if(entry.empty){check(String(await c[kind==='SHORT'?'drainingShortEpoch':'drainingMonthlyEpoch'](tag))!==String(entry.empty.epoch),'Finish empty epoch job');continue;}
    const j=entry.job;check(j?.artifact?.request,'Invalid stored job');
    const state=kind==='SHORT'?await c.datasetProposal(j.proposalId,tag):await c.month(j.artifact.request.drawId,tag);
    const phase=kind==='SHORT'?state.status:state.phase;
    check(kind==='SHORT'?phase===3n||phase===4n||(phase===0n&&!entry.started):phase===5n||phase===6n||(phase===0n&&!entry.started),'Unfinished or disappeared job');
   }
  }
  for(const k of Object.keys(old.files)){
   const s=snapshots['old:'+k],r=s.lastResolved;
   if(r?.transactionHash){const receipt=await p.getTransactionReceipt(r.transactionHash);check(receipt&&same(receipt.blockHash,r.blockHash)&&same((await p.getBlock(receipt.blockNumber))?.hash,receipt.blockHash),'Resolved journal receipt reorg');}
  }
  for(const cursor of [root.payoutCursor,root.monthlyPayoutCursor,...(root.payouts||[]).map(x=>({number:x.blockNumber,hash:x.blockHash}))])if(cursor)check(same((await p.getBlock(cursor.number))?.hash,cursor.hash),'Payout history reorg');
  const job=next.fundingJob,c=next.collector;
  check(await c.campaignId(tag)===BigInt(job.campaignId),'Next campaign not on chain');
  check(same(ethers.keccak256(await p.getCode(c.target,at.number)),job.collectorCodeHash)&&same(await c.sourceFingerprint(tag),job.sourceFingerprint)&&same(await c.source(tag),job.source),'Next source mismatch');
  check(same((await p.getBlock(job.anchor.number))?.hash,job.anchor.hash),'Next funding anchor mismatch');
  check(same((await p.getBlock(next.deliveryJob.anchor.number))?.hash,next.deliveryJob.anchor.hash),'Next RNG anchor mismatch');
  const policy=await c.policy(job.campaignId,tag);
  check(policy.recipients.every((a,i)=>same(a,job.recipients[i]))&&policy.bps.every((b,i)=>b===BigInt(job.bps[i])),'Next campaign policy mismatch');
  for(const w of job.legacy){const policy=await c.policy(w.campaignId,tag);check(same(policy.recipients[w.slot],w.recipient),'Invalid next legacy witness');}
  for(const address of new Set([...previous.fundingJob.recipients,...previous.fundingJob.legacy.map(w=>w.recipient)])){
   if(address===ethers.ZeroAddress||await c.credit(address,tag)===0n)continue;
   check(job.recipients.some(a=>same(a,address))||job.legacy.some(w=>same(w.recipient,address)),'Next job drops unpaid creator credit');
  }
  check(same((await p.getBlock(at.number))?.hash,at.hash),'Handoff chain changed');
  // Destination may only exist if it was created by this exact interrupted handoff.
  const existed=fs.existsSync(fresh.files.main);
  if(!root.handoff||!existed)for(const f of Object.values(fresh.files))check(!fs.existsSync(f),'Destination already exists');
  return lockAll(Object.keys(fresh.files).map(k=>['new:'+k,fresh.files[k],newConfigs[k]]),0,async()=>{
   const target=snapshots['new:main'];
   if(existed)check(target.predecessor?.token===token,'Destination belongs to another runtime');
   for(const k of Object.keys(fresh.files))check(!snapshots['new:'+k].pending,'Destination has pending work');
   if(target.predecessor?.token===token)return {status:'complete',alreadyCompleted:true,target:fresh.files.main};
   // Durable tombstone first: old worker must stop even if the next save crashes.
   root.handoff={token,target:fresh.files.main,configHash:hash(fresh.identity),blockNumber:at.number,blockHash:at.hash};writers['old:main'](root);
   await afterRetire();
   target.predecessor={token,source:old.files.main};writers['new:main'](target);
   // Child files remain uncreated until their first normal pass. Canonical payout replay starts from genesis.
   return {status:'complete',alreadyCompleted:false,target:fresh.files.main};
  });
 });
}
module.exports={handoffRuntime};
