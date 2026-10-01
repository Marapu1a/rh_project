const assert=require('node:assert/strict'),{chromium}=require('@playwright/test');
const {createSite}=require('./serve-site.cjs'),{createBridge}=require('./pons-browser-bridge.cjs');
async function open(options){
 const bridge=createBridge(options),server=createSite({purchaseDemo:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const steps=[];let lastPlan;
 await page.exposeBinding('localForkCall',async(_,method,arg)=>{
  assert(['identity','prepare','send','receipt','recover'].includes(method));
  const result=await bridge[method](arg);if(method==='prepare')lastPlan=result;
  if(method==='send')steps.push({view:arg,hash:result});return result;
 });
 await page.addInitScript(()=>{window.qianqiLocalForkAdapter=Object.fromEntries(['identity','prepare','send','receipt','recover'].map(method=>[method,arg=>window.localForkCall(method,arg)]));window.ethereum={request(){throw Error('Injected wallet forbidden');}};});
 const url=`http://127.0.0.1:${server.address().port}/purchase-demo/`;await page.goto(url);
 const ready=()=>page.waitForFunction(()=>!document.getElementById('review').disabled,{},{timeout:120000});
 return {
  async purchase(amount){
   await ready();await page.locator('#amount').fill((BigInt(amount)/1000000n).toString());
   for(let i=0;i<5;i++){
    await page.locator('#review').click();await page.waitForFunction(()=>!document.getElementById('confirm').disabled,{},{timeout:120000});
    const plan=lastPlan;await page.locator('#confirm').click();
    await page.waitForFunction(()=>document.getElementById('check').hidden===false,{},{timeout:120000});
    const submitted=steps.at(-1);assert.equal(submitted.view.id,plan.id);
    // The browser loses even sessionStorage; server journal must restore the hash.
    await page.evaluate(()=>sessionStorage.removeItem('qianqi.purchase-demo.v1'));await page.reload();
    await page.waitForFunction(hash=>document.getElementById('hash').textContent.includes(hash),submitted.hash,{timeout:120000});
    assert(await page.locator('#review').isDisabled());
    await page.locator('#check').click();await ready();
    assert.match(await page.locator('#status').textContent(),/confirmed/);
    const receipt=await options.rpc('eth_getTransactionReceipt',[submitted.hash]);
    // Keep the existing fork replay evidence shape.
    await options.onStep({plan:{...plan,quoteOut:plan.quote,minimumOut:plan.minimum,localOnly:true},hash:submitted.hash,receipt});
    if(plan.kind==='buy')return {hash:submitted.hash,wait:async()=>({...receipt,hash:submitted.hash,status:Number(BigInt(receipt.status))})};
   }
   throw Error('Browser approval sequence did not converge');
  },
  async close(){try{assert.deepEqual(errors,[]);}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}},
  steps
 };
}
module.exports={open};
