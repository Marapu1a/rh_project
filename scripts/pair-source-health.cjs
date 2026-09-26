// Read-only diagnostics for an independently approved PAIR native mode1 deployment.
const {ethers}=require('ethers');
const {hash}=require('./direct-buy.cjs');
const ROLES=['token','quote','feeRouter','vault','positionManager','hook','poolManager','registry'];
const SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const address=x=>typeof x==='string'&&ethers.isAddress(x)&&x!==ethers.ZeroAddress;
const digest=x=>typeof x==='string'&&/^0x[0-9a-fA-F]{64}$/.test(x)&&x!==ethers.ZeroHash;
const positive=x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x);
const eq=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
function check(ok,message){if(!ok)throw Error(message);}
function fields(x,names){check(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>names.includes(k))&&names.every(k=>Object.hasOwn(x,k)),'Unexpected or missing manifest fields');}
function validateManifest(m,expectedHash){
 check(digest(expectedHash)&&hash(m)===expectedHash,'Independent manifest hash mismatch');
 fields(m,['schema','chainId','anchor','contracts','positionId','sourceEpoch','poolKey','futureLaunch']);
 check(m.schema==='pair-source-health-v1'&&positive(m.chainId)&&positive(m.positionId)&&positive(m.sourceEpoch),'Invalid source identity');
 fields(m.anchor,['number','hash']);check(Number.isSafeInteger(m.anchor.number)&&m.anchor.number>=0&&digest(m.anchor.hash),'Invalid deployment anchor');
 fields(m.contracts,ROLES);
 for(const pin of Object.values(m.contracts)){
  fields(pin,['address','codeHash','implementation']);check(address(pin.address)&&digest(pin.codeHash)&&pin.codeHash!==ethers.keccak256('0x'),'Invalid contract pin');
  if(pin.implementation!==null){const i=pin.implementation;fields(i,['kind','address','codeHash']);check(['eip1967','eip1167'].includes(i.kind)&&address(i.address)&&digest(i.codeHash)&&i.codeHash!==ethers.keccak256('0x'),'Invalid implementation pin');}
 }
 check(new Set(Object.values(m.contracts).map(p=>p.address.toLowerCase())).size===ROLES.length,'Role addresses overlap');
 check(m.contracts.token.implementation?.kind==='eip1167','Native TOKEN clone implementation must be pinned');
 check(Array.isArray(m.poolKey)&&m.poolKey.length===5,'Invalid PoolKey');
 const [a,b,fee,tick,hook]=m.poolKey;
 check(address(a)&&address(b)&&BigInt(a)<BigInt(b)&&fee===10000&&tick===200&&eq(hook,m.contracts.hook.address),'Invalid native pool');
 check([a,b].some(x=>eq(x,m.contracts.token.address))&&[a,b].some(x=>eq(x,m.contracts.quote.address)),'Pool assets mismatch');
 if(m.futureLaunch!==null){fields(m.futureLaunch,['coordinator','handler','version']);check(address(m.futureLaunch.coordinator)&&address(m.futureLaunch.handler)&&positive(m.futureLaunch.version),'Invalid future launch expectation');}
 return m;
}
function poolId(key){return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address','address','uint24','int24','address'],key));}
async function inspectSource({provider,manifest,expectedHash}){
 const m=validateManifest(manifest,expectedHash),issues=[],observations=[];
 const report={schema:'pair-source-health-report-v1',manifestHash:expectedHash,checkedAt:new Date().toISOString(),status:'unavailable',issues,observations,
  scope:'Pinned source bindings/code only; not collection simulation, finality, solvency or prize readiness'};
 const problem=(scope,kind,check,details)=>issues.push({scope,kind,check,...details});
 async function read(label,fn,scope='source'){
  try{const value=await fn();observations.push({check:label,value: /(?:\.code|Code)$/.test(label)?{hash:ethers.keccak256(value),bytes:(value.length-2)/2}:value});return {ok:true,value};}
  catch(e){problem(scope,'unavailable',label,{code:e.code||'READ_FAILED',message:e.shortMessage||e.message});return {ok:false};}
 }
 function match(label,actual,expected,scope='source'){
  if(!eq(actual,expected))problem(scope,'changed',label,{expected:String(expected),actual:String(actual)});
 }
 const network=await read('chainId',async()=>String((await provider.getNetwork()).chainId));
 if(!network.ok)return report;
 if(network.value!==m.chainId){problem('source','changed','chainId',{expected:m.chainId,actual:network.value});report.status='changed';return report;}
 const anchor=await read('deploymentAnchor',()=>provider.getBlock(m.anchor.number));
 if(!anchor.ok)return report;
 if(!anchor.value){problem('source','unavailable','deploymentAnchorMissing',{});return report;}
 if(!eq(anchor.value.hash,m.anchor.hash)){problem('source','changed','deploymentAnchor',{expected:m.anchor.hash,actual:anchor.value.hash});report.status='changed';return report;}
 const head=await read('head',()=>provider.getBlock('latest'));
 if(!head.ok)return report;
 if(!head.value){problem('source','unavailable','headMissing',{});return report;}
 const block=head.value.number;report.block={number:block,hash:head.value.hash,timestamp:head.value.timestamp};
 if(block<m.anchor.number){problem('source','unavailable','headBeforeDeployment',{});return report;}
 for(const role of ROLES){
  const pin=m.contracts[role],r=await read(role+'.code',()=>provider.getCode(pin.address,block));
  if(r.ok){match(role+'.codeHash',ethers.keccak256(r.value),pin.codeHash);
   const i=pin.implementation;
   if(i?.kind==='eip1167')match(role+'.clone',r.value,'0x363d3d373d3d3d363d73'+i.address.slice(2)+'5af43d82803e903d91602b57fd5bf3');
  }
  const i=pin.implementation;
  if(i){
   if(i.kind==='eip1967'){
    const slot=await read(role+'.implementationSlot',()=>provider.getStorage(pin.address,SLOT,block));
    if(slot.ok)match(role+'.implementationSlot',slot.value,ethers.zeroPadValue(i.address,32));
   }
   const code=await read(role+'.implementationCode',()=>provider.getCode(i.address,block));
   if(code.ok)match(role+'.implementationHash',ethers.keccak256(code.value),i.codeHash);
  }
 }
 async function call(role,signature,args=[],scope='source'){
  const abi=new ethers.Interface([signature]),fn=abi.fragments[0];
  return read(role+'.'+fn.name,async()=>{
   const data=await provider.call({to:m.contracts[role].address,data:abi.encodeFunctionData(fn,args),blockTag:block});
   return Array.from(abi.decodeFunctionResult(fn,data));
  },scope);
 }
 async function scalar(role,name,type,expected,args=[],input=''){
  const r=await call(role,`function ${name}(${input}) view returns(${type})`,args);if(r.ok)match(role+'.'+name,r.value[0],expected);
 }
 const c=m.contracts;
 for(const [role,method,type,value]of [
  ['feeRouter','projectToken','address',c.token.address],['feeRouter','quoteToken','address',c.quote.address],
  ['feeRouter','pairVault','address',c.vault.address],['feeRouter','positionId','uint256',m.positionId],['feeRouter','sourceEpoch','uint64',m.sourceEpoch],
  ['vault','projectToken','address',c.token.address],['vault','positionManager','address',c.positionManager.address],
  ['vault','positionCount','uint256','1'],['vault','policyController','address',c.registry.address],['vault','modeId','uint32','1'],['vault','epoch','uint64',m.sourceEpoch],
  ['positionManager','poolManager','address',c.poolManager.address]])await scalar(role,method,type,value);
 await scalar('vault','epochRecipientCount','uint256','1',[m.sourceEpoch],'uint64');
 const recipient=await call('vault','function epochRecipient(uint64,uint256) view returns(address,uint16)',[m.sourceEpoch,0]);
 if(recipient.ok){match('recipient.address',recipient.value[0],c.feeRouter.address);match('recipient.share',recipient.value[1],'10000');}
 await scalar('registry','vaultOf','address',c.vault.address,[c.token.address],'address');
 await scalar('positionManager','ownerOf','address',c.vault.address,[m.positionId],'uint256');
 const position=await call('vault','function positions(uint256) view returns(bool,address,bytes32)',[m.positionId]);
 if(position.ok){match('position.registered',position.value[0],true);match('position.quote',position.value[1],c.quote.address);match('position.poolId',position.value[2],poolId(m.poolKey));}
 const key=await call('positionManager','function getPoolAndPositionInfo(uint256) view returns((address,address,uint24,int24,address),uint256)',[m.positionId]);
 if(key.ok)match('position.actualPoolId',poolId(Array.from(key.value[0])),poolId(m.poolKey));
 if(m.futureLaunch){
  const enabled=await call('registry','function launchEnabled() view returns(bool)',[],'futureLaunch');if(enabled.ok)match('future.launchEnabled',enabled.value[0],true,'futureLaunch');
  const r=await call('registry','function currentCoordinator() view returns(address)',[],'futureLaunch');if(r.ok)match('future.coordinator',r.value[0],m.futureLaunch.coordinator,'futureLaunch');
  const h=await call('registry','function currentHandler(uint32) view returns(address,uint256,bool)',[1],'futureLaunch');
  if(h.ok){match('future.handler',h.value[0],m.futureLaunch.handler,'futureLaunch');match('future.version',h.value[1],m.futureLaunch.version,'futureLaunch');match('future.enabled',h.value[2],true,'futureLaunch');}
 }
 const end=await read('headRecheck',()=>provider.getBlock(block));
 if(end.ok&&(!end.value||!eq(end.value.hash,head.value.hash)))problem('source','unavailable','anchorChangedDuringRead',{});
 const critical=issues.filter(x=>x.scope==='source');
 const coherent=end.ok&&end.value&&eq(end.value.hash,head.value.hash);
 report.status=!coherent?'unavailable':critical.some(x=>x.kind==='changed')?'changed':critical.length?'unavailable':'match';
 return report;
}
module.exports={inspectSource,validateManifest,poolId,ROLES,SLOT};
