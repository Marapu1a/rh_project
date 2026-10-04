const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const {createSite}=require('../scripts/serve-site.cjs');
const A='0x'+'1'.repeat(40),B='0x'+'2'.repeat(40),C='0x'+'3'.repeat(40);
async function setup(t,{late=false}={}){
 const server=createSite();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
 const page=await browser.newPage({viewport:{width:390,height:900},reducedMotion:'reduce'});
 await page.addInitScript(({A,B,C,late})=>{
  window.calls=[];window.ws={};
  for(const [name,list] of [['Alpha',[A,B]],['Beta',[C]]]){
   const events=new Map();const state={list,chain:'0x1237',error:null,hold:false,granted:true,events};
   state.emit=(name,value)=>{for(const fn of [...(events.get(name)||[])])fn(value);};
   state.provider={on:(n,fn)=>{if(!events.has(n))events.set(n,new Set());events.get(n).add(fn);},removeListener:(n,fn)=>events.get(n)?.delete(fn),request:async({method,params})=>{
    calls.push({name,method,params});
    if(state.error)throw {code:state.error};
    if(method==='eth_requestAccounts'){if(state.hold)return new Promise(r=>state.resolve=r);return state.list;}
    if(method==='eth_accounts')return state.granted?state.list:[];
    if(method==='eth_chainId')return state.chain;
    if(method==='wallet_switchEthereumChain'){state.chain=params[0].chainId;state.emit('chainChanged',state.chain);return null;}
    if(method==='wallet_requestPermissions')return [];
    throw Error('Unexpected wallet operation: '+method);
   }};
   state.announce=()=>dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:name,name,rdns:'org.example.'+name.toLowerCase()},provider:state.provider}}));ws[name]=state;
  }
  addEventListener('eip6963:requestProvider',()=>{ws.Alpha.announce();if(!late)ws.Beta.announce();});
 },{A,B,C,late});
 const requests=[];await page.route('**/v1/wallets/**',r=>{const wallet=new URL(r.request().url()).pathname.split('/').pop();requests.push(wallet);return r.fulfill({contentType:'application/json',body:JSON.stringify({schema:'promo-wallet-status-v1',status:'observed',wallet,provenance:{chainId:'4663',head:{number:1},observedAt:'2026-09-30T00:00:00Z'},balances:{SHORT:{open:wallet===A?'1':wallet===B?'2':'3'},MONTHLY:{open:'1'},carryRaw:'0',entryThresholdRaw:'100',quoteDecimals:0},rewards:{items:[],total:0}})});});
 const url=`http://127.0.0.1:${server.address().port}${process.env.SITE_TEST_PATH||'/concepts/hk/'}`;await page.goto(url);
 return {page,url,requests};
}
async function choose(page,name='Alpha'){await page.locator('header .connect').click();await page.getByRole('button',{name,exact:true}).click();await page.waitForFunction(()=>!document.querySelector('header .connect').disabled&&document.getElementById('disconnect').hidden===false);}
async function count(page,n){await page.waitForFunction(n=>document.getElementById('short-count').textContent===n,n);}

test('late purchase shows waiting and then confirmation without changing its original transaction',async t=>{
 const {page}=await setup(t);let confirmed=false;
 await page.route('**/v1/wallets/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({schema:'promo-wallet-status-v1',status:'observed',wallet:A,provenance:{chainId:'4663',head:{number:20}},balances:{SHORT:{open:confirmed?'2':'0'},MONTHLY:{open:confirmed?'2':'0'},carryRaw:'0',entryThresholdRaw:'100',quoteDecimals:0},purchases:{items:[{transactionHash:'0x'+'a'.repeat(64),blockNumber:10,status:confirmed?'ELIGIBLE':'WAITING_RECOGNITION',entriesMinted:confirmed?'2':'0',...(confirmed?{creditedAt:{blockNumber:20}}:{})}],total:1},rewards:{items:[],total:0}})}));
 await choose(page);await page.getByText('Waiting for purchase verification',{exact:false}).waitFor();await count(page,'0');
 confirmed=true;await page.locator('#refresh').click();await count(page,'2');
 await page.getByText('Verified at block 20.',{exact:false}).waitFor();assert.match(await page.locator('#purchase-status').innerText(),/0xaaaaaaaaaa/);
});
test('multiple providers, deduplication, account selection and provider cleanup',async t=>{
 const {page}=await setup(t);assert.equal(await page.evaluate(()=>calls.length),0);await page.locator('header .connect').click();
 await page.evaluate(()=>{ws.Alpha.announce();ws.Beta.announce();});assert.equal(await page.locator('#wallet-options button').count(),2);
 await page.getByRole('button',{name:'Alpha',exact:true}).click();await count(page,'1');await page.locator('header .connect').click();
 await page.getByRole('button',{name:B,exact:true}).click();await count(page,'2');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'Change wallet',exact:true}).click();await page.getByRole('button',{name:'Beta',exact:true}).click();await count(page,'3');
 assert.equal(await page.evaluate(()=>[...ws.Alpha.events.values()].reduce((n,s)=>n+s.size,0)),0);
 await page.evaluate(()=>ws.Alpha.emit('accountsChanged',[]));await count(page,'3');
 assert.deepEqual(await page.evaluate(()=>[...new Set(calls.map(c=>c.method))]),['eth_requestAccounts','eth_chainId']);
});
test('reload silently restores the selected account; disconnect prevents restoration',async t=>{
 const {page}=await setup(t);await choose(page);await count(page,'1');await page.locator('header .connect').click();await page.getByRole('button',{name:B,exact:true}).click();await count(page,'2');await page.reload();await count(page,'2');
 assert.deepEqual(await page.evaluate(()=>calls.map(c=>c.method)),['eth_accounts','eth_chainId']);assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);
 await page.locator('#disconnect').click();await page.reload();await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>calls.length),0);assert.equal(await page.locator('#disconnect').isVisible(),false);
});
test('revoked permission does not trigger an interactive reconnect',async t=>{
 const {page}=await setup(t);await choose(page);await count(page,'1');await page.addInitScript(()=>{ws.Alpha.granted=false;});await page.reload();await page.waitForFunction(()=>calls.some(c=>c.method==='eth_accounts'));await page.waitForFunction(()=>sessionStorage.getItem('qianqi.wallet.v1')===null);
 assert.equal(await page.locator('#disconnect').isVisible(),false);assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);assert.equal(await page.evaluate(()=>calls.some(c=>c.method==='eth_requestAccounts')),false);
});
test('network switch and account management only occur after an explicit click',async t=>{
 const {page,requests}=await setup(t);await page.evaluate(()=>ws.Alpha.chain='0x1');await choose(page);assert.equal(requests.length,0);await page.locator('header .connect').click();await page.getByRole('button',{name:'Switch to Robinhood Chain',exact:true}).click();await count(page,'1');
 await page.getByRole('button',{name:'Manage accounts in wallet',exact:true}).click();await page.waitForFunction(()=>calls.some(c=>c.method==='wallet_requestPermissions'));
 assert.deepEqual(await page.evaluate(()=>calls.find(c=>c.method==='wallet_requestPermissions').params),[{eth_accounts:{}}]);
 await page.waitForFunction(()=>!document.querySelector('header .connect').disabled);await page.evaluate(()=>{ws.Alpha.list=['0x'+'2'.repeat(40)];ws.Alpha.emit('accountsChanged',ws.Alpha.list);});await count(page,'2');
 await page.evaluate(()=>ws.Alpha.emit('accountsChanged',[]));assert.equal(await page.locator('#short-count').textContent(),'—');assert.equal(await page.locator('#disconnect').isVisible(),false);
});
test('pending and unsupported requests provide actionable errors without losing connection',async t=>{
 const {page}=await setup(t);await page.evaluate(()=>ws.Alpha.error=-32002);await page.locator('header .connect').click();await page.getByRole('button',{name:'Alpha',exact:true}).click();await page.waitForFunction(()=>document.getElementById('dialog-copy').textContent.includes('already open'));await page.keyboard.press('Escape');
 await page.evaluate(()=>ws.Alpha.error=null);await choose(page);await count(page,'1');await page.locator('header .connect').click();await page.evaluate(()=>ws.Alpha.error=4200);await page.getByRole('button',{name:'Manage accounts in wallet',exact:true}).click();await page.waitForFunction(()=>document.getElementById('dialog-copy').textContent.includes('does not support'));assert.equal(await page.locator('#disconnect').isVisible(),true);
});
test('disconnect invalidates an outstanding connection and ignores its late answer',async t=>{
 const {page}=await setup(t);await page.evaluate(()=>ws.Alpha.hold=true);await page.locator('header .connect').click();await page.getByRole('button',{name:'Alpha',exact:true}).click();await page.waitForFunction(()=>typeof ws.Alpha.resolve==='function');await page.locator('#disconnect').click();await page.evaluate(()=>ws.Alpha.resolve(ws.Alpha.list));await page.waitForTimeout(50);assert.equal(await page.locator('#disconnect').isVisible(),false);assert.equal(await page.locator('#short-count').textContent(),'—');assert.equal(await page.evaluate(()=>sessionStorage.getItem('qianqi.wallet.v1')),null);
});
test('account event during a pending connection wins over the stale response',async t=>{
 const {page}=await setup(t);await page.evaluate(()=>ws.Alpha.hold=true);await page.locator('header .connect').click();await page.getByRole('button',{name:'Alpha',exact:true}).click();await page.waitForFunction(()=>typeof ws.Alpha.resolve==='function');await page.evaluate(()=>{ws.Alpha.emit('accountsChanged',['0x'+'2'.repeat(40)]);ws.Alpha.resolve(['0x'+'1'.repeat(40)]);});await count(page,'2');
});
test('discovery remains live while the wallet chooser is open',async t=>{
 const {page}=await setup(t);await page.locator('header .connect').click();await page.evaluate(()=>{const provider={request:async()=>[]};dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'late',name:'<img src=x onerror=alert(1)>',rdns:'org.example.late'},provider}}));});assert.equal(await page.locator('#wallet-options button').count(),3);assert.equal(await page.locator('#wallet-options img').count(),0);assert.match(await page.locator('#wallet-options').textContent(),/<img/);
});
test('an obsolete API reply cannot replace the newly selected account',async t=>{
 const {page}=await setup(t);await choose(page);await count(page,'1');
 let release,started;const pending=new Promise(r=>started=r);const gate=new Promise(r=>release=r);
 await page.route('**/v1/wallets/'+A+'?*',async r=>{started();await gate;await r.fulfill({status:503,body:'{}'}).catch(()=>{});});
 await page.locator('#refresh').click();await pending;await page.locator('header .connect').click();await page.getByRole('button',{name:B,exact:true}).click();await count(page,'2');release();await page.waitForTimeout(50);assert.equal(await page.locator('#short-count').textContent(),'2');
});
test('a timed-out request releases the UI and its late answer cannot reconnect',async t=>{
 const {page}=await setup(t);await page.clock.install();await page.evaluate(()=>ws.Alpha.hold=true);await page.locator('header .connect').click();await page.getByRole('button',{name:'Alpha',exact:true}).click();await page.waitForFunction(()=>typeof ws.Alpha.resolve==='function');await page.clock.fastForward(21000);await page.waitForFunction(()=>document.getElementById('dialog-copy').textContent.includes('has not responded'));
 assert.equal(await page.locator('header .connect').isDisabled(),false);await page.evaluate(()=>ws.Alpha.resolve(ws.Alpha.list));assert.equal(await page.locator('#disconnect').isVisible(),false);
});
test('revoked access during account management clears previously visible data',async t=>{
 const {page}=await setup(t);await choose(page);await count(page,'1');await page.locator('header .connect').click();await page.evaluate(()=>ws.Alpha.error=4100);await page.getByRole('button',{name:'Manage accounts in wallet',exact:true}).click();await page.waitForFunction(()=>document.getElementById('dialog-copy').textContent.includes('no longer has account access'));
 assert.equal(await page.locator('#short-count').textContent(),'—');assert.equal(await page.locator('#disconnect').isVisible(),false);
});
test('ambiguous wallet identity is not silently restored',async t=>{
 const {page}=await setup(t);await choose(page);await count(page,'1');await page.addInitScript(()=>{addEventListener('eip6963:requestProvider',()=>dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'duplicate',name:'Alpha',rdns:'org.example.alpha'},provider:ws.Beta.provider}})));});
 // Beta is already known, so use a distinct provider object to simulate an ambiguous label.
 await page.addInitScript(()=>{addEventListener('eip6963:requestProvider',()=>dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'other',name:'Alpha',rdns:'org.example.alpha'},provider:{request:async()=>{throw Error('Must not be selected');}}}})));});
 await page.reload();await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>calls.length),0);assert.equal(await page.locator('#disconnect').isVisible(),false);
});

 test('silent restore never substitutes another permitted address',async t=>{
 const {page,requests}=await setup(t);await choose(page);await count(page,'1');
 await page.addInitScript(()=>{ws.Alpha.list=['0x'+'2'.repeat(40)];});requests.length=0;await page.reload();
 await page.waitForFunction(()=>calls.some(c=>c.method==='eth_accounts'));
 await page.waitForFunction(()=>sessionStorage.getItem('qianqi.wallet.v1')===null);
 assert.deepEqual(requests,[]);assert.equal(await page.locator('#disconnect').isVisible(),false);
 await choose(page);await count(page,'2');
 });
