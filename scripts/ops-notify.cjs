// Read-only observer. Telegram failures never alter financial state or trigger sends.
const fs=require('node:fs'),path=require('node:path');
const actionable=new Set(['nativeFunding','gasPrice','unknownHash','pendingNonce','pendingReceipt','operationFailed','SCHEDULER_STORAGE_ERROR','historyUnavailable','indexerUnavailable','indexerStale','fundingUnavailable','beaconUnavailable']);
function summarize(operator,indexer){
 const reasons=(operator.reasons||[]).map(r=>r.code).filter(c=>actionable.has(c)).sort();
 const alarms=[];
 if(['attention','unavailable','stopped'].includes(operator.state))alarms.push('operator unavailable/attention');
 alarms.push(...reasons);
 if(!indexer?.ready)alarms.push('indexer not ready');
 return [...new Set(alarms)].sort().join(', ')||'ok';
}
async function deliver({file,summary,send,now=Date.now()}){
 let previous={};try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('Notification state unreadable');}
 if(summary===previous.summary&&(summary==='ok'||now-previous.sentAt<6*3600000))return 'suppressed';
 if(summary==='ok'&&!previous.summary)return 'healthy';
 await send(`QIANQI: ${summary==='ok'?'наблюдаемые службы восстановились':summary}`);
 fs.writeFileSync(file+'.tmp',JSON.stringify({summary,sentAt:now}),{mode:0o600});fs.renameSync(file+'.tmp',file);
 return 'delivered';
}
async function main(){
 const credentials=process.env.CREDENTIALS_DIRECTORY;
 const token=fs.readFileSync(path.join(credentials,'telegram-token'),'utf8').trim();
 const chat=fs.readFileSync(path.join(credentials,'telegram-chat'),'utf8').trim();
 if(!/^\d+:[A-Za-z0-9_-]+$/.test(token)||!/^\d+$/.test(chat))throw Error('Private Telegram credentials required');
 const operator=require('./ops-session.cjs').readStatus('/var/lib/qianqi-public/automation.json.status.json',15*60000);
 let indexer;try{indexer=await (await fetch('http://127.0.0.1:8789/healthz',{signal:AbortSignal.timeout(5000)})).json();}catch{}
 const result=await deliver({file:'/var/lib/qianqi-monitor/telegram.json',summary:summarize(operator,indexer),send:async text=>{
  const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chat,text}),signal:AbortSignal.timeout(10000)});
  if(!response.ok||!(await response.json()).ok)throw Error('Delivery failed');
 }});
 console.log('Notification check: '+result);
}
if(require.main===module)main().catch(()=>{console.error('Notification unavailable; inspect credentials, network and monitor state');process.exitCode=1;});
module.exports={summarize,deliver};
