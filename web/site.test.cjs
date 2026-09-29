const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const {createSite}=require('../scripts/serve-site.cjs');
const wallet='0x'+'1'.repeat(40);
async function open(t){const server=createSite();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));});const page=await browser.newPage({viewport:{width:1440,height:1080},reducedMotion:'reduce'});return {page,url:`http://127.0.0.1:${server.address().port}`};}
async function inject(page,{chain='0x1237',reject=false}={}){await page.addInitScript(({wallet,chain,reject})=>{window.walletEvents={};window.ethereum={request:async({method})=>{if(reject)throw {code:4001};if(method==='eth_requestAccounts')return [wallet];if(method==='eth_chainId')return chain;throw Error('Unexpected wallet operation');},on:(name,fn)=>{window.walletEvents[name]=fn;},removeListener:name=>{delete window.walletEvents[name];}};},{wallet,chain,reject});}
test('desktop/mobile layout, rules, honest pre-launch and no-wallet dialog',async t=>{
 const {page,url}=await open(t);await page.goto(url);assert.match(await page.title(),/QIANQI/);
 await page.locator('#buy').click();assert.match(await page.locator('#dialog-copy').textContent(),/no official buying link/);await page.keyboard.press('Escape');
 await page.locator('header .connect').click();assert.match(await page.locator('#dialog-title').textContent(),/Bring your wallet/);await page.keyboard.press('Escape');
 await page.locator('summary').first().click();assert.equal(await page.locator('details').first().getAttribute('open'),'');
 for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);}
});
test('wallet reads real API schema, marks stale and clears data on failure/account change',async t=>{
 const {page,url}=await open(t);await inject(page);let fail=false;
 await page.route('**/v1/wallets/**',r=>r.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{error:'unavailable'}:{schema:'promo-wallet-status-v1',status:'stale',wallet,provenance:{chainId:'4663',head:{number:100},observedAt:'2026-09-29T00:00:00Z'},balances:{SHORT:{open:'2'},MONTHLY:{open:'5'},carryRaw:'20000000',entryThresholdRaw:'100000000',quoteDecimals:6},rewards:{items:[],total:0}})}));
 await page.goto(url);await page.locator('header .connect').click();await page.waitForFunction(()=>document.getElementById('short-count').textContent==='2');assert.match(await page.locator('#wallet-status').textContent(),/Updates delayed/);assert.match(await page.locator('#carry').textContent(),/80 USDG/);
 fail=true;await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('wallet-status').textContent.includes('Data unavailable'));assert.equal(await page.locator('#short-count').textContent(),'—');
 await page.evaluate(()=>window.walletEvents.accountsChanged([]));assert.equal(await page.locator('#disconnect').isVisible(),false);
});
test('wrong chain and rejected connection never present wallet balances',async t=>{
 const first=await open(t);await inject(first.page,{chain:'0x1'});let requests=0;await first.page.route('**/v1/**',r=>{requests++;return r.abort();});await first.page.goto(first.url);await first.page.locator('header .connect').click();await first.page.waitForFunction(()=>document.getElementById('wallet-status').textContent.includes('Wrong network'));assert.equal(requests,0);
 const second=await open(t);await inject(second.page,{reject:true});await second.page.goto(second.url);await second.page.locator('header .connect').click();await second.page.waitForFunction(()=>document.getElementById('dialog').open);assert.match(await second.page.locator('#dialog-copy').textContent(),/declined/);assert.equal(await second.page.locator('#short-count').textContent(),'—');
});
