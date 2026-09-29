// In-process Hardhat fork ONLY. All upstream requests pass the read-only proxy.
process.env.HARDHAT_CONFIG=require.resolve('../test/fixtures/public-hardhat.config.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers'),hre=require('hardhat');
const {startReadProxy}=require('./read-only-fork-rpc.cjs'),{fixture,rpc,sent}=require('../test/fixtures/public-controllers.cjs');
const {USDG}=require('./public-rpc-check.cjs');
async function main(){
 const file=process.argv[2];if(!file||fs.existsSync(file))throw Error('New output path required');
 const out={schema:'public-controller-fork-v1',observedAt:new Date().toISOString(),status:'started',publicLaunchReady:false,
 assumptions:['Local in-process fork, no public sends; read-only upstream proxy','EDR ArbSys shim maps block.number/blockhash to local RPC heights; not a native Nitro execution proof','No source overrides, no constructor clock backdating, no timestamp override','Synthetic token and no project liquidity/BUY integration; actual existing USDG is read only','Cannot finish new monthly schedule or future drand proof in this bounded fork run']};
 let proxy;const stage=s=>{out.stage=s;console.log(s);};
 try{
  const compiled=require('./compile.cjs').compile({writeArtifacts:false});
  stage('read-only fork');proxy=await startReadProxy(process.env.RH_RPC_URL||'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public');
  const remote=new ethers.JsonRpcProvider(proxy.url);assert.equal((await remote.getNetwork()).chainId,4663n);const block=await remote.getBlock('latest');remote.destroy();
  out.anchor={number:block.number,hash:block.hash,timestamp:block.timestamp};
  await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:block.number}}]);assert.equal(BigInt(await rpc('eth_chainId')),4663n);
  stage('deploy exact public contracts');const f=await fixture(compiled,{reset:false,quoteAddress:USDG,offset:false});
  out.contracts={};for(const [name,c] of [['short',f.short],['monthly',f.monthly],['adapter',f.random],['vault',f.vault]]){
   const code=await f.provider.getCode(c.target);out.contracts[name]={address:c.target,codeHash:ethers.keccak256(code),runtimeBytes:(code.length-2)/2};assert(out.contracts[name].runtimeBytes<=24576);
  }
  assert.equal(await f.quote.decimals(),6n);out.quote={address:USDG,decimals:6,codeHash:ethers.keccak256(await f.provider.getCode(USDG))};
  assert.equal(await f.short.CONTROLLER_PROFILE(),ethers.id('promo-robinhood-short-drand-v1'));assert.equal(await f.monthly.CONTROLLER_PROFILE(),ethers.id('promo-robinhood-monthly-drand-v2'));
  assert.equal(await f.random.shortConsumer(),f.short.target);assert.equal(await f.random.monthlyConsumer(),f.monthly.target);
  stage('checkpoint and age');const b=await f.head();out.cutoff={number:String(b.number),hash:b.hash};out.transactions=[];
  for(const c of [f.short,f.monthly]){const r=await sent(c.checkpointCutoff(b.number));out.transactions.push({hash:r.hash,gasUsed:String(r.gasUsed)});}
  await rpc('hardhat_mine',['0x110']);for(const c of [f.short,f.monthly])assert.equal(await c.validCutoff(b.number,b.hash),true);
  assert.equal(await f.vault.reserved(USDG),0n);assert.equal(await f.short.activeProposal(),ethers.ZeroHash);assert.equal(await f.monthly.activeMonth(),ethers.ZeroHash);
  const latest=await f.provider.getBlock('latest');assert(BigInt(latest.timestamp)<await f.short.lastShortTerminalAt()+21600n);assert(BigInt(latest.timestamp)<await f.monthly.lastMonthAt()+2592000n);
  out.scheduleStillWaiting=true;out.frozenUSDG='0';out.proxyStats=proxy.stats;out.status='partial-complete';stage('partial proof complete');
 }catch(e){out.status='blocked';out.error=e.shortMessage||e.message;console.error(out.error);process.exitCode=1;}
 finally{if(proxy)proxy.close();fs.writeFileSync(file,JSON.stringify(out,null,2)+'\n',{flag:'wx'});}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
