// Local fork only: real Pons pool buys by impersonated synthetic accounts.
const {ethers}=require('ethers'),assert=require('node:assert/strict'),fs=require('node:fs');
const V4=require('./pons-v4-buy.cjs');
async function prepare({out,save,provider,user,quote,manifest:m,rpc}){
 quote=new ethers.Contract(m.quote,[...require('./integrations/pons-v2.cjs').ERC,'function transfer(address,uint256) returns(bool)'],user);
 const n=Number(process.env.RH_JOINT_WALLETS||128);assert(Number.isInteger(n)&&n>=4&&n<=128);
 assert.equal((await provider.send('hardhat_metadata',[])).instanceId,out.localInstanceId);
 const report=out.jointLoad={schema:'pons-joint-load-v1',wallets:[],n,status:'BUYING',scope:'Local fork, real direct curve/pool routes; synthetic balances/accounts. No batch/0x/EntryPoint coverage.'};
 const coder=ethers.AbiCoder.defaultAbiCoder(),deadline=Number((await provider.getBlock('latest')).timestamp)+86400;
 async function buy(wallet,amount){
  const signer=new ethers.JsonRpcSigner(provider,wallet),ur=new ethers.Contract(m.router,V4.CALL,signer);
  const input=coder.encode(['bytes','bytes[]'],['0x060b0e',[coder.encode([V4.SPEC],[[m.poolKey,m.poolKey[0].toLowerCase()===m.quote.toLowerCase(),amount,1,0,'0x']]),coder.encode(['address','uint256','bool'],[m.quote,0,true]),coder.encode(['address','address','uint256'],[m.token,wallet,0])]]);
  const before=await quote.balanceOf(wallet),receipt=await(await ur.execute('0x10',[input],deadline,{gasLimit:5000000})).wait();
  assert.equal(receipt.status,1);assert.equal(before-await quote.balanceOf(wallet),amount);
  return receipt.hash;
 }
 const start=performance.now();
 for(let i=0;i<n;i++){
  const wallet=ethers.getAddress(ethers.id('QIANQI joint load '+i).slice(0,42));
  await rpc('hardhat_impersonateAccount',[wallet]);await rpc('hardhat_setBalance',[wallet,ethers.toQuantity(ethers.parseEther('1'))]);
  await(await quote.connect(user).transfer(wallet,300_000000n)).wait();
  const signer=new ethers.JsonRpcSigner(provider,wallet),permit=new ethers.Contract(m.permit2,['function approve(address,address,uint160,uint48)'],signer);
  await(await quote.connect(signer).approve(m.permit2,ethers.MaxUint256)).wait();
  await(await permit.approve(m.quote,m.router,(1n<<160n)-1n,deadline)).wait();
  const row={wallet:wallet.toLowerCase(),spentRaw:'101000000',late:false,hashes:[]};report.wallets.push(row);
  for(const amount of [60_000000n,40_000000n,1_000000n])row.hashes.push(await buy(wallet,amount));
  save();if(i%16===15||i===n-1)console.log('JOINT BUYERS '+(i+1)+'/'+n);
 }
 report.preparationMs=performance.now()-start;report.status='BOUGHT';save();
 return {report,buy};
}
async function late(runtime,save){
 for(const row of runtime.report.wallets.slice(0,4)){row.hashes.push(await runtime.buy(row.wallet,99_000000n));row.spentRaw='200000000';row.late=true;}
 save();
}
async function verify({out,config,ledger,provider,vault}){
 const {createReader,createServer}=require('./user-status-api.cjs'),D=require('./direct-buy.cjs');
 const state=JSON.parse(fs.readFileSync(config.indexer.statePath));
 assert.equal(D.hash(D.replay(state.index.manifest,state.index.blocks)),state.index.ledgerHash);
 const reader=createReader(config),start=performance.now(),now=Date.parse(state.index.observedAt);
 for(const row of out.jointLoad.wallets){
  const w=ledger.wallets.find(w=>w.wallet===row.wallet);assert(w);
  const view=reader.read({wallet:row.wallet,now});assert.equal(view.status,'observed');
  assert.equal(view.provenance.ledgerHash,state.index.ledgerHash);
  for(const k of ['SHORT','MONTHLY']){assert.equal(w[k].consumedTotal,'1');assert.equal(w[k].open,row.late?'1':'0');assert.deepEqual(view.balances[k],w[k]);}
  assert.equal(view.balances.carryRaw,row.late?'0':'1000000');assert.equal(view.purchases.total,row.hashes.length);
  for(const reward of view.rewards.items){assert.equal(reward.status,'paid');assert.equal(await vault.reward(reward.drawId,row.wallet),0n);}
  const stale=reader.read({wallet:row.wallet,now:now+(config.indexer.maxAgeSeconds+1)*1000});assert.equal(stale.status,'stale');assert.deepEqual(stale.balances,view.balances);
 }
 const walletMs=performance.now()-start,server=createServer(config);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/v1/wallets/';
  const rows=await Promise.all(out.jointLoad.wallets.slice(0,16).map(async w=>{const r=await fetch(url+w.wallet);assert.equal(r.status,200);const v=await r.json();assert.deepEqual(v.balances,reader.read({wallet:w.wallet}).balances);return v.status;}));
  const bytes=fs.readFileSync(config.indexer.statePath);fs.renameSync(config.indexer.statePath,config.indexer.statePath+'.joint-offline');
  try{const r=await fetch(url+out.jointLoad.wallets[0].wallet);assert.equal(r.status,503);assert.equal((await r.json()).balances,null);}finally{fs.renameSync(config.indexer.statePath+'.joint-offline',config.indexer.statePath);}
  assert.deepEqual(fs.readFileSync(config.indexer.statePath),bytes);
  return {status:'PASSED',wallets:out.jointLoad.n,eligibleBuys:ledger.buyLedger.decisions.filter(d=>d.status==='ELIGIBLE').length,ledgerHash:state.index.ledgerHash,walletMs,parallelHTTP:rows.length,stalePreservesBalances:true,unavailableIsNotZero:true,head:ledger.head};
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
module.exports={prepare,late,verify};
