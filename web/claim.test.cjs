const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers:E}=require('ethers');
const {chromium}=require('@playwright/test');
const {compile}=require('../scripts/compile.cjs');
const {fixture,rpc,sent}=require('../test/fixtures/dual-controller.cjs');
const {drawIdFor}=require('../scripts/draw-id.cjs');
const Claim=require('../web/claim.js');
const {createSite}=require('../scripts/serve-site.cjs');
async function setup(){
 const f=await fixture(compile()),winner=(await f.other.getAddress()).toLowerCase(),drawId=drawIdFor('SHORT',E.id('site claim'));
 await f.attack(f.short,'reserveUSDG',[drawId,1,0,100]);await f.attack(f.short,'finalize',[drawId,[winner],[70]]);
 const head=await rpc('eth_getBlockByNumber',['latest',false]);
 const deployment={schema:'qianqi-site-actions-v1',mode:'local-test',chainId:31337,vault:f.vault.target,asset:f.quote.target,decimals:18,vaultCodeHash:E.keccak256(await rpc('eth_getCode',[f.vault.target,'latest'])),assetCodeHash:E.keccak256(await rpc('eth_getCode',[f.quote.target,'latest'])),anchor:{number:Number(BigInt(head.number)),hash:head.hash}};
 const reward={drawId,winner,asset:f.quote.target.toLowerCase(),amountRaw:'70',status:'assigned'};
 const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
 let mode='',sends=0,current=true;
 const provider={request:async({method,params})=>{if(method==='eth_sendTransaction'){sends++;if(mode==='reject')throw {code:4001};if(mode==='unknown')throw Error('lost response');}if(method==='eth_accounts')return [winner];return rpc(method,params);}};
 const engine=Claim.create({deployment,provider,storage,lock:async(k,fn)=>fn(),current:()=>current});
 return {f,winner,reward,deployment,storage,provider,engine,get sends(){return sends;},mode:v=>mode=v,current:v=>current=v};
}
test('real vault claim: reject, unknown outcome, restart suppression, wrong chain/code, automatic payout race and successful payment',async()=>{
 const x=await setup();assert.equal((await x.engine.prepare(x.reward)).amount,'0.00000000000000007');
 x.current(false);await assert.rejects(()=>x.engine.send(x.reward),/changed/);assert.equal(x.sends,0);x.current(true);
 const bad=Claim.create({deployment:{...x.deployment,anchor:{...x.deployment.anchor,hash:E.ZeroHash}},provider:x.provider,storage:x.storage,lock:async(k,fn)=>fn()});await assert.rejects(()=>bad.prepare(x.reward),/configured test chain/);
 const wrong=Claim.create({deployment:{...x.deployment,vaultCodeHash:E.ZeroHash},provider:x.provider,storage:x.storage});await assert.rejects(()=>wrong.prepare(x.reward),/code/);
 x.mode('reject');await assert.rejects(()=>x.engine.send(x.reward),/declined/);assert.equal(x.engine.read(x.reward).state,'rejected');
 x.mode('unknown');await assert.rejects(()=>x.engine.send(x.reward),/unknown/);const count=x.sends;
 const restored=Claim.create({deployment:x.deployment,provider:x.provider,storage:x.storage,lock:async(k,fn)=>fn()});await assert.rejects(()=>restored.send(x.reward),/already pending/);assert.equal(x.sends,count);
 const y=await setup();await y.engine.send(y.reward);assert.equal(y.sends,1);await assert.rejects(()=>y.engine.send(y.reward),/already pending/);
 assert.equal((await y.engine.check(y.reward)).state,'confirmed');assert.equal(await y.f.quote.balanceOf(y.winner),70n);
 const z=await setup();await z.engine.prepare(z.reward);await sent(z.f.vault.claim(z.reward.drawId,z.winner));await assert.rejects(()=>z.engine.send(z.reward),/No unpaid/);assert.equal(z.sends,0);
});
test('HK browser, non-MetaMask EIP-6963 provider: review -> real claim -> receipt, reload and stale-data controls',async t=>{
 const x=await setup(),server=createSite({actions:{...x.deployment,publishedMarketToken:x.f.token.target}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
 const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('testWalletRequest',async({method,params})=>method==='eth_requestAccounts'?[x.winner]:x.provider.request({method,params}));
 await page.addInitScript(()=>{const listeners=new Map();const provider={request:arg=>window.testWalletRequest(arg),on:(n,fn)=>listeners.set(n,fn),removeListener:n=>listeners.delete(n)};addEventListener('eip6963:requestProvider',()=>dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'test-other',name:'Other wallet',rdns:'test.other'},provider}})));});
 let stale=false;
 await page.route('**/v1/wallets/**',r=>r.fulfill({json:{schema:'promo-wallet-status-v1',status:stale?'stale':'observed',wallet:x.winner,provenance:{chainId:31337,head:{number:100}},balances:{SHORT:{open:'1'},MONTHLY:{open:'1'},carryRaw:'1',entryThresholdRaw:'100',quoteDecimals:0},asset:{address:x.deployment.asset.toLowerCase(),decimals:18},rewards:{vault:x.deployment.vault,items:[x.reward],total:1},purchases:{items:[{transactionHash:E.id('eligible'),status:'ELIGIBLE',entriesMinted:'1'},{transactionHash:E.id('unsupported'),status:'UNSUPPORTED_ROUTE',reason:'UNSUPPORTED_TEST_ROUTE'}],total:2}}}));
 await page.goto(`http://127.0.0.1:${server.address().port}/concepts/hk/`);
 await page.evaluate(()=>{window.open=(...args)=>{window.opened=args;};});await page.waitForFunction(()=>document.querySelector('#account > [role="status"]'));
 await page.locator('#buy').click();await page.getByRole('button',{name:'Open Pons',exact:true}).click();assert.equal(await page.evaluate(()=>opened[0]),'https://www.ponsfamily.com/launchpad/'+x.f.token.target);
 await page.locator('header .connect').click();
 const claim=page.getByRole('button',{name:'Claim / check payment'});await claim.click();await page.getByRole('button',{name:'Confirm claim in wallet'}).click();await page.waitForFunction(()=>document.getElementById('dialog-title').textContent==='Claim submitted');
 await page.keyboard.press('Escape');await claim.click();await page.waitForFunction(()=>document.getElementById('dialog-copy').textContent.includes('Payment confirmed'));assert.equal(x.sends,1);
 await page.reload();await claim.click();await page.waitForFunction(()=>document.getElementById('dialog-copy').textContent.includes('Payment confirmed'));assert.equal(x.sends,1);
 await page.keyboard.press('Escape');stale=true;await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('wallet-status').textContent.includes('Updates delayed'));assert.equal(await claim.count(),0);
 assert.match(await page.locator('#purchase-status').textContent(),/Counted toward tickets/);assert.match(await page.locator('#purchase-status').textContent(),/not supported yet/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await page.locator('#disconnect').click();assert.equal(await page.locator('#purchase-status').count(),0);
});

test('unresponsive read releases preflight without sending or writing a journal',async()=>{
 const deployment={schema:'qianqi-site-actions-v1',mode:'local-test',chainId:31337,vault:'0x'+'1'.repeat(40),asset:'0x'+'2'.repeat(40),decimals:6,vaultCodeHash:E.ZeroHash,assetCodeHash:E.ZeroHash,anchor:{number:0,hash:E.ZeroHash}};
 const calls=[],engine=Claim.create({deployment,readTimeoutMs:10,provider:{request:({method})=>{calls.push(method);return new Promise(()=>{});}},storage:{getItem:()=>null,setItem:()=>assert.fail('must not write')}});
 await assert.rejects(()=>engine.prepare({winner:deployment.vault,drawId:E.id('timeout'),asset:deployment.asset,amountRaw:'1'}),/timed out/);assert.deepEqual(calls,['eth_chainId']);
});

test('late wallet response survives account changes; pending and mismatched receipts cannot trigger a second send',async()=>{
 const x=await setup();let release,entered,phase='hold';const ready=new Promise(r=>entered=r);
 const provider={request:async request=>{
  if(request.method==='eth_sendTransaction'){entered();await new Promise(r=>release=r);}
  if(request.method==='eth_getTransactionReceipt'&&phase==='pending')return null;
  const result=await x.provider.request(request);
  if(request.method==='eth_getTransactionReceipt'&&phase==='mismatch')return {...result,blockHash:E.ZeroHash};
  return result;
 }};
 let selected=true;const engine=Claim.create({deployment:x.deployment,provider,storage:x.storage,current:()=>selected,lock:async(k,fn)=>fn()});
 const sending=engine.send(x.reward);await ready;assert.equal(engine.read(x.reward).state,'submitting');
 await assert.rejects(()=>engine.send(x.reward),/already pending/);selected=false;release();await sending;
 assert.equal(engine.read(x.reward).state,'pending');selected=true;phase='pending';assert.equal((await engine.check(x.reward)).state,'pending');
 phase='mismatch';await assert.rejects(()=>engine.check(x.reward),/does not match/);await assert.rejects(()=>engine.send(x.reward),/already pending/);
 phase='done';assert.equal((await engine.check(x.reward)).state,'confirmed');assert.equal(x.sends,1);
 assert.throws(()=>Claim.config({...x.deployment,chainId:4663}),/not configured/);
 const denied=Claim.create({deployment:x.deployment,provider:x.provider,storage:{getItem:()=>null,setItem:()=>{throw Error('storage denied');}},lock:async(k,fn)=>fn()});
 // A fresh unpaid draw is needed to reach the persistence boundary.
 const id=drawIdFor('SHORT',E.id('storage denied'));await x.f.attack(x.f.short,'reserveUSDG',[id,2,0,100]);await x.f.attack(x.f.short,'finalize',[id,[x.winner],[70]]);
 await assert.rejects(()=>denied.send({...x.reward,drawId:id}),/storage denied/);assert.equal(x.sends,1);
});
