// Read-only preparation. No wallet, signer, transaction encoding or send path.
const fs=require('node:fs');
const {isAddress,isHexString}=require('ethers');
const {inspectPlan}=require('./public-launch-plan.cjs');
const {inspect}=require('./launch-source-preflight.cjs');
const {httpRpc}=require('./public-rpc-qualification.cjs');
const BASE='https://pair.fund';
function review({plan,readiness,opening,source,now=Math.floor(Date.now()/1000)}){
 if(plan?.integration!=='pair-infinity')throw Error('PAIR reserve plan required');
 const checks=[];const check=(name,ok)=>checks.push({name,ok:!!ok});
 const p=inspectPlan(plan),quote=plan.contracts.quote;
 check('pairReady',readiness?.ready===true);
 check('sourceMatched',source?.matched===true&&source.checks?.length>0&&source.checks.every(c=>c.ok));
 const observed=Date.parse(source?.observedAt)/1000;
 check('sourceFresh',Number.isFinite(observed)&&now-observed>=-30&&now-observed<=300);
 check('openingChain',opening?.chainId===4663);
 const rows=opening?.quotes?.filter(q=>q.quoteToken?.toLowerCase()===quote.address.toLowerCase())||[];
 check('singleQuote',rows.length===1);
 const candidates=rows[0]?.candidates||[];
 // Match the currently observed frontend choice; never silently select a different route.
 const c=candidates[0];
 check('candidate',!!c);
 check('candidateAsset',isAddress(c?.quoteToken||'')&&c.quoteToken.toLowerCase()===quote.address.toLowerCase()&&c.quoteDecimals===quote.decimals);
 check('candidateEvidence',c?.verification==='verified'&&isHexString(c?.routeEvidence,32)&&c.routeEvidence!=='0x'+'0'.repeat(64));
 const t=Number(c?.observedAt);
 check('candidateFresh',Number.isSafeInteger(t)&&now-t>=-30&&now-t<=300);
 check('ticks',Number.isInteger(c?.tickLower)&&Number.isInteger(c?.tickUpper)&&c.tickLower>=-887272&&c.tickUpper<=887272&&c.tickLower<c.tickUpper);
 check('price',typeof c?.sqrtPriceX96==='string'&&/^[1-9][0-9]*$/.test(c.sqrtPriceX96)&&BigInt(c.sqrtPriceX96)<2n**160n);
 check('acceptedEconomics',p.conflicts.length===0);
 const eligible=checks.every(c=>c.ok);
 return {schema:'pair-launch-preview-v1',observedAt:new Date(now*1000).toISOString(),checks,
  candidateUsableForFurtherSimulation:eligible,openingCandidate:eligible?c:null,
  missing:p.missing,conflicts:p.conflicts,
  route:{chainId:4663,mode:'CREATOR_QUOTE',creatorFeeBps:plan.product.creatorFeeBps,quote:quote.address,recipient:'InfinityCollector (address not yet admitted)'},
  costs:{pairLaunchFeeWei:checks.find(c=>c.name==='sourceMatched').ok&&checks.find(c=>c.name==='sourceFresh').ok?source.values?.launchFee??null:null,deploymentGasWei:null,launchGasWei:null,operationsReserveWei:null,totalWei:null},
  dependencies:[
   'Choose creator and role addresses; finalize metadata and immutable settings',
   'Predict PAIR token and own deployment addresses; verify nonce dependencies',
   'Deploy collector bound to predicted token; launch via PAIR with collector in modeData',
   'Deploy registry, drand adapter, Robinhood controllers and vault with checked address dependencies',
   'Bind collector to authenticated PAIR source and vault with approved 90/5/5 campaign',
   'Publish admitted BUY policy; qualify RPC, custody and automation before enabling service'
  ],transaction:null,authorizationToSend:false,
  limitation:'API candidate only, not on-chain opening admission. Five-minute age limit is a local preview filter, not PAIR policy. Address orientation, metadata, factory prediction, simulation and exact costs remain required. No test opening prices substituted.'};
}
async function collect(plan,{fetcher=fetch,rpc=httpRpc(process.env.RH_RPC_URL||'https://rpc.mainnet.chain.robinhood.com')}={}){
 if(plan?.integration!=='pair-infinity')throw Error('PAIR reserve plan required');
 async function json(url,options={}){const r=await fetcher(BASE+url,{...options,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('PAIR read failed');return r.json();}
 const [readiness,opening,source]=await Promise.all([
  json('/api/launches/pancake-v1-infinity/readiness'),
  json('/api/launches/pancake-v1/opening-quotes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({quoteTokens:[plan.contracts.quote.address]})}),
  inspect({rpc})
 ]);
 return {preview:review({plan,readiness,opening,source}),evidence:{readiness,opening,source}};
}
if(require.main===module)(async()=>{
 const file=process.argv[2];if(!file||fs.existsSync(file))throw Error('New output path required');
 const plan=JSON.parse(fs.readFileSync('config/reserve/pair-launch-plan.json','utf8'));
 const result=await collect(plan);fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(result.preview,null,2));
})().catch(()=>{console.error('PAIR preview failed; no transactions sent');process.exitCode=1;});
module.exports={review,collect};
