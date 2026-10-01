const {test}=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('@playwright/test');
const {createSite}=require('../scripts/serve-site.cjs');
async function open(t,enabled=true){
 const server=createSite({purchaseDemo:enabled});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true});t.after(async()=>{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.realWalletCalls=0;window.ethereum={request(){window.realWalletCalls++;throw Error('Real wallet must not be used');}};});
 const url=`http://127.0.0.1:${server.address().port}/purchase-demo/`;return {page,url,errors};
}
const status=(page,text)=>page.waitForFunction(text=>document.getElementById('status').textContent.includes(text),text);
async function step(page){await page.locator('#review').click();await status(page,'Review these details');await page.locator('#confirm').click();await status(page,'Transaction pending');await page.locator('#check').click();}
test('demo route disabled by default',async t=>{const {page,url}=await open(t,false);assert.equal((await page.goto(url)).status(),404);});
test('three separate approvals/buy reviews, responsive layout and no injected wallet calls',async t=>{
 const {page,url,errors}=await open(t);await page.goto(url);
 for(let i=0;i<2;i++){await step(page);await status(page,'Approval confirmed');}
 await step(page);await status(page,'Demo purchase confirmed');
 assert.equal(await page.evaluate(()=>window.realWalletCalls),0);
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.screenshot({path:'.local/logs/purchase-demo-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
});
test('rejection and stale review on account/network change',async t=>{
 const {page,url}=await open(t);await page.goto(url);await page.locator('#review').click();await status(page,'Review these details');await page.locator('#switch-account').click();assert(await page.locator('#confirm').isDisabled());
 await page.locator('#switch-chain').click();await page.locator('#review').click();await status(page,'Switch to Robinhood');
 await page.locator('#switch-chain').click();await page.locator('#outcome').selectOption('reject');await page.locator('#review').click();await status(page,'Review these details');await page.locator('#confirm').click();await status(page,'declined');assert.equal(await page.locator('#review').isDisabled(),false);
});
test('pending survives reload and account change; receipt confirmation never auto-sends next step',async t=>{
 const {page,url}=await open(t);await page.goto(url);await page.locator('#amount').fill('60.125');await page.locator('#outcome').selectOption('pending');await page.locator('#review').click();await status(page,'Review these details');await page.locator('#confirm').click();await status(page,'Transaction pending');const hash=await page.locator('#hash').textContent();
 await page.reload();assert(await page.locator('#review').isDisabled());assert.equal(await page.locator('#amount').inputValue(),'60.125');assert.equal(await page.locator('#hash').textContent(),hash);await page.locator('#switch-account').click();assert(await page.locator('#review').isDisabled());
 await page.locator('#settle').click();await status(page,'Approval confirmed');assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('qianqi.purchase-demo.fixture.v1')).nonce),1);
});
test('unknown response remains blocked after reload; reverted is not success',async t=>{
 const {page,url}=await open(t);await page.goto(url);await page.locator('#outcome').selectOption('unknown');await page.locator('#review').click();await status(page,'Review these details');await page.locator('#confirm').click();await status(page,'uncertain');await page.reload();assert(await page.locator('#review').isDisabled());
 await page.locator('#reset').click();await page.locator('#outcome').selectOption('reverted');await step(page);await status(page,'reverted');
});
