const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{ethers}=require('ethers');
const {fixture,rpc,sent}=require('./local-controllers.cjs');
const {SWAP_TYPE}=require('../../scripts/direct-buy.cjs');
const {scan}=require('../../scripts/replay-direct-buy.cjs');
const {replayAttempts}=require('../../scripts/attempt-lifecycle.cjs');
async function setup(t,compiled){
  const f=await fixture(compiled,{quoteName:'LocalUSDGFixture'});
  const market=await f.deploy('LocalBuyFixture',[f.token.target,f.quote.target]),coder=ethers.AbiCoder.defaultAbiCoder();
  const key=[...[f.token.target,f.quote.target].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1),10000,200,market.target];
  const manifest={schema:'direct-buy-v1',routerProfile:'local-fixture',routeVersion:'rh-ur-10-060b0e-v1',chainId:'31337',quoteDecimals:6,entryThresholdRaw:'100000000',
    router:market.target,manager:market.target,hook:market.target,token:f.token.target,quote:f.quote.target,registry:f.registry.target,poolKey:key,
    poolId:ethers.keccak256(coder.encode(['address','address','uint24','int24','address'],key)),anchor:{number:f.anchor.number,hash:f.anchor.hash},codeHashes:{}};
  for(const name of ['router','manager','hook','token','quote','registry'])manifest.codeHashes[name]=ethers.keccak256(await f.provider.getCode(manifest[name]));
  const sg=await f.short.shortEpochPolicy(1),mg=await f.monthly.monthlyEpochPolicy(1),code=async c=>ethers.keccak256(await f.provider.getCode(c.target));
  const lifecycle={schema:'attempt-lifecycle-v4',source:f.short.target,sourceCodeHash:await code(f.short),instanceId:await f.short.datasetInstance(),
    monthlySource:f.monthly.target,monthlySourceCodeHash:await code(f.monthly),monthlyInstanceId:await f.monthly.monthlyInstance(),vault:f.vault.target,vaultCodeHash:await code(f.vault),
    shortRules:{rulesHash:sg.hash,noticeSeconds:String(await f.short.shortRulesNotice()),startedAt:String(await f.short.shortRulesStartedAt()),firstBlock:String(sg.firstBlock)},
    monthlyPolicy:{rulesHash:mg.hash,interval:String(await f.monthly.monthlyInterval()),startedAt:String(await f.monthly.monthlyStartedAt())},
    monthlyRules:{noticeSeconds:String(await f.monthly.monthlyRulesNotice()),firstBlock:String(mg.firstBlock)}};
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const p of req)body+=p;const data=JSON.parse(body);
    const handle=async q=>{try{return {jsonrpc:'2.0',id:q.id,result:await rpc(q.method,q.params)};}catch(e){return {jsonrpc:'2.0',id:q.id,error:{code:-32000,message:e.message}};}};
    res.setHeader('content-type','application/json');res.end(JSON.stringify(Array.isArray(data)?await Promise.all(data.map(handle)):await handle(data)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const rpcUrl='http://127.0.0.1:'+server.address().port;
  fs.mkdirSync('.local',{recursive:true});const directory=fs.mkdtempSync(path.resolve('.local','scheduler-test-'));
  t.after(()=>{for(const name of fs.readdirSync(directory))fs.unlinkSync(path.join(directory,name));fs.rmdirSync(directory);});
  const statePath=path.join(directory,'state.json');
  const config={schema:'local-promo-scheduler-v1',manifest,lifecycle,cutoffMode:'LOCAL_HEAD',campaignId:'1',shortBudget:'101',chunkSize:1};
  for(const signer of [f.admin,f.executor]){
    await sent(f.quote.mint(await signer.getAddress(),2000_000000n));await sent(f.quote.connect(signer).approve(market.target,ethers.MaxUint256));
  }
  await sent(f.token.mint(market.target,100000_000000n));await f.fundExecution();
  async function buy(signer,usd){
    const raw=BigInt(usd)*1000000n,input=coder.encode(['bytes','bytes[]'],['0x060b0e',[
      coder.encode([SWAP_TYPE],[[key,key[0]===f.quote.target,raw,1,0,'0x']]),coder.encode(['address','uint256','bool'],[f.quote.target,0,true]),
      coder.encode(['address','address','uint256'],[f.token.target,await signer.getAddress(),0])]]);
    await sent(market.connect(signer).execute('0x10',[input],ethers.MaxUint256));
  }
  const ledger=async()=>replayAttempts(manifest,lifecycle,(await scan(manifest,rpcUrl,await rpc('eth_blockNumber'),lifecycle)).blocks);
  return {...f,buy,ledger,config,directory,statePath,readState:()=>JSON.parse(fs.readFileSync(statePath,'utf8')),
    options:{provider:f.provider,short:f.short,monthly:f.monthly,config,rpcUrl,statePath,publisher:f.admin,executor:f.executor}};
}
module.exports={setup};
