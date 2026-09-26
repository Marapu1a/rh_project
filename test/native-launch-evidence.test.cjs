// Offline consistency of saved raw fork receipts, not independent mainnet authentication.
const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const e=require('../research/native-launch/fork-success-2026-09-26.json');
const entry=require('../research/native-launch/launch-entry-abi.json');
const lower=x=>x.toLowerCase();
const transfer=new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
function tx(label){const t=e.transactions.find(x=>x.label===label);assert(t,label);assert.equal(t.receipt.status,'0x1');return t;}
function transferred(t,asset,from,to){return t.receipt.logs.filter(l=>lower(l.address)===lower(asset)&&l.topics[0]===transfer.getEvent('Transfer').topicHash).map(l=>transfer.parseLog(l).args).filter(a=>lower(a.from)===lower(from)&&lower(a.to)===lower(to)).reduce((s,a)=>s+a.value,0n);}

test('new native launch receipt binds ordinary creator, future converter and real registered position',()=>{
 assert.equal(e.success,true);assert.equal(e.stage,'complete');assert.equal(e.preflight.quoteConfig.enabled,true);assert.equal(e.invalidPositionsRejected,true);
 const launch=tx('native launch via public entrypoint'),call=new ethers.Interface(entry.abi).parseTransaction({data:launch.transaction.input,value:launch.transaction.value});
 assert.equal(lower(launch.transaction.from),lower(e.roles.creator));assert.equal(BigInt(launch.transaction.value),BigInt(e.preflight.launchFee));assert.equal(call.args.p.modeId,1n);assert.equal(call.args.p.allocations.length,1);assert.equal(lower(call.args.p.allocations[0].quoteToken),lower(e.preflight.quote));
 const [recipients,shares]=ethers.AbiCoder.defaultAbiCoder().decode(['address[]','uint16[]'],call.args.p.modeConfiguration);assert.deepEqual([...shares],[10000n]);assert.deepEqual(recipients.map(lower),[lower(e.launch.router)]);
 const router=tx('deploy FeeRouter'),converter=tx('deploy LocalMarketPrizeConverter');assert.equal(lower(converter.receipt.contractAddress),lower(e.bootstrap.converter));assert.equal(lower(ethers.getCreateAddress({from:e.roles.owner,nonce:BigInt(router.transaction.nonce)+3n})),lower(e.bootstrap.converter));assert(BigInt(converter.receipt.blockNumber)>BigInt(launch.receipt.blockNumber));
 const policyAbi=new ethers.Interface(['event CampaignOpened(uint64 indexed campaignId,uint64 endsAt,address[3] recipients,uint16[3] bps)']);
 const opened=router.receipt.logs.filter(l=>l.topics[0]===policyAbi.getEvent('CampaignOpened').topicHash).map(l=>policyAbi.parseLog(l));assert.equal(opened.length,1);assert.equal(lower(opened[0].args.recipients[0]),lower(e.bootstrap.converter));
 const sourceAbi=new ethers.Interface(['event NativePositionRegistered(uint256 indexed positionId,bytes32 indexed poolId,address indexed quote)']);
 const events=launch.receipt.logs.filter(l=>lower(l.address)===lower(e.binding.vault)&&l.topics[0]===sourceAbi.getEvent('NativePositionRegistered').topicHash).map(l=>sourceAbi.parseLog(l).args);assert.equal(events.length,1);assert.equal(events[0].positionId,BigInt(e.binding.position));assert.equal(events[0].poolId,e.binding.poolId);assert.equal(lower(events[0].quote),lower(e.preflight.quote));
});

test('new native BUY fees reconcile 70/30, harvest, fixed recipient forwarding and all reserves',()=>{
 const quote=e.preflight.quote,buy=tx('ordinary USDG buy through Universal Router');assert.equal(BigInt(e.buy.usdSpent),100_000000n);
 const swap=require('../scripts/direct-buy.cjs').SWAP_ABI,swaps=buy.receipt.logs.filter(l=>lower(l.address)===lower(e.binding.manager)&&l.topics[0]===swap.getEvent('Swap').topicHash).map(l=>swap.parseLog(l).args);assert.equal(swaps.length,1);assert.equal(swaps[0].id,e.binding.poolId);
 const fees=new ethers.Interface(['event NativeFeesAllocated(uint256 indexed positionId,address indexed asset,uint256 modeAmount,uint256 protocolAmount)']);
 const collect=tx('collect new LP fees'),rows=collect.receipt.logs.filter(l=>lower(l.address)===lower(e.binding.vault)&&l.topics[0]===fees.getEvent('NativeFeesAllocated').topicHash).map(l=>fees.parseLog(l).args);
 let prizeTotal=0n;for(const a of rows){assert.equal(a.positionId,BigInt(e.binding.position));assert.equal(a.modeAmount,(a.modeAmount+a.protocolAmount)*7000n/10000n);if(lower(a.asset)===lower(quote))prizeTotal+=a.modeAmount;}
 assert(prizeTotal>0n);assert.equal(prizeTotal,BigInt(e.result.receivedUSDG));
 assert.equal(transferred(tx('harvest '+quote),quote,e.binding.vault,e.launch.router),prizeTotal);
 assert.equal(transferred(tx('pay converter '+quote),quote,e.launch.router,e.prizePath.converter),prizeTotal);
 assert.equal(transferred(tx('forward earned USDG into reserves'),quote,e.prizePath.converter,e.prizePath.vault),prizeTotal);
 const allocation=new ethers.Interface(['event USDGAllocated(address indexed payer,uint8 indexed destination,uint256 received,uint256 shortAmount,uint256 currentAmount,uint256 nextAmount)']);
 const events=tx('forward earned USDG into reserves').receipt.logs.filter(l=>lower(l.address)===lower(e.prizePath.vault)&&l.topics[0]===allocation.getEvent('USDGAllocated').topicHash).map(l=>allocation.parseLog(l).args);assert.equal(events.length,1);
 const a=events[0];assert.equal(a.received,prizeTotal);assert.equal(a.shortAmount+a.currentAmount+a.nextAmount,prizeTotal);assert.deepEqual([a.shortAmount,a.currentAmount,a.nextAmount],e.result.reserves.map(BigInt));assert.equal(BigInt(e.result.routerAccounted),0n);
});
