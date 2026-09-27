// Saved fork receipts only: no assertion of public deployment or production readiness.
const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const e=require('../research/infinity-source-audit/fork-success-2026-09-27.json');
const h=new ethers.Interface(require('../research/infinity-source-audit/hook.json').abi);
const v=new ethers.Interface(require('../research/infinity-source-audit/creator.json').abi);
const transfers=new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const lower=s=>s.toLowerCase();
const tx=label=>{const t=e.transactions.find(t=>t.label===label);assert(t,label);assert.equal(t.receipt.status,'0x1');return t;};
function parsed(t,address,iface,name){return t.receipt.logs.filter(l=>lower(l.address)===lower(address)).map(l=>{try{return iface.parseLog(l)}catch{return null}}).filter(l=>l?.name===name);}
test('Infinity launch selects 3pct Creator Quote and the actual deployed receiver',()=>{
 assert.equal(e.success,true);assert.equal(e.feeBps,300);
 const launch=tx('launch Infinity 3pct USDG');assert.equal(lower(launch.tx.from),lower(e.roles.creator));
 assert.equal(BigInt(launch.tx.value),BigInt(e.launch.fee));
 const policies=parsed(launch,e.pins.hook.address,h,'PolicyScheduled');assert.equal(policies.length,1);
 const p=policies[0].args;assert.equal(lower(p.project),lower(e.launch.token));assert.equal(p.feeBps,300n);assert.equal(p.mode,1n);assert.equal(lower(p.destination),lower(e.source.vault));
 const appended=parsed(launch,e.source.vault,v,'PolicyAppended');assert.equal(appended.length,1);
 assert.equal(lower(appended[0].args.recipient),lower(e.launch.recipient));assert.equal(appended[0].args.feeBps,300n);
 assert.equal(lower(tx('deploy local receiver').receipt.contractAddress),lower(e.launch.recipient));
});
test('BUY and SELL fees fund the receiver via permissionless pulls without LP collect',()=>{
 let sum=0n;
 for(const [swapLabel,pullLabel]of [['BUY 100 base plus 3.3 hook fees','permissionless pull BUY fees'],['SELL all bought TOKEN','permissionless pull SELL fees']]){
  const trade=tx(swapLabel),pull=tx(pullLabel),fees=parsed(trade,e.pins.hook.address,h,'ModeFeeAccrued');assert.equal(fees.length,1);
  const due=fees[0].args.amount;assert(due>0n);sum+=due;
  const funded=parsed(trade,e.launch.quote,transfers,'Transfer').filter(l=>lower(l.args.to)===lower(e.source.vault)).reduce((s,l)=>s+l.args.value,0n);assert.equal(funded,due);
  assert.equal(lower(pull.tx.from),lower(e.roles.buyer));
  const paid=parsed(pull,e.launch.quote,transfers,'Transfer').filter(l=>lower(l.args.from)===lower(e.source.vault)&&lower(l.args.to)===lower(e.launch.recipient)).reduce((s,l)=>s+l.args.value,0n);assert.equal(paid,due);
 }
 assert.equal(sum,BigInt(e.result.receiverUSDG));assert.equal(e.result.buy.mode,'3000000');assert.equal(e.result.buy.protocol,'300000');
 const q=BigInt(lower(e.poolKey[0])===lower(e.launch.quote)?e.result.sell.swap.amount0:e.result.sell.swap.amount1);
 assert.equal(BigInt(e.result.sell.mode),q*300n/10000n);assert.equal(BigInt(e.result.sell.protocol),q*30n/10000n);
 assert.equal(BigInt(e.result.quoteReturned),q-BigInt(e.result.sell.mode)-BigInt(e.result.sell.protocol));assert.equal(e.result.emptyClaimRejected,true);
});
