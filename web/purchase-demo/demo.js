'use strict';
// Intentionally no window.ethereum, external API, signatures, or real transactions.
const $=id=>document.getElementById(id),key='qianqi.purchase-demo.fixture.v1';
let fixture;
try{fixture=JSON.parse(sessionStorage.getItem(key));}catch{}
fixture??={account:'0x'+'1'.repeat(40),chainId:'0x1237',allowances:{},txs:{},nonce:0};
const save=()=>sessionStorage.setItem(key,JSON.stringify(fixture));
const scope=()=>fixture.account+':'+fixture.chainId;
const fixtureAdapter={
 identity:async()=>({account:fixture.account,chainId:fixture.chainId}),
 prepare:async({amountRaw,identity})=>{
  const permissions=fixture.allowances[scope()]??{},kind=BigInt(permissions.usdg??0)<BigInt(amountRaw)?'approve-usdg':BigInt(permissions.router??0)<BigInt(amountRaw)?'approve-router':'buy';
  return {kind,amountRaw,account:identity.account,scope:scope(),quote:(BigInt(amountRaw)*1000n).toString(),minimum:(BigInt(amountRaw)*990n).toString(),expiresAt:Date.now()+60000};
 },
 send:async plan=>{
  const outcome=$('outcome').value;
  if(outcome==='reject')throw {code:4001};
  if(outcome==='unknown')throw Error('Simulated transport loss');
  const hash='0x'+(++fixture.nonce).toString(16).padStart(64,'0');
  fixture.txs[hash]={plan,status:outcome==='pending'?'pending':outcome==='reverted'?'reverted':'success',applied:false};save();return hash;
 },
 receipt:async hash=>{
  const tx=fixture.txs[hash];if(!tx||tx.status==='pending')return null;
  if(tx.status==='success'&&!tx.applied){const a=fixture.allowances[tx.plan.scope]??={};if(tx.plan.kind==='approve-usdg')a.usdg=tx.plan.amountRaw;if(tx.plan.kind==='approve-router')a.router=tx.plan.amountRaw;if(tx.plan.kind==='buy'){a.usdg='0';a.router='0';}tx.applied=true;save();}
  return {hash,status:tx.status};
 }
};
const fork=window.qianqiLocalForkAdapter,adapter=fork??fixtureAdapter;
let recovering=!!fork?.recover;
const flow=new PurchaseReview.Review({adapter,storage:sessionStorage,onChange:render});
function display(raw){if(raw===null)return 'Available at the buy step';const decimals=flow.state.plan?.tokenDecimals??6,d=10n**BigInt(decimals),n=BigInt(raw),fraction=(n%d).toString().padStart(decimals,'0').replace(/0+$/,'');return (n/d).toLocaleString('en-US')+(fraction?'.'+fraction:'')+' QIANQI'+(fork?' (local fork)':' (demo)');}
function render(){
 const s=flow.state,locked=recovering||flow.blocked()||['loading','checking'].includes(s.status);
 $('amount').disabled=locked;$('review').disabled=locked;$('details').hidden=!s.plan;
 $('confirm').disabled=recovering||s.status!=='review';$('check').hidden=s.status!=='pending';
 if(s.plan){const raw=BigInt(s.plan.amountRaw),fraction=(raw%1000000n).toString().padStart(6,'0').replace(/0+$/,'');$('amount').value=(raw/1000000n).toString()+(fraction?'.'+fraction:'');$('kind').textContent={'reset-usdg-approval':'Reset the old USDG allowance','approve-usdg':'Allow this USDG amount','approve-router':'Allow the direct router','buy':'Buy QIANQI'}[s.plan.kind];$('buyer').textContent=s.identity.account;$('quote').textContent=display(s.plan.quote);$('minimum').textContent=display(s.plan.minimum);if(fork)$('route').textContent='USDG → QIANQI · direct '+s.plan.venue;}
 const messages={idle:'Enter an amount, then review the next step.',loading:fork?'Getting a local fork quote…':'Getting a demo quote…',review:'Review these details. Nothing has been sent.',checking:'Checking wallet and quote…',submitting:'Waiting for the wallet…',pending:'Transaction pending. Check its status; don’t send it again.',unknown:'We cannot confirm submission. Check the wallet; don’t send it again.',rejected:'Request declined. Review again when you’re ready.',reverted:'Transaction reverted. No purchase was completed by this step.',confirmed:s.plan?.kind==='buy'?(fork?'Local fork purchase confirmed. Ticket processing is checked separately.':'Demo purchase confirmed. Ticket processing would follow separately.'):'Approval confirmed. Review the next step to continue.'};
 $('status').textContent=s.message??messages[s.status];$('hash').textContent=s.hash?(fork?'Local fork transaction: ':'Demo transaction: ')+s.hash:'';
 $('identity').textContent=`Demo wallet ${fixture.account} · ${fixture.chainId==='0x1237'?'Robinhood Chain':'Wrong network'}`;
}
function run(fn){Promise.resolve().then(fn).catch(()=>{$('status').textContent='The rehearsal could not save or load its state. No further request will be made.';});}
$('review').onclick=()=>run(()=>flow.review($('amount').value));$('confirm').onclick=()=>run(()=>flow.confirm());$('check').onclick=()=>run(()=>flow.check());
$('amount').oninput=()=>run(()=>flow.invalidate());
$('switch-account').onclick=()=>run(()=>{fixture.account='0x'+(fixture.account[2]==='1'?'2':'1').repeat(40);save();flow.invalidate();render();});
$('switch-chain').onclick=()=>run(()=>{fixture.chainId=fixture.chainId==='0x1237'?'0x1':'0x1237';save();flow.invalidate();render();});
$('settle').onclick=()=>run(()=>{for(const tx of Object.values(fixture.txs))if(tx.status==='pending')tx.status='success';save();return flow.check();});
$('reset').onclick=()=>{sessionStorage.removeItem(key);sessionStorage.removeItem('qianqi.purchase-demo.v1');location.reload();};
if(fork){document.querySelector('aside').hidden=true;$('environment').textContent='Local fork: quotes and transactions use copied contracts with test funds. Your wallet extension is never connected.';$('confirm').textContent='Confirm local fork step';document.querySelector('header span').textContent='LOCAL FORK · TEST FUNDS ONLY';}
render();
if(fork?.recover){run(async()=>{const pending=await fork.recover();if(pending){const identity={account:pending.request.params[0].from,chainId:pending.request.params[0].chainId};flow.set({status:pending.hash?'pending':'unknown',hash:pending.hash,plan:pending,identity});}recovering=false;render();});}
