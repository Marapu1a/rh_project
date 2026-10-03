// Narrow pre-launch token risk probe. All transactions go to local Hardhat only.
process.env.HARDHAT_CONFIG=require.resolve('../test/fixtures/pons-wallet-cycle-hardhat.config.cjs');
const fs=require('fs'),assert=require('assert/strict'),{ethers:E}=require('ethers'),hre=require('hardhat');
async function main(){
 const [planFile,outFile]=process.argv.slice(2);assert(outFile&&!fs.existsSync(outFile));const plan=JSON.parse(fs.readFileSync(planFile)),prefix=plan.prefix;
 const remote=new E.JsonRpcProvider(process.env.RH_FORK_RPC_URL),out={schema:'pons-token-security-probe-v1',publicSends:0,status:'RUNNING',limits:['Local fork with synthetic ETH/USDG, not a GoPlus verdict','Curve trading only; graduated pool behavior not re-proven here','Finite method probes do not prove absence of other privileged selectors']};
 const save=()=>fs.writeFileSync(outFile,JSON.stringify(out,null,2)+'\n');save();let proxy;
 try{
  const block=await remote.getBlock('latest');assert.equal((await remote.getNetwork()).chainId,4663n);assert.equal(await remote.getTransactionCount(plan.governor,'pending'),plan.startNonce);out.forkBlock=block.number;
  proxy=await require('./read-only-fork-rpc.cjs').startReadProxy(process.env.RH_FORK_RPC_URL);
  const rpc=(m,p=[])=>hre.network.provider.send(m,p);await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:block.number}}]);await rpc('evm_mine');
  const p=new E.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
  const users=[plan.governor,'0x0000000000000000000000000000000000001234','0x0000000000000000000000000000000000005678'];
  for(const a of users){await rpc('hardhat_impersonateAccount',[a]);await rpc('hardhat_setBalance',[a,E.toQuantity(E.parseEther('1'))]);}
  const compiled=require('./compile.cjs').compile(),settings=require('../config/pons-deployment-candidate.json');
  const strategy=require('./deployment-continuation.cjs').createStrategy({plan,provider:p,compiled,settings,preflight:async()=>{throw Error('Unused');}}),s=await strategy.step(0,{completed:[]});
  const receipt=await(await new E.JsonRpcSigner(p,plan.governor).sendTransaction(s.request)).wait();await strategy.verifyReceipt(s,receipt,await p.getBlock(receipt.blockNumber),{completed:[]});
  const token=new E.Contract(prefix.token,['function balanceOf(address) view returns(uint256)','function totalSupply() view returns(uint256)','function transfer(address,uint256) returns(bool)','function approve(address,uint256) returns(bool)','function burn(uint256)','function deployer() view returns(address)','function launchFactory() view returns(address)','function curve() view returns(address)'],p);
  const curve=new E.Contract(prefix.curve,[...require('./integrations/pons-v2.cjs').CUR,'function currentSnipeTaxBps(address) view returns(uint256)'],p),quote=new E.Contract(plan.manifestTemplate.quote,require('./integrations/pons-v2.cjs').ERC,p);
  const code=await p.getCode(prefix.token);fs.writeFileSync(outFile+'.runtime.txt',code);out.runtimeHash=E.keccak256(code);out.runtimeBytes=(code.length-2)/2;out.metadataTail=code.slice(-120);
  out.references={deployer:await token.deployer(),launchFactory:await token.launchFactory(),curve:await token.curve()};out.totalSupply=String(await token.totalSupply());
  out.fees={baseBps:String(await curve.feeBps()),creatorTaxBps:String(await curve.creatorTaxBps()),openingBuyerSnipeBps:String(await curve.currentSnipeTaxBps(users[1])),openingGovernorSnipeBps:String(await curve.currentSnipeTaxBps(plan.governor))};
  await rpc('evm_increaseTime',[10]);await rpc('evm_mine');out.fees.after10SecondsSnipeBps=String(await curve.currentSnipeTaxBps(users[1]));assert.equal(out.fees.after10SecondsSnipeBps,'0');
  out.trades=[];
  for(const [i,a]of users.slice(1).entries()){
   const signer=new E.JsonRpcSigner(p,a),amount=i===0?1000000n:101000000n;
   const trace=await rpc('debug_traceCall',[{to:quote.target,data:quote.interface.encodeFunctionData('balanceOf',[a])},'latest',{disableMemory:true,disableStorage:true}]);let funded=false;
   for(const slot of [...new Set(trace.structLogs.filter(x=>x.op==='SLOAD').map(x=>'0x'+x.stack.at(-1)))]){const snap=await rpc('evm_snapshot');await rpc('hardhat_setStorageAt',[quote.target,slot,E.toBeHex(amount,32)]);try{if(await quote.balanceOf(a)===amount){funded=true;break;}}catch{}await rpc('evm_revert',[snap]);}assert(funded);
   await(await quote.connect(signer).approve(curve.target,amount)).wait();const expected=await curve.connect(signer).buy.staticCall(amount,0,a);await(await curve.connect(signer).buy(amount,expected*99n/100n,a)).wait();
   const bought=await token.balanceOf(a);assert(bought>0n);
   const receiver=users[i===0?2:1],before=await token.balanceOf(receiver);await(await token.connect(signer).transfer(receiver,bought)).wait();assert.equal(await token.balanceOf(receiver)-before,bought);assert.equal(await token.balanceOf(a),0n);
   const seller=new E.JsonRpcSigner(p,receiver);await(await token.connect(seller).approve(curve.target,bought)).wait();const quoteBefore=await quote.balanceOf(receiver),sellExpected=await curve.connect(seller).sell.staticCall(bought,0,receiver);assert(sellExpected>0n);await(await curve.connect(seller).sell(bought,sellExpected*99n/100n,receiver)).wait();assert.equal(await token.balanceOf(receiver),before);
   out.trades.push({buyer:a,seller:receiver,quoteIn:String(amount),tokensBought:String(bought),transferTaxRaw:'0',allTokensSold:true,quoteOut:String(await quote.balanceOf(receiver)-quoteBefore)});save();
  }
  out.methodProbes=[];
  for(const signature of ['owner()','mint(address,uint256)','setBlacklist(address,bool)','pause()','setTax(uint256)','setMaxWallet(uint256)']){
   const iface=new E.Interface(['function '+signature]),args=signature.startsWith('mint')?[users[1],1]:signature.startsWith('setBlacklist')?[users[1],true]:signature.includes('uint256')?[1]:[];
   let reverted=false;try{await p.call({from:plan.governor,to:prefix.token,data:iface.encodeFunctionData(signature,args)});}catch(e){assert.equal(e.code,'CALL_EXCEPTION');reverted=true;}
   assert(reverted,'Unexpected callable '+signature);out.methodProbes.push({signature,reverted});
  }
  out.status='PASSED';save();console.log(JSON.stringify(out));
 }catch(e){out.status='FAILED';out.error=String(e.shortMessage||e.message).replace(/https?:\/\/\S+/g,'[RPC]');save();console.error(out.error);process.exitCode=1;}finally{remote.destroy();proxy?.close();}
}
if(require.main===module)main();
