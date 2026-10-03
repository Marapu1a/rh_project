const $=id=>document.getElementById(id),key=location.hash.slice(1),providers=new Map(),bound=new WeakSet();let wallet,view,prepared,busy=false,connected=false;
history.replaceState(null,'',location.pathname);
async function api(route,value={}){const r=await fetch(route,{method:'POST',headers:{'content-type':'application/json','x-qianqi-session':key},body:JSON.stringify(value)});const result=await r.json();if(!r.ok)throw Error(result.error);return result;}
function announce(e){const {info,provider}=e.detail||{};if(!info||!provider?.request||providers.has(info.uuid))return;providers.set(info.uuid,provider);const o=document.createElement('option');o.value=info.uuid;o.textContent=info.name;$('wallet').append(o);}
window.addEventListener('eip6963:announceProvider',announce);window.dispatchEvent(new Event('eip6963:requestProvider'));
async function identity(){if(!wallet)throw Error('Подключи кошелёк');const [accounts,chain]=await Promise.all([wallet.request({method:'eth_accounts'}),wallet.request({method:'eth_chainId'})]);if(accounts[0]?.toLowerCase()!==view.governor.toLowerCase()||BigInt(chain)!==4663n)throw Error('Нужен управляющий аккаунт и Robinhood Chain');}
function render(){
 $('sign').disabled=busy||!connected||!view?.allowSend||!prepared||prepared.expiresAt<=Date.now();
 $('review').disabled=busy||!connected||!view;
 $('connect').disabled=busy||!view;
 $('refresh').disabled=busy||!view;$('recover').disabled=busy||!view;$('wallet').disabled=busy;
}
async function action(fn){if(busy)return;busy=true;render();try{await fn();}catch(e){prepared=null;$('status').textContent=e.code===4001?'Отменено в кошельке. Если запрос уже подготовлен к отправке, журнал требует сверки; повторно не отправляем.':e.message||'Не удалось завершить действие';}finally{busy=false;render();}}
function invalidate(){prepared=null;connected=false;render();$('status').textContent='Кошелёк или сеть изменились. Подключи нужный аккаунт и проверь шаг заново.';}
$('wallet').onchange=()=>{wallet=null;invalidate();};
$('connect').onclick=()=>action(async()=>{connected=false;wallet=providers.get($('wallet').value);if(!wallet)throw Error('Выбери расширение кошелька');await wallet.request({method:'eth_requestAccounts'});await identity();connected=true;if(!bound.has(wallet)){wallet.on?.('accountsChanged',invalidate);wallet.on?.('chainChanged',invalidate);bound.add(wallet);}$('status').textContent=prepared&&prepared.expiresAt>Date.now()?'Кошелёк подключён, шаг проверен. Нажми «Подписать в кошельке».':'Управляющий кошелёк подключён. Теперь нажми «Проверить следующий шаг».';});
$('review').onclick=()=>action(async()=>{prepared=null;await identity();prepared=await api('/prepare');$('details').textContent=JSON.stringify({...prepared,request:{...prepared.request,data:prepared.request.data.slice(0,66)+'… (полный bytecode сохранён в локальном плане)'}},null,2);$('status').textContent=view.allowSend?'Шаг проверен. Нажми «Подписать в кошельке» в течение минуты.':'Режим проверки: подписи и отправки выключены.';});
$('sign').onclick=()=>action(async()=>{await identity();if(!prepared||prepared.expiresAt<Date.now())throw Error('Проверка устарела');const request=await api('/intent',{id:prepared.id});await identity();const txHash=await wallet.request({method:'eth_sendTransaction',params:[request]});$('txhash').value=txHash;localStorage.setItem('qianqi-deployment-last-hash',txHash);await api('/submitted',{hash:txHash});$('status').textContent='Хеш сохранён. Проверь подтверждение перед следующим шагом.';prepared=null;});
$('refresh').onclick=()=>action(async()=>{$('details').textContent=JSON.stringify(await api('/refresh'),null,2);});
$('recover').onclick=()=>action(async()=>{$('details').textContent=JSON.stringify(await api('/submitted',{hash:$('txhash').value.trim()}),null,2);});
render();setInterval(()=>{if(prepared&&prepared.expiresAt<=Date.now()){prepared=null;if(!busy)$('status').textContent='Проверка устарела. Нажми «Проверить следующий шаг» ещё раз.';}render();},1000);
api('/view').then(v=>{view=v;$('details').textContent=JSON.stringify(v,null,2);$('status').textContent=v.allowSend?'Подписи включены. Сначала подключи управляющий кошелёк.':'Режим проверки. Отправки выключены.';$('txhash').value=localStorage.getItem('qianqi-deployment-last-hash')||'';render();}).catch(()=>{$('status').textContent='Открой исходную ссылку из CLI с ключом сессии.';});
