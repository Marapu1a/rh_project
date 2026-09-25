const assert=require('node:assert/strict'),{ethers}=require('ethers');
const {runPrizeFlow}=require('./local-prize-flow.cjs');
const {createV4MarketQuote}=require('./v4-market-quote.cjs');
async function run({e,cfg,provider,user,rpc,buy}){
  assert.equal(await rpc('eth_chainId'),'0x7a69');
  e.stage='market-compile';const compiled=require('./compile.cjs').compile();
  const owner=await user.getAddress();
  async function deploy(name,args){const a=compiled[name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,user).deploy(...args);await c.waitForDeployment();return c;}
  const token=new ethers.Contract(cfg.token,['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function transfer(address,uint256) returns(bool)'],user);
  const quote=new ethers.Contract(cfg.quote,['function balanceOf(address) view returns(uint256)'],provider);
  e.stage='market-token-acquisition';await buy();const inventory=await token.balanceOf(owner);assert(inventory>100n);
  const permit='0x000000000022d473030f116ddee9f6b43ac78ba3';
  e.stage='market-route-deploy';
  const adapter=await deploy('LocalV4PrizeAdapter',[cfg.token,cfg.quote,cfg.router,permit,cfg.manager,cfg.poolKey]);
  // Inert local draw authority only. No draw/RNG integration claimed by this funding test.
  const vault=await deploy('PromoVault',[cfg.token,cfg.quote,adapter.target,100_000000]);
  const max=inventory/2n;
  const converter=await deploy('LocalMarketPrizeConverter',[cfg.token,cfg.quote,vault.target,adapter.target,owner,owner,[max,300,inventory,3600,60]]);
  const head=await provider.getBlock('latest');
  const router=await deploy('FeeRouter',[owner,cfg.token,cfg.quote,[head.timestamp+3600,[converter.target,ethers.ZeroAddress,ethers.ZeroAddress],[10000,0,0]]]);
  const source=await deploy('MockPairVault',[cfg.token,router.target]);await(await router.bindSource(source.target,123)).wait();
  await(await token.transfer(converter.target,inventory)).wait();
  const entry={kind:'converter',execution:'market-v1',address:converter.target,vault:vault.target,adapter:adapter.target,executor:owner,
    version:'1',maxInput:String(max),maxHorizon:'300',capacity:String(inventory),refillSeconds:'3600',swapLimit:String(max),deadlineSeconds:'120',
    maxQuoteAge:'120',minUSDG:'10000',slippageBps:100,
    marketQuote:{kind:'v4-simulation-v1',converterHash:ethers.keccak256(await provider.getCode(converter.target)),adapterHash:ethers.keccak256(await provider.getCode(adapter.target)),
      sampleInput:String(max/16n),minSampleOutput:'1000',maxImpactBps:100,maxCandidates:6,maxGasCostWei:String(ethers.parseEther('0.1')),gasMarginBps:12000}};
  const job={schema:'local-prize-flow-v1',chainId:'31337',router:router.target,token:cfg.token,quote:cfg.quote,campaignId:'1',
    recipients:[converter.target,ethers.ZeroAddress,ethers.ZeroAddress],bps:[10000,0,0],active:entry,legacy:[],
    source:{vault:source.target,positionId:'123',epoch:'1'},distribution:'GENERAL',pollSeconds:300,maxGasPrice:'1000000000000'};
  const x=e.marketIntegration={job,inventory:String(inventory),observations:[],receipts:[],assumptions:'Local acquired TOKEN from real BUY; initial USDG wallet capital artificial. Mock fee source and inert draw authority; no public sends, no production parameters.'};
  e.stage='market-quote';
  const block=await provider.getBlock('latest'),request={converter:converter.target,adapter:adapter.target,token:cfg.token,quote:cfg.quote,amountIn:max,version:1n,block};
  const getQuote=createV4MarketQuote({provider,job,onQuote:r=>x.observations.push(r)});
  const before=await token.balanceOf(converter.target),q=await getQuote(request);assert(q,'Reference should quote');x.quote=q;
  assert.equal(await token.balanceOf(converter.target),before);assert.equal(await converter.tokenSold(),0n);
  // A simulated result is not permission to accept less: an impossible minOut must revert atomically.
  e.stage='market-bad-output';
  await assert.rejects(converter.convert.staticCall(q.amountIn,q.amountOut+1n,block.timestamp+120,1));
  assert.equal(await converter.tokenSold(),0n);assert.equal(await token.allowance(converter.target,adapter.target),0n);
  e.stage='market-worker';
  const options={provider,router,executor:user,job};
  const events=[];x.first=await runPrizeFlow(options,{onStep:r=>events.push(r)});
  assert(!['error','degraded'].includes(x.first.status),JSON.stringify(x.first));
  assert(await converter.tokenSold()>0n);assert(await quote.balanceOf(vault.target)>0n);
  for(const event of events)if(event.transactionHash){const receipt=await provider.getTransactionReceipt(event.transactionHash);x.receipts.push(receipt.toJSON());}
  x.events=events;
  x.balances={sold:String(await converter.tokenSold()),forwarded:String(await converter.quoteForwarded()),vault:String(await quote.balanceOf(vault.target)),
    short:String(await vault.freeShort()),current:String(await vault.freeCurrent()),next:String(await vault.freeNext())};
  assert.equal(BigInt(x.balances.short)+BigInt(x.balances.current)+BigInt(x.balances.next),BigInt(x.balances.vault));
  assert.equal(x.balances.forwarded,x.balances.vault);
  assert.equal(await token.allowance(converter.target,adapter.target),0n);assert.equal(await token.allowance(adapter.target,permit),0n);
  const permitContract=new ethers.Contract(permit,['function allowance(address,address,address) view returns(uint160,uint48,uint48)'],provider);
  assert.equal((await permitContract.allowance(adapter.target,cfg.token,cfg.router))[0],0n);
  assert.equal(await token.balanceOf(adapter.target),0n);
  const swaps=x.receipts.flatMap(r=>r.logs).filter(l=>l.address.toLowerCase()===cfg.manager.toLowerCase()&&l.topics[0]===require('./direct-buy.cjs').SWAP_ABI.getEvent('Swap').topicHash);
  assert.equal(swaps.length,1);assert.equal(require('./direct-buy.cjs').SWAP_ABI.parseLog(swaps[0]).args.id,cfg.poolId);
  x.complete=true;
}
module.exports={run};
