'use strict';
const $=id=>document.getElementById(id),dialog=$('dialog'),providers=new Map();
let provider=null,address=null,chain=null,version=0,busy=false;
const expectedChain=4663n;
function show(title,copy,{error=false,choices=[]}={}){
 $('dialog-title').textContent=title;$('dialog-copy').textContent=copy;$('dialog-mouse').hidden=!error;
 $('wallet-options').replaceChildren();for(const item of choices){const b=document.createElement('button');b.className='button outline';b.textContent=item.name;b.onclick=()=>{dialog.close();void connect(item.provider);};$('wallet-options').append(b);}if(!dialog.open)dialog.showModal();
}
for(const b of document.querySelectorAll('.dialog-close'))b.addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
window.addEventListener('eip6963:announceProvider',e=>{const d=e.detail;if(d?.info?.uuid&&typeof d.provider?.request==='function')providers.set(d.info.uuid,{name:String(d.info.name||'Wallet'),provider:d.provider});});
window.dispatchEvent(new Event('eip6963:requestProvider'));
function emptyRewards(title,copy){const td=document.createElement('td');td.colSpan=3;const box=document.createElement('div');box.className='empty-state';const h=document.createElement('h3');h.textContent=title;const p=document.createElement('p');p.textContent=copy;box.append(h,p);td.append(box);const tr=document.createElement('tr');tr.append(td);$('rewards-body').replaceChildren(tr);}
function resetData(message){$('short-count').textContent='—';$('monthly-count').textContent='—';$('carry').textContent=message;$('provenance').textContent='No verified data available.';emptyRewards('REWARDS UNAVAILABLE',message);}
function updateButtons(){for(const b of document.querySelectorAll('.connect')){b.textContent=busy?'CONNECTING…':address?`${address.slice(0,6)}…${address.slice(-4)} ↗`:'CONNECT WALLET ↗';b.disabled=busy;}$('disconnect').hidden=!address;$('refresh').hidden=!address;}
function cleanup(){provider?.removeListener?.('accountsChanged',accountsChanged);provider?.removeListener?.('chainChanged',chainChanged);provider?.removeListener?.('disconnect',disconnected);}
function disconnected(){cleanup();provider=null;address=null;chain=null;version++;updateButtons();$('wallet-status').textContent='Wallet disconnected.';resetData('Connect to view tickets.');}
function accountsChanged(accounts){version++;if(!accounts?.length){disconnected();return;}address=/^0x[0-9a-fA-F]{40}$/.test(accounts[0])?accounts[0].toLowerCase():null;updateButtons();resetData('Checking this wallet…');void refresh();}
function chainChanged(value){version++;try{chain=BigInt(value);}catch{chain=null;}resetData('Checking network…');void refresh();}
async function connect(chosen){
 if(busy)return;busy=true;updateButtons();
 try{
  const accounts=await chosen.request({method:'eth_requestAccounts'}),network=await chosen.request({method:'eth_chainId'});
  if(!accounts?.length||!/^0x[0-9a-fA-F]{40}$/.test(accounts[0]))throw Error();
  cleanup();provider=chosen;address=accounts[0].toLowerCase();chain=BigInt(network);version++;
  provider.on?.('accountsChanged',accountsChanged);provider.on?.('chainChanged',chainChanged);provider.on?.('disconnect',disconnected);
  document.getElementById('account').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});await refresh();
 }catch(e){show('Connection not completed',e?.code===4001?'You declined the request. Nothing was signed or sent.':'Your wallet could not connect. Please unlock it and try again.',{error:true});}
 finally{busy=false;updateButtons();}
}
async function chooseWallet(){
 if(address){if(chain!==expectedChain){try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x'+expectedChain.toString(16)}]});chain=BigInt(await provider.request({method:'eth_chainId'}));await refresh();}catch{show('Switch to Robinhood Chain','Select Robinhood Chain in your wallet, then refresh.');}}else $('account').scrollIntoView({behavior:'smooth'});return;}
 const choices=[...providers.values()];if(!choices.length&&window.ethereum?.request)choices.push({name:'Browser wallet',provider:window.ethereum});
 if(!choices.length){show('Wallet required','Use a wallet browser or browser extension. QR connection is not supported.');return;}
 if(choices.length===1){await connect(choices[0].provider);return;}show('Choose your wallet','Only your public address is shared. No payment authorization.',{choices});
}
function units(raw,decimals){if(!/^\d+$/.test(String(raw))||!Number.isInteger(decimals)||decimals<0||decimals>36)throw Error('Invalid amount');const n=BigInt(raw),d=10n**BigInt(decimals),fraction=(n%d).toString().padStart(decimals,'0').replace(/0+$/,'');return (n/d).toLocaleString('en-US')+(fraction?'.'+fraction:'');}
async function refresh(){
 const request=++version,wallet=address;if(!wallet)return;
 if(chain!==expectedChain){$('wallet-status').textContent='Wrong network. Use the wallet button to switch to Robinhood Chain.';resetData('Select Robinhood Chain to view your participation.');return;}
 $('wallet-status').textContent='Checking participation…';
 try{
  const res=await fetch(`/v1/wallets/${wallet}?limit=25`,{cache:'no-store',signal:AbortSignal.timeout(10000)});const data=await res.json();if(request!==version)return;
  if(!res.ok||data.schema!=='promo-wallet-status-v1'||!['observed','stale'].includes(data.status)||data.wallet!==wallet||String(data.provenance?.chainId)!==String(expectedChain)||!data.balances)throw Error();
  const b=data.balances;$('short-count').textContent=units(b.SHORT.open,0);$('monthly-count').textContent=units(b.MONTHLY.open,0);
  const remaining=BigInt(b.entryThresholdRaw)-BigInt(b.carryRaw);if(remaining<=0n)throw Error();
  $('carry').textContent=`${units(String(remaining),b.quoteDecimals)} USDG to the next ticket. Available tickets only.`;
  $('wallet-status').textContent=data.status==='stale'?'Updates delayed. These are last verified balances.':'Available tickets. Frozen tickets belong to their draw.';
  $('provenance').textContent=`As of block ${data.provenance.head.number} · ${data.provenance.observedAt??'time unavailable'}`;
  if(data.rewards===null)emptyRewards('REWARD DATA NOT AVAILABLE','No verified reward data.');
  else if(!data.rewards.items.length)emptyRewards('NO ASSIGNED REWARDS','As of this observation.');
  else{
   // Reward asset/decimals must come from a verified deployment profile, never the quote decimals.
   $('rewards-body').replaceChildren();for(const reward of data.rewards.items){const tr=document.createElement('tr');for(const text of [String(reward.drawId).slice(0,10)+'…','Amount unavailable',reward.status==='paid'?'Paid':'Assigned · awaiting payout']){const td=document.createElement('td');td.textContent=text;tr.append(td);}tr.lastChild.className=reward.status==='paid'?'status-paid':'status-assigned';$('rewards-body').append(tr);}
   $('provenance').textContent+=` · Showing ${data.rewards.items.length} of ${data.rewards.total} rewards. Amounts and claims unavailable.`;
  }
 }catch{if(request!==version)return;resetData('Ticket data unavailable. This does not mean zero tickets.');$('wallet-status').textContent='Data unavailable. Try refreshing.';}
}
for(const b of document.querySelectorAll('.connect'))b.addEventListener('click',()=>void chooseWallet());
$('disconnect').addEventListener('click',disconnected);$('refresh').addEventListener('click',()=>void refresh());
$('buy').addEventListener('click',()=>show('Buying unavailable','No verified buying link is available. Check the token address and supported route before buying.'));
setInterval(()=>{if(address&&!document.hidden)void refresh();},30000);
