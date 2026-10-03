// Browser verification through the actual snapshot worker API and static-site proxy.
// No page.route(), synthetic API responses, signatures or chain writes.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const {createServer}=require('./user-status-api.cjs'),{createSite}=require('./serve-site.cjs');
const listen=s=>new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});
const close=async s=>{s.closeAllConnections();await new Promise(r=>s.close(r));};
async function verify({config,wallet,expected,stage='settled',artifactPrefix}){
 wallet=wallet.toLowerCase();const before=fs.readFileSync(config.indexer.statePath),api=createServer(config);await listen(api);
 const site=createSite({apiOrigin:`http://127.0.0.1:${api.address().port}`});let browser,apiClosed=false;
 try{await listen(site);browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1080},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(wallet=>{window.readCalls=[];window.ethereum={on:()=>{},removeListener:()=>{},request:async({method})=>{window.readCalls.push(method);if(['eth_accounts','eth_requestAccounts'].includes(method))return [wallet];if(method==='eth_chainId')return '0x1237';throw Error('Unexpected wallet request: '+method);}};},wallet);
  const url=`http://127.0.0.1:${site.address().port}`,response=await fetch(`${url}/v1/wallets/${wallet}?limit=25`);assert.equal(response.status,200);const data=await response.json();assert.equal(data.status,'observed','Fresh cycle must have fresh API data');
  for(const k of ['SHORT','MONTHLY'])for(const field of ['open','mintedTotal','consumedTotal'])assert.equal(data.balances[k][field],expected[k][field],`${stage}: ${k}.${field}`);
  assert(data.purchases.total>0);if(stage==='settled'){assert(data.rewards.total>0);assert(data.rewards.items.every(r=>r.status==='paid'));}
  await page.goto(url+'/concepts/hk/');await page.locator('header .connect').click();await page.waitForFunction(()=>document.getElementById('provenance').textContent.startsWith('As of block'));
  for(const [k,id]of [['SHORT','short-count'],['MONTHLY','monthly-count']])assert.equal(await page.locator('#'+id).textContent(),BigInt(expected[k].open).toLocaleString('en-US'));
  assert.match(await page.locator('#purchase-status').textContent(),/Counted toward tickets/);
  assert.equal(await page.locator('#rewards-body .status-paid').count(),data.rewards.items.filter(r=>r.status==='paid').length);
  assert.equal(await page.getByRole('button',{name:'Claim / check payment'}).count(),0,'Cycle pays automatically; browser must not suggest a duplicate claim');
  for(const width of [1440,390]){await page.setViewportSize({width,height:1080});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);if(artifactPrefix)await page.screenshot({path:`${artifactPrefix}-${width}.png`,fullPage:true});}
  const calls=await page.evaluate(()=>window.readCalls);assert(calls.every(m=>['eth_requestAccounts','eth_accounts','eth_chainId'].includes(m)));
  // Exercise a real HTTP outage, then restore a fresh worker on the same port.
  const port=api.address().port;await close(api);apiClosed=true;await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('wallet-status').textContent.includes('Data unavailable'));assert.equal(await page.locator('#short-count').textContent(),'—');assert.equal(await page.locator('#purchase-status').count(),0);
  const restarted=createServer(config);await new Promise((resolve,reject)=>{restarted.once('error',reject);restarted.listen(port,'127.0.0.1',resolve);});
  try{await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('provenance').textContent.startsWith('As of block'));assert.equal(await page.locator('#short-count').textContent(),BigInt(expected.SHORT.open).toLocaleString('en-US'));}finally{await close(restarted);}
  assert.deepEqual(errors,[]);assert.deepEqual(fs.readFileSync(config.indexer.statePath),before);
  return {status:'PONS_WALLET_BROWSER_PASSED',stage,head:data.provenance.head,balances:data.balances,purchases:data.purchases.total,rewards:data.rewards.total,paid:data.rewards.items.filter(r=>r.status==='paid').length,outageRecovery:true,snapshotUnchanged:true,limits:['Browser wallet discovery is injected; installed MetaMask is a separate manual result','No browser transaction; cycle uses automatic payouts','Current bounded direct-route fork profile, not every admitted wrapper']};
 }finally{await browser?.close();await close(site);if(!apiClosed)await close(api);}
}
module.exports={verify};
