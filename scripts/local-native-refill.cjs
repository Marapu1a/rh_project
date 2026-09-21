// Pure local planner. Does not read RPC, sign, broadcast, reserve funds or mutate a ledger.
const {ethers}=require('ethers');
const {hash}=require('./direct-buy.cjs');
const {validateOps,evaluateBudget,transactionCost,ACTIONS}=require('./local-execution-budget.cjs');
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
const uint=(v,name)=>{check(typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v),'Invalid '+name);return BigInt(v);};
const addr=a=>{check(ethers.isAddress(a)&&a.toLowerCase()!==ethers.ZeroAddress,'Invalid address');return a.toLowerCase();};
const max=(a,b)=>a>b?a:b,min=(...ns)=>ns.reduce((a,b)=>a<b?a:b);
function configuration(ops,source,policy,protectedAddresses){
 validateOps(ops);check(['BOOTSTRAP_NATIVE','PROJECT_NATIVE'].includes(source.kind),'Explicit native ops source required');
 const origin=addr(source.address),protectedSet=[...new Set(protectedAddresses.map(addr))].sort();
 check(protectedSet.length>0,'Explicit prize custody exclusions required');
 check(!protectedSet.includes(origin),'Prize custody cannot fund operations');
 uint(source.minimumBalance,'source minimum');check(uint(source.transferGas,'transfer gas')>=21000n,'Invalid transfer gas');
 check(uint(policy.maxPerRefill,'refill cap')>0n&&uint(policy.maxPerPeriod,'period cap')>0n,'Zero spend cap');
 check(uint(policy.periodSeconds,'period')>0n,'Zero period');uint(policy.cooldownSeconds,'cooldown');
 check(Array.isArray(policy.targets)&&policy.targets.length>0,'Missing targets');
 const targets=policy.targets.map(t=>({address:addr(t.address),lowWatermark:String(uint(t.lowWatermark,'low watermark')),target:String(uint(t.target,'target'))})).sort((a,b)=>a.address.localeCompare(b.address));
 check(new Set(targets.map(t=>t.address)).size===targets.length,'Duplicate target address');
 for(const t of targets){check(BigInt(t.target)>=BigInt(t.lowWatermark),'Target below low watermark');check(t.address!==origin&&!protectedSet.includes(t.address),'Invalid ops destination');}
 const canonicalSource={kind:source.kind,address:origin,minimumBalance:source.minimumBalance,transferGas:source.transferGas};
 const canonicalPolicy={maxPerRefill:policy.maxPerRefill,maxPerPeriod:policy.maxPerPeriod,periodSeconds:policy.periodSeconds,cooldownSeconds:policy.cooldownSeconds,targets};
 return {origin,targets,domainHash:hash({network:ops.network,source:canonicalSource,policy:canonicalPolicy,protectedAddresses:protectedSet})};
}
function refillDomainHash({ops,source,policy,protectedAddresses}){return configuration(ops,source,policy,protectedAddresses).domainHash;}
function planNativeRefill(input){
 const {ops,source,policy,protectedAddresses,anchor,head,balances,obligations,history,gasObservations={}}=input;
 const {origin,targets,domainHash}=configuration(ops,source,policy,protectedAddresses);
 for(const b of [anchor,head]){uint(b.number,'block number');uint(b.timestamp,'block timestamp');check(ethers.isHexString(b.hash,32)&&b.hash!==ethers.ZeroHash,'Invalid block hash');}
 const result=(status,reason,extra={})=>({status,reason,profileId:ops.network.id,domainHash,settingsHash:hash(ops.settings),anchor:{...anchor},...extra});
 if(anchor.number!==head.number||anchor.hash!==head.hash||anchor.timestamp!==head.timestamp)return result('blocked','staleAnchor');
 check(history&&typeof history.pending==='boolean','Explicit funding history required');
 if(history.domainHash!==domainHash)return result('blocked','historyDomainMismatch');
 if(history.pending)return result('blocked','pendingFunding');
 const now=BigInt(anchor.timestamp),period=BigInt(policy.periodSeconds),window=now/period*period;
 const oldWindow=uint(history.windowStart,'history window'),spent=uint(history.spent,'history spend');
 check(oldWindow%period===0n&&oldWindow<=window,'Invalid history window');
 const last=history.lastRefillAt===null?null:uint(history.lastRefillAt,'last refill');check(last===null||last<=now,'Future funding history');
 const remainingPeriod=max(0n,BigInt(policy.maxPerPeriod)-(oldWindow===window?spent:0n));
 const effective={...ops,network:{...ops.network,gasUnits:{...ops.network.gasUnits}}};
 for(const [action,value] of Object.entries(gasObservations)){
  check(ACTIONS.includes(action),'Unknown gas observation');effective.network.gasUnits[action]=String(max(BigInt(effective.network.gasUnits[action]),uint(value,'gas observation')));
 }
 const normalized={};for(const [a,b] of Object.entries(balances)){const key=addr(a);check(normalized[key]===undefined,'Duplicate balance address');normalized[key]=String(uint(b,'balance'));}
 const budget=evaluateBudget(effective,{balances:normalized,obligations});
 check(!budget.accounts.some(a=>a.address===origin),'Funding source must be separate from execution accounts');
 if(budget.accounts.some(a=>!targets.some(t=>t.address===a.address)))return result('blocked','missingFundingTarget');
 const accounts=targets.map(t=>{
  const current=uint(normalized[t.address],'target balance'),required=BigInt(budget.accounts.find(a=>a.address===t.address)?.required||0);
  const low=max(required,BigInt(t.lowWatermark)),target=max(required,BigInt(t.target));
  return {address:t.address,current,required,shortfall:max(0n,required-current),target,needs:current<low};
 });
 const publicAccounts=accounts.map(a=>Object.fromEntries(Object.entries(a).map(([k,v])=>[k,typeof v==='bigint'?String(v):v])));
 const fundingReady=accounts.every(a=>a.shortfall===0n);
 const context={accounts:publicAccounts,fundingReady,windowStart:String(window),remainingPeriod:String(remainingPeriod)};
 const needed=accounts.filter(a=>a.needs).sort((a,b)=>Number(b.shortfall>0n)-Number(a.shortfall>0n)||a.address.localeCompare(b.address));
 if(!needed.length)return result('ready','sufficient',context);
 if(uint(input.gasPrice,'gas price')>BigInt(ops.settings.maxGasPrice))return result('waitExpensiveGas','gasPrice',context);
 if(last!==null&&now-last<BigInt(policy.cooldownSeconds))return result('blocked','cooldown',{...context,retryAt:String(last+BigInt(policy.cooldownSeconds))});
 const currentSource=uint(normalized[origin],'source balance'),gasReserve=transactionCost(ops.network,source.transferGas);
 const available=max(0n,currentSource-BigInt(source.minimumBalance));
 // Both caps cover value + conservative gas expense. Do not fund from the source floor.
 const envelope=min(available,BigInt(policy.maxPerRefill),remainingPeriod);
 if(envelope<=gasReserve)return result('blocked',available<=gasReserve?'sourceFunding':'spendCap',{...context,gasReserve:String(gasReserve)});
 const recipient=needed[0],amount=min(needed.filter(a=>a.shortfall>0n).length>1?recipient.shortfall:recipient.target-recipient.current,envelope-gasReserve);
 const after=accounts.every(a=>a.current+(a.address===recipient.address?amount:0n)>=a.required);
 const transfer={from:origin,to:recipient.address,value:String(amount),gasReserve:String(gasReserve),maxSourceDebit:String(amount+gasReserve)};
 const decisionKey=hash({domainHash,settingsHash:hash(ops.settings),anchor,transfer,history,gasObservations,accounts:publicAccounts,gasPrice:input.gasPrice});
 return result('needsRefill','nativeShortfall',{...context,transfer,fundingReadyAfter:after,decisionKey});
}
module.exports={planNativeRefill,refillDomainHash};
