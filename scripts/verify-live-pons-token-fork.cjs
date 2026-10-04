// Existing deployed token, local fork only. The upstream proxy refuses all writes.
process.env.HARDHAT_CONFIG=require.resolve('../test/fixtures/pons-wallet-cycle-hardhat.config.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),E=require('ethers'),hre=require('hardhat');
async function main(){
 const [deploymentFile,outFile]=process.argv.slice(2);assert(outFile&&!fs.existsSync(outFile)&&process.env.RH_FORK_RPC_URL);
 const deployment=JSON.parse(fs.readFileSync(deploymentFile)),m=deployment.manifest;
 assert.equal(Number(m.chainId),4663);assert.equal(deployment.token.toLowerCase(),m.token.toLowerCase());
 const remote=new E.JsonRpcProvider(process.env.RH_FORK_RPC_URL),out={schema:'qianqi-deployed-token-fork-v1',status:'RUNNING',publicSends:0,token:m.token,trades:[],limits:['Existing mainnet bytecode on local fork; synthetic ETH/USDG only','Curve buy/transfer/sell scenarios, not an independent audit or a scanner verdict','No graduation-pool or all-router safety claim']};
 const save=()=>fs.writeFileSync(outFile,JSON.stringify(out,null,2)+'\n');save();let proxy;
 try{
  assert.equal((await remote.getNetwork()).chainId,4663n);const block=await remote.getBlock('latest');out.forkBlock=block.number;out.forkBlockHash=block.hash;
  proxy=await require('./read-only-fork-rpc.cjs').startReadProxy(process.env.RH_FORK_RPC_URL);
  const rpc=(method,params=[])=>hre.network.provider.send(method,params);
  await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:block.number}}]);
  // Execute on a locally mined block with the test hardfork configured by Hardhat.
  await rpc('evm_mine');
  const p=new E.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
  const code=await p.getCode(m.token);out.runtimeHash=E.keccak256(code);assert.equal(out.runtimeHash,m.codeHashes.token);
  const token=new E.Contract(m.token,['function balanceOf(address) view returns(uint256)','function transfer(address,uint256) returns(bool)','function approve(address,uint256) returns(bool)'],p);
  const curve=new E.Contract(m.curve,[...require('./integrations/pons-v2.cjs').CUR,'function currentSnipeTaxBps(address) view returns(uint256)'],p),quote=new E.Contract(m.quote,require('./integrations/pons-v2.cjs').ERC,p);
  const users=['0x0000000000000000000000000000000000001234','0x0000000000000000000000000000000000005678'];
  for(const address of users){out.stage='prepare '+address;await rpc('hardhat_impersonateAccount',[address]);await rpc('hardhat_setBalance',[address,E.toQuantity(E.parseEther('1'))]);out.stage='token balance';assert.equal(await token.balanceOf(address),0n);out.stage='snipe getter';assert.equal(await curve.currentSnipeTaxBps(address),0n);}
  out.fees={baseBps:String(await curve.feeBps()),creatorTaxBps:String(await curve.creatorTaxBps()),snipeBps:'0'};
  for(const [i,address] of users.entries()){
   out.stage='synthetic funding';
   const signer=new E.JsonRpcSigner(p,address),amount=i?101000000n:1000000n;
   const trace=await rpc('debug_traceCall',[{to:m.quote,data:quote.interface.encodeFunctionData('balanceOf',[address])},'latest',{disableMemory:true,disableStorage:true}]);
   let funded=false;
   for(const slot of [...new Set(trace.structLogs.filter(x=>x.op==='SLOAD').map(x=>'0x'+x.stack.at(-1)))]){
    const snapshot=await rpc('evm_snapshot');await rpc('hardhat_setStorageAt',[m.quote,slot,E.toBeHex(amount,32)]);
    try{if(await quote.balanceOf(address)===amount){funded=true;break;}}catch{}
    await rpc('evm_revert',[snapshot]);
   }assert(funded,'Could not fund synthetic quote balance');
   out.stage='buy';
   await(await quote.connect(signer).approve(m.curve,amount)).wait();
   const expected=await curve.connect(signer).buy.staticCall(amount,0,address);
   const buy=await(await curve.connect(signer).buy(amount,expected*99n/100n,address)).wait();
   const bought=await token.balanceOf(address);assert(bought>0n);
   const receiver=users[1-i],before=await token.balanceOf(receiver);
   out.stage='transfer';
   await(await token.connect(signer).transfer(receiver,bought)).wait();assert.equal(await token.balanceOf(receiver)-before,bought);assert.equal(await token.balanceOf(address),0n);
   const seller=new E.JsonRpcSigner(p,receiver),quoteBefore=await quote.balanceOf(receiver);
   out.stage='sell';
   await(await token.connect(seller).approve(m.curve,bought)).wait();
   const sellExpected=await curve.connect(seller).sell.staticCall(bought,0,receiver);assert(sellExpected>0n);
   const sell=await(await curve.connect(seller).sell(bought,sellExpected*99n/100n,receiver)).wait();
   assert.equal(await token.balanceOf(receiver),before);
   out.trades.push({buyer:address,seller:receiver,quoteInRaw:String(amount),tokensBoughtRaw:String(bought),transferTaxRaw:'0',allTokensSold:true,quoteOutRaw:String(await quote.balanceOf(receiver)-quoteBefore),localBuyHash:buy.hash,localSellHash:sell.hash});save();
  }
  out.stage='complete';out.status='PASSED';out.proxyStats=proxy.stats;save();console.log(JSON.stringify(out));
 }catch(e){out.status='FAILED';out.error=String(e.shortMessage||e.message).replace(/https?:\/\/\S+/g,'[RPC]');out.diagnostic=JSON.parse(JSON.stringify({code:e.code,data:e.data,info:e.info,transaction:e.transaction},(k,v)=>typeof v==='bigint'?String(v):typeof v==='string'?v.replace(/https?:\/\/\S+/g,'[RPC]'):v));out.proxyStats=proxy?.stats;save();console.error(out.error);process.exitCode=1;}
 finally{remote.destroy();proxy?.close();}
}
if(require.main===module)main();
