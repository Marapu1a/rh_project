const {ethers}=require('ethers');
const {hash}=require('./direct-buy.cjs');
const ACTIONS=['begin','publish','seal','processShort','finishShort','beginMonth','publishMonth','sealMonth','processMonth','finishMonth','closeEmpty','collect','harvest','sync','pay','syncUSDG','forwardQuote','convert'];
const PUBLISHER=new Set(['begin','publish','beginMonth','publishMonth','closeEmpty']);
const check=(ok,message)=>{if(!ok)throw Error(message);};
const uint=(v,name)=>{check(typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v),'Invalid '+name);return BigInt(v);};
const address=a=>{check(ethers.isAddress(a)&&a!==ethers.ZeroAddress,'Invalid budget account');return a.toLowerCase();};
function validateOps(ops){
  check(ops?.schema==='local-execution-budget-v1','Explicit local execution budget required');
  const n=ops.network,s=ops.settings;
  check(n?.chainId==='31337'&&n.nativeDecimals===18&&typeof n.id==='string'&&n.id.length>0,'Local network profile required');
  check(['LOCAL_EIP1559','LOCAL_EIP1559_EXTRA'].includes(n.feeModel),'Unsupported fee model');
  check(uint(n.reserveGasPrice,'reserveGasPrice')>0n,'Zero reserve price');
  const extra=uint(n.extraFeePerTx,'extraFeePerTx');check(n.feeModel!=='LOCAL_EIP1559'||extra===0n,'Plain EVM has no extra model fee');
  uint(n.signerBuffer,'signerBuffer');
  check(Number.isInteger(n.safetyBps)&&n.safetyBps>=10000&&n.safetyBps<=30000,'Invalid safety factor');
  for(const action of ACTIONS)check(uint(n.gasUnits?.[action],action)>0n,'Zero action gas bound');
  check(s&&uint(s.maxGasPrice,'maxGasPrice')>0n&&BigInt(s.maxGasPrice)<=BigInt(n.reserveGasPrice),'Gas threshold exceeds model ceiling');
  check(Number.isInteger(s.pollSeconds)&&s.pollSeconds>=1&&s.pollSeconds<=86400,'Invalid polling');
  check(Number.isInteger(s.receiptTimeoutMs)&&s.receiptTimeoutMs>=1&&s.receiptTimeoutMs<=300000,'Invalid receipt timeout');
  return ops;
}
function transactionCost(network,units){
  const raw=uint(String(units),'gas units')*BigInt(network.reserveGasPrice)+BigInt(network.extraFeePerTx);
  return (raw*BigInt(network.safetyBps)+9999n)/10000n;
}
// Pure native-unit forecast; balances are grouped by ADDRESS, never by role.
function evaluateBudget(ops,{balances,obligations,extra}){
  validateOps(ops);const n=ops.network,needs=new Map(),gasPayers=new Set(),ids=new Set();
  const add=(who,amount)=>{who=address(who);needs.set(who,(needs.get(who)||0n)+amount);};
  const gas=(who,amount)=>{gasPayers.add(address(who));add(who,amount);};
  for(const o of obligations){
    check(typeof o.id==='string'&&!ids.has(o.id),'Duplicate obligation');ids.add(o.id);
    for(const [action,count] of Object.entries(o.counts)){
      check(ACTIONS.includes(action)&&Number.isSafeInteger(count)&&count>=0,'Invalid operation count');
      if(count)gas(PUBLISHER.has(action)?o.publisher:o.executor,BigInt(count)*transactionCost(n,n.gasUnits[action]));
    }
    if(o.rng)add(o.rng.controller,uint(o.rng.fee,'RNG fee')+uint(o.rng.floor,'RNG floor'));
  }
  if(extra)gas(extra.payer,transactionCost(n,extra.gasLimit));
  for(const payer of gasPayers)add(payer,BigInt(n.signerBuffer));
  const accounts=[...needs].map(([who,required])=>{
    const balance=uint(balances[who],'native balance');
    return {address:who,required:String(required),balance:String(balance),shortfall:String(required>balance?required-balance:0n)};
  });
  return {ready:accounts.every(a=>a.shortfall==='0'),accounts,obligations:obligations.map(o=>({id:o.id,counts:o.counts})),profileId:n.id,policyHash:hash(ops.settings)};
}
const number=v=>{const n=Number(v);check(Number.isSafeInteger(n)&&n>=0,'Invalid on-chain count');return n;};
const zero=ethers.ZeroHash;
async function collectExecutionObligations({provider,short,monthly,publisher,executor,chunkSize,head,request,action,worker}){
  const at={blockTag:head.number};
  const roles={publisher:publisher?await publisher.getAddress():undefined,executor:await executor.getAddress()};
  const obligations=[],committedObligations=[],candidateObligations=[];let currentIncluded=false;
  const isShort=request.to.toLowerCase()===short.target.toLowerCase(),isMonth=request.to.toLowerCase()===monthly.target.toLowerCase();
  const drawAction=worker==='draw'&&action!=='closeEmpty';
  check(worker!=='draw'||isShort||isMonth,'Unknown draw controller');
  for(const [kind,source] of [['SHORT',short],['MONTHLY',monthly]]){
    const s=kind==='SHORT',pending=await source[s?'pendingDatasetDraw':'pendingMonth'](at);
    const current=drawAction&&(s?isShort:isMonth);
    let o;
    if(pending!==zero){
      const state=await source[s?'settlements':'month'](pending,at);
      const chunks=number(await source[s?'datasetChunkCount':'monthChunkCount'](s?state.proposalId:pending,at));
      const left=chunks-number(state.nextChunk);check(left>=0,'Invalid pending chunk progress');
      o={id:kind+':'+pending,...roles,counts:{[s?'processShort':'processMonth']:left,[s?'finishShort':'finishMonth']:1}};
      if(current)currentIncluded=true;
    }else if(current){
      const active=await source[s?'activeProposal':'activeMonth'](at);
      let id,total,published=0,chunks=0,begin=0;
      if(active===zero){
        check(action===(s?'begin':'beginMonth'),'Missing active budget job');
        const parsed=source.interface.parseTransaction(request),r=parsed.args[s?1:0];
        id=r.drawId;total=number(s?r.expectedCount:r.count);begin=1;
      }else{
        const state=await source[s?'datasetProposal':'month'](active,at);
        id=s?state.request.drawId:active;total=number(s?state.request.expectedCount:state.input.count);
        published=number(state.count);chunks=number(await source[s?'datasetChunkCount':'monthChunkCount'](active,at));
      }
      check(total>=published&&total>0,'Invalid publication budget');
      const remaining=Math.ceil((total-published)/chunkSize);
      const random=new ethers.Contract(await source.randomProvider(at),['function fee() view returns(uint256)'],provider);
      o={id:kind+':'+id,...roles,counts:{[s?'begin':'beginMonth']:begin,[s?'publish':'publishMonth']:remaining,
        [s?'seal':'sealMonth']:1,[s?'processShort':'processMonth']:chunks+remaining,[s?'finishShort':'finishMonth']:1},
        rng:{controller:source.target,fee:String(await random.fee(at)),floor:String(await source.nativeFloor(at))}};
      currentIncluded=true;
    }
    if(o){obligations.push(o);(pending!==zero?committedObligations:candidateObligations).push(o);}
  }
  return {roles,obligations,committedObligations,candidateObligations,currentIncluded};
}
async function checkExecutionBudget({ops,provider,short,monthly,publisher,executor,prizeExecutor,chunkSize,request,action,worker}){
  validateOps(ops);const head=await provider.getBlock('latest'),n=ops.network;
  const wait=reason=>({ready:false,reason,profileId:n.id,policyHash:hash(ops.settings)});
  check(request.type===2&&BigInt(request.maxPriorityFeePerGas)===0n,'Unsupported transaction fee policy');
  if(BigInt(request.maxFeePerGas)>BigInt(ops.settings.maxGasPrice))return wait('gasPrice');
  check(ACTIONS.includes(action),'Unbudgeted action');
  if(BigInt(request.gasLimit)>BigInt(n.gasUnits[action]))return wait('actionGasBound');
  const {roles,obligations,committedObligations,candidateObligations,currentIncluded}=await collectExecutionObligations({provider,short,monthly,publisher,executor,chunkSize,head,request,action,worker});
  // Unfrozen OTHER preparations are not committed liabilities. A second seal rechecks
  // the first frozen draw against the same remaining signer balance before admission.
  const payer=worker==='prize'?await prizeExecutor.getAddress():PUBLISHER.has(action)?roles.publisher:roles.executor;
  const extra=currentIncluded?undefined:{payer,gasLimit:String(request.gasLimit)};
  const requiredActions=new Set([action]);
  for(const o of obligations)for(const [method,count] of Object.entries(o.counts))if(count)requiredActions.add(method);
  if([...requiredActions].some(a=>BigInt(n.gasUnits[a])>head.gasLimit))return wait('blockGasBound');
  const accounts=new Set([address(payer)]);
  for(const o of obligations){for(const [method,count] of Object.entries(o.counts))if(count)accounts.add(address(PUBLISHER.has(method)?o.publisher:o.executor));if(o.rng)accounts.add(address(o.rng.controller));}
  const balances={};for(const who of accounts)balances[who]=String(await provider.getBalance(who,head.number));
  const result=evaluateBudget(ops,{balances,obligations,extra});
  if((await provider.getBlock(head.number))?.hash!==head.hash)return wait('chainChanged');
  return {...result,reason:result.ready?undefined:'nativeFunding',committedObligations,candidateObligations:extra?[...candidateObligations,{id:'operation:'+action,publisher:payer,executor:payer,counts:{[action]:1}}]:candidateObligations,anchor:{number:String(head.number),hash:head.hash,timestamp:String(head.timestamp)}};
}
module.exports={ACTIONS,validateOps,transactionCost,evaluateBudget,checkExecutionBudget,collectExecutionObligations};
