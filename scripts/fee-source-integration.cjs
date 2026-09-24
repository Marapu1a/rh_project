// Local fork only. Impersonation below is a test assumption, never public authority.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const reference=require('../research/pair-usdg-active-reference-2026-09-23.json');
async function run({e,cfg,provider,user,rpc,buy}){
 assert.equal(await rpc('eth_chainId'),'0x7a69');
 const compiled=require('./compile.cjs').compile(),admin=await user.getAddress();
 const keeper=await provider.getSigner(3),oldRecipient=await (await provider.getSigner(4)).getAddress(),newRecipient=await (await provider.getSigner(5)).getAddress();
 const x=e.sourceIntegration={assumption:'Local controller/recipient impersonation; no public authority',transactions:[],claims:[],transitionProbes:[]};
 const send=async(label,p)=>{const tx=await p,r=await tx.wait();assert.equal(r.status,1);x.transactions.push({label,transaction:await rpc('eth_getTransactionByHash',[tx.hash]),receipt:await rpc('eth_getTransactionReceipt',[tx.hash])});console.log('SOURCE_STEP '+label);return r;};
 const impersonate=async address=>{await rpc('hardhat_impersonateAccount',[address]);await rpc('hardhat_setBalance',[address,ethers.toBeHex(ethers.parseEther('10'))]);return new ethers.JsonRpcSigner(provider,address);};
 const vault=new ethers.Contract(reference.selected.launch.vault,[
  'function projectToken() view returns(address)','function epoch() view returns(uint64)','function modeId() view returns(uint32)',
  'function positionManager() view returns(address)','function positions(uint256) view returns(bool,address,bytes32)',
  'function policyController() view returns(address)','function epochRecipientCount(uint64) view returns(uint256)',
  'function epochRecipient(uint64,uint256) view returns(address,uint16)','function collectFees(uint256)',
  'function claimable(uint64,address,address) view returns(uint256)','function claim(address,uint64) returns(uint256)',
  'function transitionFeeSharingAtomic(address[],uint16[])','function transitionFeeSharing(address[],uint16[])'],user);
 const position=reference.position.id,epoch=await vault.epoch(),recipient=await vault.epochRecipient(epoch,0),controller=await vault.policyController();
 const positionManager=await vault.positionManager();
 const owner=await new ethers.Contract(positionManager,['function ownerOf(uint256) view returns(address)'],provider).ownerOf(position);
 assert.equal(owner.toLowerCase(),vault.target.toLowerCase());assert.equal((await vault.projectToken()).toLowerCase(),cfg.token.toLowerCase());
 const pos=await vault.positions(position);assert(pos[0]);assert.equal(pos[1].toLowerCase(),cfg.quote.toLowerCase());assert.equal(pos[2],cfg.poolId);
 assert.equal(await vault.epochRecipientCount(epoch),1n);assert.equal(recipient[1],10000n);assert.equal(await vault.modeId(),1n);
 const vaultHash=ethers.keccak256(await provider.getCode(vault.target));assert.equal(vaultHash,reference.selected.codeHash);
 x.binding={vault:vault.target,vaultHash,position,positionManager,positionManagerHash:ethers.keccak256(await provider.getCode(positionManager)),owner,epoch:String(epoch),recipient:recipient[0],controller};
 const assetAbi=['function balanceOf(address) view returns(uint256)','function transfer(address,uint256) returns(bool)'];
 const assets=[cfg.token,cfg.quote].map(a=>new ethers.Contract(a,assetAbi,user));
 const now=(await provider.getBlock('latest')).timestamp;
 const initial={endsAt:now+3600,recipients:[oldRecipient,ethers.ZeroAddress,ethers.ZeroAddress],bps:[10000,0,0]};
 const a=compiled.FeeRouter,router=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,user).deploy(admin,cfg.token,cfg.quote,initial);await router.waitForDeployment();
 x.router=router.target;x.routerCodeHash=ethers.keccak256(await provider.getCode(router.target));
 e.stage='source-original-binding';
 await assert.rejects(router.bindSource.staticCall(vault.target,position));x.originalBindingRejected=true;
 await buy('BUY generating reference fees');
 await send('collect original source epoch',vault.connect(keeper).collectFees(position,{gasLimit:4000000}));
 e.stage='source-original-claim';
 const originalSigner=await impersonate(recipient[0]);
 try{
  for(const asset of assets){const due=await vault.claimable(epoch,recipient[0],asset.target),before=await asset.balanceOf(recipient[0]);
   if(due!==0n)await send('claim original recipient '+asset.target,vault.connect(originalSigner).claim(asset.target,epoch,{gasLimit:1000000}));
   const delta=await asset.balanceOf(recipient[0])-before;assert.equal(delta,due);assert.equal(await vault.claimable(epoch,recipient[0],asset.target),0n);
   x.claims.push({asset:asset.target,due:String(due),received:String(delta)});
  }
 }finally{await rpc('hardhat_stopImpersonatingAccount',[recipient[0]]);}
 assert(BigInt(x.claims[1].received)>0n);
 // Actual source API, under explicit local authority assumption. Never edit source storage/code.
 e.stage='source-local-policy-transition';const authority=await impersonate(controller);
 try{
  let method;
  for(const name of ['transitionFeeSharingAtomic','transitionFeeSharing']){
   try{await vault.connect(authority)[name].staticCall([router.target],[10000],{gasLimit:6000000});method=name;x.transitionProbes.push({name,success:true});break;}
   catch(error){x.transitionProbes.push({name,success:false,message:error.shortMessage||error.message,data:error.data});}
  }
  assert(method,'Reference has no usable tested policy transition; do not substitute source state');
  await send('local authority '+method,vault.connect(authority)[method]([router.target],[10000],{gasLimit:6000000}));x.transitionMethod=method;
 }finally{await rpc('hardhat_stopImpersonatingAccount',[controller]);}
 await send('bind real source after local transition',router.bindSource(vault.target,position));
 const sourceEpoch=await router.sourceEpoch();x.boundEpoch=String(sourceEpoch);assert(sourceEpoch>epoch);
 e.stage='source-router-harvest';await buy('BUY for bound FeeRouter');
 await send('permissionless collect',router.connect(keeper).collect({gasLimit:4000000}));
 x.harvest=[];
 for(const asset of assets){const due=await vault.claimable(sourceEpoch,router.target,asset.target);
  await send('permissionless harvest '+asset.target,router.connect(keeper).harvest(asset.target,sourceEpoch,{gasLimit:1500000}));
  assert.equal(await router.received(1,asset.target),due);assert.equal(await router.credit(asset.target,oldRecipient),due);
  const before=await router.received(1,asset.target);await send('repeat harvest '+asset.target,router.connect(keeper).harvest(asset.target,sourceEpoch));assert.equal(await router.received(1,asset.target),before);
  x.harvest.push({asset:asset.target,received:String(due)});
 }
 assert(BigInt(x.harvest[1].received)>0n);
 e.stage='source-rollover';await buy('BUY left uncollected before rollover');
 for(const asset of assets)await send('direct transfer before rollover '+asset.target,asset.transfer(router.target,17));
 const oldQuote=await router.received(1,cfg.quote);
 await rpc('evm_setNextBlockTimestamp',[now+3601]);await rpc('evm_mine');
 const next={endsAt:now+7200,recipients:[newRecipient,ethers.ZeroAddress,ethers.ZeroAddress],bps:[10000,0,0]};
 await send('atomic rollover',router.rollCampaign(1,next,{gasLimit:6000000}));assert.equal(await router.campaignId(),2n);
 assert(await router.received(1,cfg.quote)>oldQuote+17n);x.rollover=[];
 for(const asset of assets){const total=await router.received(1,asset.target),credit=await router.credit(asset.target,oldRecipient);
  assert.equal(credit,total);assert.equal(await router.received(2,asset.target),0n);assert.equal(await vault.claimable(sourceEpoch,router.target,asset.target),0n);
  await send('direct transfer after rollover '+asset.target,asset.transfer(router.target,23));await send('new campaign sync '+asset.target,router.connect(keeper).sync(asset.target));
  assert.equal(await router.received(2,asset.target),23n);assert.equal(await router.credit(asset.target,newRecipient),23n);
  const before=await asset.balanceOf(oldRecipient);await send('pay old credits '+asset.target,router.connect(keeper).pay(asset.target,oldRecipient));assert.equal(await asset.balanceOf(oldRecipient)-before,credit);
  assert.equal(await router.credit(asset.target,oldRecipient),0n);assert.equal(await router.accounted(asset.target),23n);
  x.rollover.push({asset:asset.target,oldTotal:String(total),paidOld:String(credit),newTotal:'23'});
 }
 await assert.rejects(router.rollCampaign.staticCall(1,next));x.staleRejected=true;x.success=true;
}
module.exports={run};
