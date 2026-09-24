const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const hre=require('hardhat');
const {compile}=require('../scripts/compile.cjs');
const compiled=compile();
let provider,alice,bob;
async function deploy(name,args=[]) {
  const a=compiled[name];
  const c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,alice).deploy(...args);
  await c.waitForDeployment();return c;
}
before(async()=>{
  await hre.network.provider.send('hardhat_reset');
  provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
  [alice,bob]=await Promise.all([0,1].map(i=>provider.getSigner(i)));
});

test('opt-in records the caller in a public event and leaves other wallets unregistered',async()=>{
  const registry=await deploy('ParticipantRegistry');
  const who=await bob.getAddress();
  assert.equal(await registry.registered(who),false);
  const receipt=await (await registry.connect(bob).register()).wait();
  const event=registry.interface.parseLog(receipt.logs[0]);
  assert.equal(event.name,'Registered');
  assert.equal(event.args.participant,who);
  assert.equal(receipt.logs.length,1);
  assert.equal(await registry.registered(who),true);
  assert.equal(await registry.registered(await alice.getAddress()),false);
  assert.equal(await registry.registered(ethers.ZeroAddress),false);
});

test('repeat opt-in reverts without changing the first registration or emitting another event',async()=>{
  const registry=await deploy('ParticipantRegistry');
  const receipt=await (await registry.register()).wait();
  await assert.rejects(registry.register.staticCall(),e=>
    e.code==='CALL_EXCEPTION' && e.data===ethers.id('AlreadyRegistered()').slice(0,10));
  const events=await registry.queryFilter(registry.filters.Registered());
  assert.equal(events.length,1);
  assert.equal(events[0].transactionHash,receipt.hash);
  assert.equal(await registry.registered(await alice.getAddress()),true);
});

test('history can be independently reconstructed from canonical logs, not current membership',async()=>{
  const registry=await deploy('ParticipantRegistry');
  const first=await (await registry.register()).wait();
  const second=await (await registry.connect(bob).register()).wait();
  const historical=await registry.queryFilter(registry.filters.Registered(),0,first.blockNumber);
  assert.equal(historical.length,1);
  assert.equal(historical[0].args.participant,await alice.getAddress());
  assert.equal(await registry.registered(await bob.getAddress(),{blockTag:first.blockNumber}),false);
  const all=await registry.queryFilter(registry.filters.Registered(),0,second.blockNumber);
  assert.deepEqual(all.map(e=>e.args.participant),[await alice.getAddress(),await bob.getAddress()]);
});

test('smart wallet registers itself; event order distinguishes before/after in one transaction',async()=>{
  const registry=await deploy('ParticipantRegistry');
  const wallet=await deploy('RegistrationWalletFixture');
  const receipt=await (await wallet.registerBetweenMarkers(registry.target)).wait();
  assert.equal(receipt.logs.length,3);
  const [before,registration,after]=receipt.logs;
  assert.equal(wallet.interface.parseLog(before).args.sequence,1n);
  assert.equal(registration.address.toLowerCase(),registry.target.toLowerCase());
  assert.equal(registry.interface.parseLog(registration).args.participant,wallet.target);
  assert.equal(wallet.interface.parseLog(after).args.sequence,2n);
  assert.ok(before.index<registration.index && registration.index<after.index);
  assert.equal(await registry.registered(wallet.target),true);
  assert.equal(await registry.registered(await alice.getAddress()),false);
});

test('separate instances do not inherit registrations and registry grants no administrative API',async()=>{
  const first=await deploy('ParticipantRegistry'),second=await deploy('ParticipantRegistry');
  await (await first.register()).wait();
  assert.equal(await second.registered(await alice.getAddress()),false);
  const functions=first.interface.fragments.filter(f=>f.type==='function').map(f=>f.format('sighash')).sort();
  assert.deepEqual(functions,['register()','registered(address)']);
});

test('canonical reorg rollback removes orphaned registration and allows a new opt-in',async()=>{
  const registry=await deploy('ParticipantRegistry');
  const snapshot=await hre.network.provider.send('evm_snapshot');
  await (await registry.register()).wait();
  assert.equal(await registry.registered(await alice.getAddress()),true);
  assert.equal(await hre.network.provider.send('evm_revert',[snapshot]),true);
  assert.equal(await registry.registered(await alice.getAddress()),false);
  assert.equal((await registry.queryFilter(registry.filters.Registered())).length,0);
  await (await registry.register()).wait();
  assert.equal((await registry.queryFilter(registry.filters.Registered())).length,1);
});

test('real BUY policy source enforces authority, commitments and completeness; publication runs exact dry-run bytes',async()=>{
 const {hash}=require('../scripts/direct-buy.cjs');const {loadBuyPolicy,ABI}=require('../scripts/buy-policy-admission.cjs');
 const {prepareBuyPolicy,publishBuyPolicy}=require('../scripts/publish-buy-policy.cjs');
 const raw=(m,p)=>hre.network.provider.send(m,p);
 const manifest=structuredClone(require('../research/direct-buy/evidence.json').manifest);
 const anchor=await raw('eth_getBlockByNumber',['latest',false]);manifest.anchor={number:anchor.number,hash:anchor.hash};
 const source=await deploy('BuyPolicySource',[ethers.id('policy instance'),hash(manifest),await alice.getAddress(),2]);
 const trust={chainId:31337,instanceId:await source.instanceId(),source:source.target,publisher:await alice.getAddress(),genesisHash:hash(manifest),noticeBlocks:2,sourceCodeHash:ethers.keccak256(await provider.getCode(source.target))};
 assert.equal((await loadBuyPolicy({trust,genesis:manifest,rpc:raw})).history.versions.length,1);
 const fromBlock=Number(BigInt(await raw('eth_blockNumber',[])))+8;
 const next={...structuredClone(manifest),schema:'direct-buy-v2',routeVersion:'scheduled-routes-v1',routes:[{id:manifest.routeVersion,fromBlock:0},{id:'rh-ur-10-060c0f-v1',fromBlock}]};
 const prepared=await prepareBuyPolicy({trust,genesis:manifest,next,rpc:raw});
 assert.equal(await source.publishedCount(),0n);
 await assert.rejects(source.connect(bob).announce.staticCall(hash(manifest),hash(next),fromBlock,require('../scripts/direct-buy.cjs').canonical(next)));
 await assert.rejects(source.announce.staticCall(hash(manifest),hash(next),fromBlock,'{}'));
 await assert.rejects(source.announce.staticCall(ethers.id('bad'),hash(next),fromBlock,require('../scripts/direct-buy.cjs').canonical(next)));
 const journal=[];const tx=await publishBuyPolicy({trust,genesis:manifest,next,rpc:raw,signer:alice,persist:async row=>journal.push(structuredClone(row))});
 const receipt=await tx.wait();assert.deepEqual(journal.map(x=>x.status),['prepared','broadcast']);
 assert.equal(tx.data,prepared.request.data);assert.equal(await source.publishedCount(),1n);assert.equal(await source.currentHash(),hash(next));
 const loaded=await loadBuyPolicy({trust,genesis:manifest,rpc:raw});assert.equal(loaded.history.versions[1].manifest.routeVersion,'scheduled-routes-v1');
 assert.equal(loaded.evidence[0].transactionHash,tx.hash);
 await assert.rejects(loadBuyPolicy({trust,genesis:manifest,rpc:async(m,p)=>m==='eth_getLogs'?[]:raw(m,p)}),/Incomplete policy history/);
 await assert.rejects(source.announce.staticCall(hash(manifest),hash(next),fromBlock,require('../scripts/direct-buy.cjs').canonical(next)));
 console.log('BUY policy publication gasUsed='+receipt.gasUsed+' manifestBytes='+Buffer.byteLength(require('../scripts/direct-buy.cjs').canonical(next)));
});

test('policy source accepts a contract publisher; loader does not confuse outer sender with authority',async()=>{
 const {hash,canonical}=require('../scripts/direct-buy.cjs'),{loadBuyPolicy}=require('../scripts/buy-policy-admission.cjs');
 const {prepareBuyPolicy}=require('../scripts/publish-buy-policy.cjs');const raw=(m,p)=>hre.network.provider.send(m,p);
 const manifest=structuredClone(require('../research/direct-buy/evidence.json').manifest),anchor=await raw('eth_getBlockByNumber',['latest',false]);manifest.anchor={number:anchor.number,hash:anchor.hash};
 const wallet=await deploy('PolicyWalletFixture');
 const source=await deploy('BuyPolicySource',[ethers.id('wallet instance'),hash(manifest),wallet.target,2]);
 const trust={chainId:31337,instanceId:await source.instanceId(),source:source.target,publisher:wallet.target,genesisHash:hash(manifest),noticeBlocks:2,sourceCodeHash:ethers.keccak256(await provider.getCode(source.target))};
 const fromBlock=Number(BigInt(await raw('eth_blockNumber',[])))+8;
 const next={...structuredClone(manifest),schema:'direct-buy-v2',routeVersion:'scheduled-routes-v1',routes:[{id:manifest.routeVersion,fromBlock:0},{id:'rh-ur-10-060c0f-v1',fromBlock}]};
 const bad=structuredClone(next);bad.routes[1].id='unknown';await assert.rejects(prepareBuyPolicy({trust,genesis:manifest,next:bad,rpc:raw}));assert.equal(await source.publishedCount(),0n);
 const ready=await prepareBuyPolicy({trust,genesis:manifest,next,rpc:raw});
 await assert.rejects(source.announce.staticCall(hash(manifest),hash(next),fromBlock,canonical(next)));
 await (await wallet.execute(source.target,ready.request.data)).wait();
 assert.equal((await loadBuyPolicy({trust,genesis:manifest,rpc:raw})).history.versions.length,2);
});
