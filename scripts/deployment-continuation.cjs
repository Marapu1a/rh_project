// Deterministic four-step continuation. Wallet signatures remain in the browser.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers:E}=require('ethers');
const {hash}=require('./direct-buy.cjs'),B=require('./buy-policy-format.cjs'),R=require('./pons-entrypoint-buy.cjs');
const schema='qianqi-launch-continuation-v1';
function build(prefix,journal,report,compiled,settings,policyLayout){
 require('./deployment-signing-plan.cjs').validate(prefix);
 assert.equal(report.status,'REMAINING_DEPLOYMENT_FORK_PASSED');assert.equal(report.publicSends,false);
 assert.equal(report.prefixEvidence.planHash,prefix.planHash);assert.equal(journal.planHash,prefix.planHash);
 assert.equal(journal.completed.length,6);assert.equal(journal.pending,null);
 assert.equal(prefix.settingsHash,hash(settings));assert.equal(report.settingsHash,prefix.settingsHash);
 assert.equal(report.artifactHash,hash(compiled));assert.equal(prefix.artifactHash,report.artifactHash);
 assert.equal(report.predictedToken,prefix.token);assert.equal(report.predictedCurve,prefix.curve);assert.equal(report.launchSalt,prefix.salt);
 const plan={schema,authorizationToSend:false,settingsHash:hash(settings),artifactHash:hash(compiled),prefix,journal,policyLayout,manifestTemplate:report.config.manifest,
  governor:prefix.governor,chainId:4663,startNonce:prefix.startNonce+6,maxGasPrice:prefix.maxGasPrice,
  transactions:['Pons: запуск QIANQI / USDG, creator fees 3%','Правила начисления билетов','Распределение комиссий 90 / 5 / 5','Привязка collector к Pons'].map((label,i)=>({label,request:{nonce:E.toQuantity(prefix.startNonce+6+i)}})),
  next:'После четырёх подтверждений — проверка production manifest и включение сервисов отдельным шагом. Покупка101USDG не входит в эту очередь.'};
 return {...plan,planHash:hash(plan)};
}
function validate(plan){const {planHash,...body}=plan;assert.equal(planHash,hash(body));assert.equal(plan.schema,schema);assert.equal(plan.authorizationToSend,false);assert.equal(plan.transactions.length,4);require('./deployment-signing-plan.cjs').validate(plan.prefix);assert.equal(plan.startNonce,plan.prefix.startNonce+6);assert.equal(plan.governor,plan.prefix.governor);assert.equal(plan.maxGasPrice,plan.prefix.maxGasPrice);}
function createStrategy({plan,provider:p,compiled,settings,preflight}){
 validate(plan);assert.equal(hash(settings),plan.settingsHash);assert.equal(hash(compiled),plan.artifactHash);
 const prefix=plan.prefix,m0=plan.manifestTemplate,governor=plan.governor;
 const factory=new E.Contract(m0.factory,require('./integrations/pons-v2.cjs').FAB,p),collector=new E.Contract(prefix.transactions[1].predictedAddress,compiled.LocalPonsCollector.abi,p);
 const policyAddress=E.getCreateAddress({from:governor,nonce:plan.startNonce+1});
 const instance=E.id('QIANQI Short '+prefix.salt);
 const request=(i,data,to,value='0x0')=>({from:governor,chainId:'0x1237',nonce:E.toQuantity(plan.startNonce+i),value:E.toQuantity(value),data,...(to?{to}:{})});
 async function launchContext(state){
  const row=state.completed[0];assert(row?.hash,'Launch receipt required');
  const receipt=await p.getTransactionReceipt(row.hash);assert(receipt?.status===1);
  const block=await p.getBlock(receipt.blockNumber),anchor=await p.getBlock(receipt.blockNumber-1);assert.equal(block.hash,receipt.blockHash);assert.equal(block.parentHash,anchor.hash);
  const manifest={...structuredClone(m0),anchor:{number:anchor.number,hash:anchor.hash}};R.validate(manifest);
  return {receipt,block,manifest};
 }
 async function step(i,state){
  if(i>=4)return null;
  let req,summary,context,expectedRuntimeHash;
  if(i===0){
   const s=settings.metadata,params=[s.name,s.symbol,s.logo,s.description,s.socials,collector.target,300,false,prefix.economics,prefix.salt];
   req=request(i,factory.interface.encodeFunctionData('launchToken',[params,0,m0.quote]),factory.target,prefix.launchFeeWei);
   summary={token:prefix.token,curve:prefix.curve,pair:'USDG',creatorTax:'3%',creatorFeeRecipient:collector.target,launchFeeETH:E.formatEther(prefix.launchFeeWei),developerBuy:'0; покупка101USDG отдельно'};
  }else{
   context=await launchContext(state);
   if(i===1){
    const genesis=hash(context.manifest),args=[instance,genesis,settings.roles.buyPolicyPublisher,settings.buyPolicyNoticeBlocks,B.initialAdapters(context.manifest)];
    const data=(await new E.ContractFactory(compiled.BuyPolicySource.abi,compiled.BuyPolicySource.evm.bytecode.object).getDeployTransaction(...args)).data;
    req=request(i,data);expectedRuntimeHash=E.keccak256(require('./deployment-policy-runtime.cjs').runtime(compiled.BuyPolicySource,plan.policyLayout,{instanceId:instance,genesisHash:genesis,genesisAdaptersHash:B.genesisAdaptersHash(context.manifest),publisher:settings.roles.buyPolicyPublisher,noticeBlocks:settings.buyPolicyNoticeBlocks}));
    summary={policyAddress,genesisHash:genesis,anchor:context.manifest.anchor,threshold:'100 USDG',publisher:settings.roles.buyPolicyPublisher};
   }else if(i===2){
    const policy=[context.block.timestamp+settings.campaignDurationSeconds,[prefix.transactions[5].predictedAddress,settings.roles.operations,settings.roles.project],[9000,500,500]];
    req=request(i,collector.interface.encodeFunctionData('bindPromo',[policy]),collector.target);summary={endsAt:policy[0],recipients:policy[1],bps:policy[2]};
   }else {req=request(i,collector.interface.encodeFunctionData('bindVenue',[factory.target]),collector.target);summary={factory:factory.target,curve:prefix.curve,hook:m0.hook};}
  }
  return {index:i,label:plan.transactions[i].label,request:req,summary,...(i===1?{predictedAddress:policyAddress,expectedRuntimeHash}:{}),...(context?{manifest:context.manifest}:{} )};
 }
 async function verifyReceipt(s,r,block,state){
  const opts={blockTag:r.blockNumber};
  if(s.index===0){
   const record=await factory.getLaunchedToken(prefix.token,opts);
   assert(record.exists);for(const [key,value]of Object.entries({token:prefix.token,curve:prefix.curve,deployer:governor,creatorFeeRecipient:collector.target,pairToken:m0.quote}))assert.equal(record[key].toLowerCase(),value.toLowerCase(),key);
   assert.equal(record.creatorTaxBps,300n);assert.equal(record.buybackEnabled,false);
   for(const key of ['token','curve'])assert.equal(E.keccak256(await p.getCode(prefix[key],r.blockNumber)),m0.codeHashes[key]);
   const events=r.logs.filter(l=>l.address.toLowerCase()===factory.target.toLowerCase()).map(l=>{try{return factory.interface.parseLog(l);}catch{return null;}}).filter(l=>l?.name==='TokenLaunched'&&l.args.token.toLowerCase()===prefix.token.toLowerCase());assert.equal(events.length,1);
  }else if(s.index===1){
   assert.equal(E.keccak256(await p.getCode(policyAddress,r.blockNumber)),s.expectedRuntimeHash);
   const c=new E.Contract(policyAddress,compiled.BuyPolicySource.abi,p);assert.equal(await c.currentHash(opts),hash(s.manifest));assert.equal(await c.publishedCount(opts),0n);
   for(const a of B.initialAdapters(s.manifest))assert(await c.announced(a,opts));
  }else if(s.index===2){
   assert.equal((await collector.promoVault(opts)).toLowerCase(),prefix.transactions[5].predictedAddress.toLowerCase());assert.equal(await collector.campaignId(opts),1n);
   const actual=await collector.policy(1,opts);assert.equal(Number(actual.endsAt),s.summary.endsAt);assert.deepEqual([...actual.recipients].map(x=>x.toLowerCase()),s.summary.recipients.map(x=>x.toLowerCase()));assert.deepEqual([...actual.bps].map(Number),[9000,500,500]);
  }else {for(const key of ['factory','curve','hook'])assert.equal((await collector[key](opts)).toLowerCase(),s.summary[key].toLowerCase());await collector.sweepState(opts);}
 }
 async function check(s,state){
  await require('./deployment-prefix-evidence.cjs').inspect(p,prefix,plan.journal);
  const report=await preflight();assert.equal(report.status,'snapshotMatched','Preflight changed');
  assert.equal((await collector.owner()).toLowerCase(),governor.toLowerCase());
  if(s.index===0){
   assert.equal(report.launch.economics,prefix.economics,'Preflight changed');assert.equal(report.launch.feeWei,prefix.launchFeeWei,'Preflight changed');
   for(const a of [prefix.token,prefix.curve])assert.equal(await p.getCode(a),'0x','Token already exists');
   const result=factory.interface.decodeFunctionResult('launchToken',await p.call(s.request));assert.equal(result[0],prefix.token);assert.equal(result[1],prefix.curve);
  }else{
   for(const field of R.FIELDS)assert.equal(E.keccak256(await p.getCode(s.manifest[field])),s.manifest.codeHashes[field],'Route runtime drift '+field);
   await R.validateBindings(s.manifest,(method,params)=>p.send(method,params),'latest');
  }
 }
 return {validate,step,verifyReceipt,check,launchContext};
}
module.exports={build,validate,createStrategy};
if(require.main===module)(async()=>{
 const [prefixFile,journalFile,reportFile,artifactFile,output]=process.argv.slice(2);assert(output&&!fs.existsSync(output));const read=f=>JSON.parse(fs.readFileSync(f));
 const compiled=read(artifactFile),settings=require('../config/pons-deployment-candidate.json');
 const plan=build(read(prefixFile),read(journalFile),read(reportFile),compiled,settings,require('./deployment-policy-runtime.cjs').build(compiled));
 fs.writeFileSync(output,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({planHash:plan.planHash,steps:4,authorizationToSend:false}));
})().catch(()=>{console.error('Continuation build refused; secrets omitted');process.exitCode=1;});
