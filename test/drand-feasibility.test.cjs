const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {ethers}=require('ethers'),hre=require('hardhat');
const {compile,root,roundAtOrAfter}=require('../scripts/drand-feasibility.cjs');
const {info,beacon}=require('../research/drand-feasibility/vector.json');
test('real evmnet signature, malformed proofs, permissionless late delivery and local gas/size',async()=>{
  const {artifact,meta}=compile();await hre.network.provider.send('hardhat_reset');
  const p=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
  const signer=await p.getSigner(),other=await p.getSigner(1);
  const c=await new ethers.ContractFactory(artifact.abi,artifact.evm.bytecode.object,signer).deploy();await c.waitForDeployment();
  assert(meta.runtimeBytes<=24576);assert.equal((await p.getCode(c.target)).length/2-1,meta.runtimeBytes);
  const sig='0x'+beacon.signature,r=BigInt(beacon.round),expected='0x'+beacon.randomness;
  assert.equal(ethers.sha256(sig),expected);assert.equal(info.schemeID,'bls-bn254-unchained-on-g1');
  const key=Array.from(await c.publicKey()),dst=await c.DST();
  const serialized=ethers.concat([key[1],key[0],key[3],key[2]].map(v=>ethers.toBeHex(v,32)));
  assert.equal(serialized,'0x'+info.public_key);
  assert.equal(await c.verify(r,sig),true);
  const recent=require('../research/rng-provider-study/observations.json').drand.latest;
  assert.equal(await c.verify(recent.round,'0x'+recent.signature),true);
  assert.equal(ethers.sha256('0x'+recent.signature),'0x'+recent.randomness);
  const point=await c.messagePoint(r,dst);
  const reference=require('../research/drand-feasibility/reference-vector.json').vector;
  assert.equal(reference.sig,beacon.signature);
  assert.equal(ethers.keccak256(ethers.toBeHex(r,8)),'0x'+reference.message);
  assert.equal(ethers.concat(Array.from(point).map(v=>ethers.toBeHex(v,32))),'0x'+reference.m_expected);
  for(const wrong of [r-1n,r+1n])assert.equal(await c.verify(wrong,sig),false);
  assert.equal(await c.check(r,sig,key,ethers.toUtf8Bytes('wrong DST')),false);
  const wrongKey=[key[1],key[0],key[3],key[2]];
  assert.equal(await c.check(r,sig,wrongKey,dst,{gasLimit:1000000}),false);
  const field=21888242871839275222246405745257275088696311157297823662689037894645226208583n;
  const enc=(x,y)=>ethers.concat([ethers.toBeHex(x,32),ethers.toBeHex(y,32)]);
  for(const bad of [enc(0n,0n),enc(1n,1n),enc(field,2n),enc(1n,field),
    ethers.toBeHex(BigInt(sig)^1n,64)])assert.equal(await c.verify(r,bad),false);
  for(const bad of ['0x',sig.slice(0,-2),sig+'00'])await assert.rejects(c.verify(r,bad));
  await assert.rejects(c.verify(0,sig));
  assert.equal(await c.proven(r),false);
  await assert.rejects(c.prove(r+1n,sig));assert.equal(await c.proven(r+1n),false);
  const gas={verifyEstimate:String(await c.verify.estimateGas(r,sig)),
    invalidRoundEstimate:String(await c.verify.estimateGas(r+1n,sig)),
    invalidPointEstimate:String(await c.verify.estimateGas(r,enc(1n,1n)))};
  // Actual transactions measure verification without writes, then first store and duplicate delivery.
  const tx=await signer.sendTransaction({to:c.target,data:c.interface.encodeFunctionData('verify',[r,sig])});
  gas.verifyTransaction=String((await tx.wait()).gasUsed);
  gas.proveAndStore=String((await(await c.connect(other).prove(r,sig)).wait()).gasUsed);
  assert.equal(await c.randomness(r),expected);assert.equal(await c.proven(r),true);
  await hre.network.provider.send('evm_increaseTime',[30*86400]);await hre.network.provider.send('evm_mine');
  const duplicate=await(await c.prove(r,sig)).wait();gas.duplicate=String(duplicate.gasUsed);
  assert.equal(duplicate.logs.length,0);assert.equal(await c.randomness(r),expected);
  await assert.rejects(c.prove(r,enc(1n,1n)));assert.equal(await c.randomness(r),expected);
  // Same proof in a fresh registry after the extra 30-day delay.
  const late=await new ethers.ContractFactory(artifact.abi,artifact.evm.bytecode.object,other).deploy();await late.waitForDeployment();
  await(await late.prove(r,sig)).wait();assert.equal(await late.randomness(r),expected);
  fs.writeFileSync(root+'/local-result.json',JSON.stringify({schema:'drand-feasibility-local-v1',...meta,
    vectorRound:beacon.round,randomness:expected,gas,calldataBytes:(c.interface.encodeFunctionData('prove',[r,sig]).length-2)/2,
    checks:['real signature and intermediate hash-to-point','round +/-1','wrong key and DST','zero/off-curve/out-of-field/corrupt points',
      'truncated/extra bytes','permissionless prove','duplicate idempotency','invalid proof never stored','late first proof and duplicate after 30 days'],
    limitations:['Local Hardhat Cancun, not Robinhood execution','No audit or production integration','No finality guarantee or frozen draw binding','Gas excludes L2 data fees']},null,2)+'\n');
});
test('one-based future round arithmetic including exact boundaries',()=>{
  const g=1727521075n;
  assert.equal(roundAtOrAfter(g-1n),1n);assert.equal(roundAtOrAfter(g),1n);
  for(let d=0n;d<10000n;d++){
    const r=roundAtOrAfter(g+d),t=g+(r-1n)*3n;
    assert(t>=g+d);if(r>1n)assert(t-3n<g+d);
    // Strictly AFTER an integer-second deadline uses deadline + 1.
    const future=roundAtOrAfter(g+d+1n);assert(g+(future-1n)*3n>g+d);
  }
  assert.throws(()=>roundAtOrAfter(g,g,0n));
});
