// Local read-only HTTP boundary. No signer, RPC credentials or transaction methods.
const fs=require('node:fs'),http=require('node:http');
const {isAddress}=require('ethers');
const {hash}=require('./direct-buy.cjs');
const {replayAttempts}=require('./attempt-lifecycle.cjs');
function walletStatus({config,wallet,offset=0,limit=25,now=Date.now()}){
 if(!isAddress(wallet)||!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Object.assign(Error('Invalid query'),{status:400});
 const unavailable=()=>({schema:'promo-wallet-status-v1',status:'unavailable',wallet:wallet.toLowerCase(),balances:null,purchases:null,rewards:null});
 try{
  const {checksum,...state}=JSON.parse(fs.readFileSync(config.indexer.statePath,'utf8'));
  if(checksum!==hash(state)||state.configHash!==hash({kind:'persistent-buy-indexer-v1',config})||state.index?.policyStatus?.mode!=='admitted'||!config.lifecycle)return unavailable();
  const index=state.index,ledger=replayAttempts(index.manifest,config.lifecycle,index.blocks);
  if(ledger.head.number!==index.head||hash(ledger.buyLedger)!==index.ledgerHash)return unavailable();
  const age=now-Date.parse(index.observedAt),fresh=['caughtUp','catchingUp'].includes(state.status?.state)&&Number.isFinite(age)&&age>=0&&age<=config.indexer.maxAgeSeconds*1000;
  const address=wallet.toLowerCase(),balance=ledger.wallets.find(w=>w.wallet===address),buy=ledger.buyLedger.wallets.find(w=>w.wallet===address);
  const empty=()=>({mintedTotal:'0',open:'0',frozenByDraw:{},consumedTotal:'0'});
  const decisions=ledger.buyLedger.decisions.filter(d=>d.payer?.toLowerCase()===address);
  const purchases=decisions.slice(offset,offset+limit).map(d=>Object.fromEntries(['transactionHash','blockNumber','blockHash','logIndex','status','reason','grossQuoteRaw','netQuoteDebitRaw','entriesMinted'].filter(k=>d[k]!==undefined).map(k=>[k,d[k]])));
  let rewards=null;
  if(index.rewards){
   const projected=require('./reward-observation.cjs').projectRewards(index.blocks,config.lifecycle.vault);
   if(BigInt(index.rewards.blockTag)!==BigInt(index.head)||hash(projected)!==hash({draws:index.rewards.draws,rewards:index.rewards.rewards}))return unavailable();
   const rows=projected.rewards.filter(r=>r.winner===address);
   rewards={items:rows.slice(offset,offset+limit),offset,limit,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,coverage:'vault-events-and-checkpointed-storage',vault:config.lifecycle.vault};
  }
  return {schema:'promo-wallet-status-v1',status:fresh?'observed':'stale',wallet:address,
   provenance:{chainId:String(config.manifest.chainId),anchor:config.manifest.anchor,head:ledger.head,manifestHash:hash(index.manifest),ledgerHash:index.ledgerHash,observedAt:index.observedAt??null,ageSeconds:Number.isFinite(age)?Math.max(0,Math.floor(age/1000)):null,indexerState:state.status?.state??'unknown',targetBlock:state.status?.targetBlock??null,canonicality:'saved-observation-not-live-finality'},
   balances:{SHORT:balance?.SHORT??empty(),MONTHLY:balance?.MONTHLY??empty(),carryRaw:buy?.carryRaw??'0',entryThresholdRaw:config.manifest.entryThresholdRaw,quoteDecimals:config.manifest.quoteDecimals},
   purchases:{items:purchases,offset,limit,total:decisions.length,nextOffset:offset+purchases.length<decisions.length?offset+purchases.length:null,coverage:'decoded-payer-attributed-candidates-only; absence-is-not-rejection'},rewards};
 }catch{return unavailable();}
}
function createServer(config){return http.createServer((req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
 try{
  if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});res.end(JSON.stringify({error:'methodNotAllowed'}));return;}
  const u=new URL(req.url,'http://localhost'),match=/^\/v1\/wallets\/(0x[0-9a-fA-F]{40})$/.exec(u.pathname);
  if(!match){res.writeHead(404);res.end(JSON.stringify({error:'notFound'}));return;}
  const o=u.searchParams.get('offset')??'0',l=u.searchParams.get('limit')??'25';
  if([...u.searchParams.keys()].some(k=>!['offset','limit'].includes(k))||u.searchParams.getAll('offset').length>1||u.searchParams.getAll('limit').length>1||!/^\d+$/.test(o)||!/^\d+$/.test(l))throw Object.assign(Error(),{status:400});
  const result=walletStatus({config,wallet:match[1],offset:Number(o),limit:Number(l)});
  res.writeHead(result.status==='unavailable'?503:200);res.end(JSON.stringify(result));
 }catch(e){res.writeHead(e.status===400?400:503);res.end(JSON.stringify({error:e.status===400?'invalidQuery':'unavailable'}));}
});}
if(require.main===module){try{
 const [file,portText='8787']=process.argv.slice(2),port=Number(portText);
 if(!file||!Number.isInteger(port)||port<1||port>65535)throw Error();
 const config=JSON.parse(fs.readFileSync(file,'utf8')),server=createServer(config);
 server.on('error',()=>{console.error('Status API failed to listen');process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>console.log('Status API listening on 127.0.0.1:'+port));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
}catch{console.error('Usage: CONFIG [PORT]');process.exitCode=1;}}
module.exports={walletStatus,createServer};
