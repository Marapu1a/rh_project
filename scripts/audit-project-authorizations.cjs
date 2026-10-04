// Read-only RPC audit/export for snapshots made before authorization context retention.
// Never overwrites or activates the source. Stops if accounting would change.
const fs=require('node:fs'),D=require('./direct-buy.cjs'),P=require('./project-history.cjs');
const C=require('./indexer-checksum.cjs'),check=(v,m)=>{if(!v)throw Error(m);};
async function audit({config,state,rpc}){
 const {checksum,...saved}=structuredClone(state);
 check(C.validIndexerChecksum(saved,checksum)&&saved.configHash===D.hash({kind:'persistent-buy-indexer-v1',config}),'Snapshot identity mismatch');
 check(saved.index.evidenceMode===P.SCHEMA,'Project history required');
 check(BigInt(await rpc('eth_chainId',[]))===BigInt(config.manifest.chainId),'Wrong chain');
 const canonical=async()=>check((await rpc('eth_getBlockByNumber',['0x'+BigInt(saved.index.head).toString(16),false])).hash.toLowerCase()===saved.index.blocks.at(-1).hash.toLowerCase(),'Snapshot branch changed');
 await canonical();let checkedBlocks=0,addedTransactions=0;
 for(const b of saved.index.blocks){
  if(!b.transactions.length)continue;
  const full=await rpc('eth_getBlockByNumber',['0x'+BigInt(b.number).toString(16),true]);
  check(full?.hash?.toLowerCase()===b.hash.toLowerCase()&&BigInt(full.number)===BigInt(b.number)&&Array.isArray(full.transactions),'Event block mismatch');checkedBlocks++;
  for(const row of b.transactions){const actual=full.transactions.find(t=>t.hash.toLowerCase()===row.tx.hash.toLowerCase());check(actual&&D.hash(actual.authorizationList||[])===D.hash(row.tx.authorizationList||[]),'Retained authorization mismatch');}
  const known=new Set(b.transactions.map(t=>t.tx.hash.toLowerCase()));
  for(const tx of full.transactions){
   if(!tx.authorizationList?.length||known.has(tx.hash.toLowerCase()))continue;
   const receipt=await rpc('eth_getTransactionReceipt',[tx.hash]);
   b.transactions.push({tx,receipt});addedTransactions++;
  }
 }
 const rebuilt=D.replayWithCheckpoint(saved.index.manifest,saved.index.blocks);
 check(D.hash(rebuilt.ledger)===saved.index.ledgerHash&&D.hash(rebuilt.ledger)===D.hash(saved.index.ledger),'Authorization context changes ledger; independent review required');
 await canonical();saved.index.replayCheckpoint=rebuilt.checkpoint;
 saved.checksum=C.indexerChecksum(saved);
 return {state:saved,report:{schema:'project-authorization-audit-v1',head:saved.index.head,sourceChecksum:checksum,checkedBlocks,addedTransactions,ledgerHash:saved.index.ledgerHash,ledgerUnchanged:true,activated:false}};
}
if(require.main===module){
 const [c,s,out]=process.argv.slice(2);
 Promise.resolve().then(async()=>{check(c&&s&&out&&!fs.existsSync(out)&&process.env.RH_RPC_URL,'CONFIG STATE NEW_OUTPUT and RH_RPC_URL required');
  const rpc=require('./index-read-rpc.cjs').pacedReads(require('./public-rpc-qualification.cjs').httpRpc(process.env.RH_RPC_URL));
  const result=await audit({config:JSON.parse(fs.readFileSync(c)),state:JSON.parse(fs.readFileSync(s)),rpc});
  const fd=fs.openSync(out,'wx',0o600);try{require('./indexer-json.cjs').writeIndexerJson(fd,result.state);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.writeFileSync(out+'.audit.json',JSON.stringify(result.report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result.report));
 }).catch(e=>{console.error(e.message.replace(/https?:\/\/\S+/g,'[RPC]'));process.exitCode=1;});
}
module.exports={audit};
