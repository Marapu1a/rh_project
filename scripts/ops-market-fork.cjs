// Research only: in-process31337 fork behind a read-only upstream proxy. No public signing.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers'),hre=require('hardhat');
const {startReadProxy}=require('./read-only-fork-rpc.cjs');
const rpc=(m,p=[])=>hre.network.provider.send(m,p),coder=ethers.AbiCoder.defaultAbiCoder();
const pins={router:'0x57fc55F719DF19B4b90A03F9D78E1177D002E504',routerHash:'0xf49d04ba34710a0a6bddbf1fbb3580e6b708084205a60e47ccf215af2168405a',manager:'0xee04c68742e6bf434be8039580d2e89bbe55bc6f',quote:'0x5fc5360d0400a0fd4f2af552add042d716f1d168',weth:'0x0bd7d308f8e1639fab988df18a8011f41eacad73',permit2:'0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768',poolId:'0xdde13ccbbcd10c5fc3351c284eabc77114d2a88078eb1cfd20062124e939d4cf'};
const keyType='tuple(address,address,address,address,uint24,bytes32)';
async function main(){
 const out=process.argv[2];assert(out&&!fs.existsSync(out),'New evidence path required');let proxy,remote;
 const e={schema:'ops-market-fork-v1',observedAt:new Date().toISOString(),pins,transactions:[],assumptions:['Local31337 only; sandbox native and artificial USDG balance','Trial swap under snapshot quotes output; not a production quote service','No deployment source recompilation or production swap executor qualification']};
 const stage=s=>{e.stage=s;console.log(s);};
 try{
  stage('fork');proxy=await startReadProxy(process.env.RH_RPC_URL||'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public');remote=new ethers.JsonRpcProvider(proxy.url);
  assert.equal((await remote.getNetwork()).chainId,4663n);const head=await remote.getBlock('latest');e.anchor={number:head.number,hash:head.hash};
  await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:head.number}}]);assert.equal(await rpc('eth_chainId'),'0x7a69');await rpc('evm_mine');
  const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1}),signer=await provider.getSigner(0),wallet=await signer.getAddress();
  e.codeHashes={};for(const k of ['router','manager','quote','weth','permit2']){const c=await provider.getCode(pins[k]);assert.notEqual(c,'0x',k);e.codeHashes[k]=ethers.keccak256(c);}assert.equal(e.codeHashes.router,pins.routerHash);
  stage('pool-state');const manager=new ethers.Contract(pins.manager,['function poolIdToPoolKey(bytes32) view returns(address,address,address,address,uint24,bytes32)','function getLiquidity(bytes32) view returns(uint128)'],provider);
  const key=Array.from(await manager.poolIdToPoolKey(pins.poolId));e.poolKey=key;assert.equal(ethers.keccak256(coder.encode([keyType],[key])),pins.poolId);
  assert.equal(key[0].toLowerCase(),pins.weth);assert.equal(key[1].toLowerCase(),pins.quote);assert.equal(key[2],ethers.ZeroAddress);assert.equal(key[3].toLowerCase(),pins.manager);
  e.liquidity=await manager.getLiquidity(pins.poolId);assert(e.liquidity>0n);
  stage('fund-sandbox');const quote=new ethers.Contract(pins.quote,['function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)','function decimals() view returns(uint8)'],signer);assert.equal(await quote.decimals(),6n);
  const trace=await rpc('debug_traceCall',[{to:pins.quote,data:quote.interface.encodeFunctionData('balanceOf',[wallet])},'latest',{}]);
  for(const slot of [...new Set(trace.structLogs.filter(l=>l.op==='SLOAD').map(l=>'0x'+l.stack.at(-1)))]){const snap=await rpc('evm_snapshot');await rpc('hardhat_setStorageAt',[pins.quote,slot,ethers.zeroPadValue(ethers.toBeHex(100_000000n),32)]);try{if(await quote.balanceOf(wallet)===100_000000n){e.fundingSlot=slot;break;}}catch{}await rpc('evm_revert',[snap]);}assert(e.fundingSlot);
  const sent=async(label,promise)=>{const tx=await promise,r=await tx.wait();assert.equal(r.status,1);e.transactions.push({label,hash:tx.hash,gasUsed:r.gasUsed,gasPrice:r.gasPrice,fee:r.gasUsed*r.gasPrice});return r;};
  const amount=10_000000n,deadline=(await provider.getBlock('latest')).timestamp+600;
  stage('approve');await sent('USDG approval bounded',quote.approve(pins.permit2,amount));
  const permit=new ethers.Contract(pins.permit2,['function approve(address,address,uint160,uint48)'],signer);await sent('Permit2 bounded allowance',permit.approve(pins.quote,pins.router,amount,deadline));
  const router=new ethers.Contract(pins.router,['function execute(bytes,bytes[],uint256) payable'],signer);
  const inputs=min=>[coder.encode(['bytes','bytes[]'],['0x060c0e',[
   coder.encode([`tuple(${keyType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`],[[key,false,amount,min,'0x']]),
   coder.encode(['address','uint256'],[pins.quote,amount]),coder.encode(['address','address','uint256'],[pins.weth,pins.router,0])]]),coder.encode(['address','uint256'],[wallet,min])];
  const balance=async()=>BigInt(await rpc('eth_getBalance',[wallet,'latest']));
  stage('trial-quote');const snap=await rpc('evm_snapshot'),before=await balance();const trial=await (await router.execute('0x100c',inputs(1n),deadline)).wait();const output=await balance()-before+trial.gasUsed*trial.gasPrice;assert(output>0n);await rpc('evm_revert',[snap]);e.quotedNative=output;
  const usdBefore=await quote.balanceOf(wallet),nativeBefore=await balance(),min=output*9950n/10000n;e.minOut=min;
  stage('negative-minimum');await assert.rejects(router.execute.staticCall('0x100c',inputs(output*2n),deadline));assert.equal(await quote.balanceOf(wallet),usdBefore);
  stage('swap-unwrap');e.estimatedGas=await router.execute.estimateGas('0x100c',inputs(min),deadline);const receipt=await sent('USDG to native ETH atomic',router.execute('0x100c',inputs(min),deadline));
  e.actualUsdDebit=usdBefore-await quote.balanceOf(wallet);e.actualNativeOut=await balance()-nativeBefore+receipt.gasUsed*receipt.gasPrice;
  assert.equal(e.actualUsdDebit,amount);assert(e.actualNativeOut>=min);e.status='complete';
 }catch(error){e.status='failed';e.error=error.message;e.detail=error.info?.error||error.cause?.message;process.exitCode=1;console.error(e.stage,e.error);}finally{e.proxy=proxy?.stats;fs.writeFileSync(out,JSON.stringify(e,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');remote?.destroy();proxy?.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
