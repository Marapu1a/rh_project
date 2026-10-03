// Read-only snapshot. Never sends or grants launch authorization.
const fs=require('node:fs'),{ethers:E}=require('ethers');
const {hash}=require('./direct-buy.cjs');
async function inspect(p,settings,dependencies){
 if((await p.getNetwork()).chainId!==4663n)throw Error('Wrong chain');
 const head=await p.getBlock('latest'),finalized=await p.getBlock('finalized');
 if(!head||!finalized)throw Error('Finality unavailable');
 const tag=head.number,changes=[],contracts={};
 for(const [name,row]of Object.entries(dependencies.contracts)){
  const code=await p.getCode(row.address,tag),runtimeHash=E.keccak256(code);
  contracts[name]={address:row.address,runtimeHash};if(code==='0x'||runtimeHash!==row.runtimeHash)changes.push(name+'Runtime');
 }
 await require('./pons-public-profile.cjs').inspectQuote(p,{quoteImplementation:settings.quoteImplementation},{manifest:{quote:dependencies.contracts.quote.address}},tag);
 const factory=new E.Contract(contracts.factory.address,require('./integrations/pons-v2.cjs').FAB,p);
 const quote=new E.Contract(contracts.quote.address,require('./integrations/pons-v2.cjs').ERC,p);
 const opts={blockTag:tag},governor=settings.roles.governor;
 const [hook,escrow,canLaunch,approved,fee,economics,decimals]=await Promise.all([
  factory.memeHook(opts),factory.feeEscrow(opts),factory.canLaunch(governor,opts),factory.approvedPairTokens(quote.target,opts),factory.launchFee(opts),factory.previewLaunchEconomics(0,quote.target,opts),quote.decimals(opts)]);
 if(hook.toLowerCase()!==contracts.hook.address.toLowerCase())changes.push('hookAddress');
 if(escrow.toLowerCase()!==contracts.escrow.address.toLowerCase())changes.push('escrowAddress');
 if(!canLaunch)changes.push('launchUnavailable');if(!approved||decimals!==6n)changes.push('quoteUnavailable');
 const wallets={};for(const role of ['governor','executor']){
  const address=settings.roles[role],nonce=await p.getTransactionCount(address,tag),pendingNonce=await p.getTransactionCount(address,'pending');
  wallets[role]={address,nonce,pendingNonce,nativeWei:String(await p.getBalance(address,tag)),quoteRaw:String(await quote.balanceOf(address,opts))};
  if(nonce!==pendingNonce)changes.push(role+'PendingTransactions');
 }
 const lag=head.timestamp-finalized.timestamp;if(lag<0||lag>Number(settings.timing.maxFinalizedLag))changes.push('finalityLag');
 if((await p.getBlock(tag)).hash!==head.hash)throw Error('Snapshot reorg');
 return {schema:'pons-launch-preflight-v1',observedAt:new Date().toISOString(),publicSends:false,authorizationToLaunch:false,settingsHash:hash(settings),block:{number:tag,hash:head.hash,timestamp:head.timestamp},finalized:{number:finalized.number,hash:finalized.hash,lagSeconds:lag},contracts,wallets,launch:{feeWei:String(fee),economics,canLaunch,quoteApproved:approved},baseFeePerGas:String(head.baseFeePerGas),changes,status:changes.length?'reviewRequired':'snapshotMatched',limits:['Snapshot only; recheck nonce, mutable economics and runtime immediately before each signature','Balances are observed, not a gas budget or a funding requirement']};
}
if(require.main===module)(async()=>{
 const output=process.argv[2];if(!output||fs.existsSync(output))throw Error('New output required');
 const url=process.env.RH_RPC_URL;if(new URL(url).protocol!=='https:')throw Error('HTTPS required');
 const req=new E.FetchRequest(url);req.timeout=20000;const p=new E.JsonRpcProvider(req,undefined,{cacheTimeout:-1});
 try{const report=await inspect(p,require('../config/pons-deployment-candidate.json'),require('../docs/evidence/PONS_DEPENDENCIES_2026-10-03.json'));fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));}finally{p.destroy();}
})().catch(()=>{console.error('Launch preflight unavailable; no sends performed, RPC details omitted');process.exitCode=1;});
module.exports={inspect};
