// Local rehearsal: default runtime-copy model; --7702 uses signed authorization. No MetaMask UI or public sends.
process.env.HARDHAT_CONFIG=require.resolve(process.argv.includes('--7702')?'../test/fixtures/pons-7702-hardhat.config.cjs':'../test/fixtures/public-hardhat.config.cjs');
const fs=require('fs'),assert=require('assert/strict'),{ethers}=require('ethers'),hre=require('hardhat'),{startReadProxy}=require('./read-only-fork-rpc.cjs'),P=require('./pons-curve-buy.cjs');
(async()=>{let proxy;const output=process.argv[3];assert(output&&!fs.existsSync(output),'Supply a new output JSON path');const out={status:'RUNNING',publicSends:false,steps:[]};try{const capture=JSON.parse(fs.readFileSync(process.argv[2])),c=capture.out;out.anchor=capture.anchor;proxy=await startReadProxy('https://rpc.mainnet.chain.robinhood.com');const rpc=async(m,p=[])=>{console.log('RPC',m);return hre.network.provider.send(m,p);};const heartbeat=setInterval(()=>console.log('upstream',JSON.stringify(proxy.stats)),15000);heartbeat.unref();await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:Number(BigInt(capture.anchor.number))}}]);assert.equal((await rpc('eth_getBlockByNumber',['latest',false])).hash,capture.anchor.hash);await rpc('evm_mine');const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});const signed7702=process.argv.includes('--7702');const signer=new ethers.Wallet(ethers.id('QIANQI PUBLIC LOCAL TEST KEY ONLY'));if(signed7702)assert.equal(c.account.toLowerCase(),signer.address.toLowerCase());else await rpc('hardhat_impersonateAccount',[c.account]);await rpc('hardhat_setBalance',[c.account,ethers.toQuantity(ethers.parseEther('10'))]);const quote=new ethers.Contract(c.details.quoteAsset.address,['function balanceOf(address) view returns(uint256)'],provider);const trace=await rpc('debug_traceCall',[{to:quote.target,data:quote.interface.encodeFunctionData('balanceOf',[c.account])},'latest',{disableMemory:true,disableStorage:true}]);let funded=false;for(const slot of [...new Set(trace.structLogs.filter(x=>x.op==='SLOAD').map(x=>'0x'+x.stack.at(-1)))]){const snap=await rpc('evm_snapshot');await rpc('hardhat_setStorageAt',[quote.target,slot,ethers.toBeHex(1000000000n,32)]);try{if(await quote.balanceOf(c.account)===1000000000n){out.syntheticFunding={slot,amount:'1000000000'};funded=true;break;}}catch{}await rpc('evm_revert',[snap]);}assert(funded);const executor='0x63c0c19a282a1b52b07dd5a65b58948a07dae32b';
const runtime=await rpc('eth_getCode',[executor,'latest']);assert(runtime.length>100,'Missing executor runtime');
out.executor={address:executor,runtimeHash:ethers.keccak256(runtime),model:'hardhat_setCode on fake account; no 7702 authorization'};
if(signed7702){assert.equal(await rpc('eth_getCode',[c.account,'latest']),'0x');out.executor.model='Signed local type4 authorization + self-call, Prague VM; no MetaMask UI';}else await rpc('hardhat_setCode',[c.account,runtime]);
async function send(call,upgrade=true){if(!signed7702)return rpc('eth_sendTransaction',[{from:c.account,to:call.to,data:call.data,value:ethers.toQuantity(BigInt(call.value||0)),gas:'0x989680'}]);const nonce=Number(BigInt(await rpc('eth_getTransactionCount',[c.account,'latest'])));const auth=await signer.authorize({address:executor,chainId:4663,nonce:nonce+1});const head=await rpc('eth_getBlockByNumber',['latest',false]);const raw=await signer.signTransaction({type:upgrade?4:2,chainId:4663,nonce,to:call.to,data:call.data,value:BigInt(call.value||0),gasLimit:10000000n,maxFeePerGas:BigInt(head.baseFeePerGas)*2n+1000000000n,maxPriorityFeePerGas:1000000000n,...(upgrade?{authorizationList:[auth]}:{})});return rpc('eth_sendRawTransaction',[raw]);}
let base=await rpc('evm_snapshot');for(const [label,calls]of [['USDG',c.usd.calls],['ETH',c.eth.calls]]){if(!calls)throw Error('Missing '+label+' capture');if(label==='ETH'){await rpc('evm_revert',[base]);base=await rpc('evm_snapshot');}const steps=[];
const execution=ethers.AbiCoder.defaultAbiCoder().encode(['tuple(address target,uint256 value,bytes callData)[]'],[calls.map(call=>[call.to,BigInt(call.value||0),call.data])]);
const iface=new ethers.Interface(['function execute(bytes32 mode,bytes executionCalldata) payable']);
const batch={to:c.account,value:0,data:iface.encodeFunctionData('execute',['0x01'+'00'.repeat(31),execution])};
for(const call of [batch]){const hash=await send(call);const receipt=await rpc('eth_getTransactionReceipt',[hash]);assert.equal(receipt.status,'0x1');const tx=await rpc('eth_getTransactionByHash',[hash]);assert.equal(tx.input.toLowerCase(),call.data.toLowerCase());if(signed7702){assert.equal(tx.type,'0x4');assert.equal(await rpc('eth_getCode',[c.account,'latest']),'0xef0100'+executor.slice(2));assert.equal(tx.authorizationList.length,1);}steps.push({tx,receipt});}const m={...require('../docs/evidence/PONS_CHANNEL_RECEIPTS_2026-10-02.json').manifest,curve:c.details.curve,token:c.details.token};const observations=steps.map(s=>require('./pons-channel-attribution.cjs').inspect(m,s.tx,s.receipt));
assert.equal(observations[0].events.length,1);assert.equal(observations[0].events[0].curveRecipient.toLowerCase(),c.account.toLowerCase());
assert.equal(observations[0].directDecoder[0].status,'UNSUPPORTED_ROUTE');
if(signed7702){
 const delegated=await rpc('eth_getCode',[c.account,'latest']);
 // Fresh quote is not fabricated: restore the pre-BUY state, then authorize
 // in a separate empty transaction before executing the exact captured calls.
 await rpc('evm_revert',[base]);base=await rpc('evm_snapshot');
 const upgradeHash=await send({to:c.account,data:'0x',value:0},true);assert.equal((await rpc('eth_getTransactionReceipt',[upgradeHash])).status,'0x1');
 // Use the original captured limits on restored market state.
 let repeatHash;
 try { repeatHash=await send(batch,false); } catch(e) { out.steadyFailure={label,message:e.message};throw e; }
 const repeatReceipt=await rpc('eth_getTransactionReceipt',[repeatHash]);assert.equal(repeatReceipt.status,'0x1');
 const repeatTx=await rpc('eth_getTransactionByHash',[repeatHash]);assert.equal(repeatTx.type,'0x2');assert(!repeatTx.authorizationList?.length);
 assert.equal(await rpc('eth_getCode',[c.account,'latest']),delegated);
 const repeatObservation=require('./pons-channel-attribution.cjs').inspect(m,repeatTx,repeatReceipt);
 assert.equal(repeatObservation.events.length,1);
 (out.steadyState??=[]).push({label,tx:repeatTx,receipt:repeatReceipt,observation:repeatObservation});
 const badCalls=calls.map(x=>({...x}));const b=P.CALL.decodeFunctionData('buy',badCalls.at(-1).data);badCalls.at(-1).data=P.CALL.encodeFunctionData('buy',[b.quoteIn,ethers.MaxUint256,b.recipient]);
 const badExecution=ethers.AbiCoder.defaultAbiCoder().encode(['tuple(address target,uint256 value,bytes callData)[]'],[badCalls.map(x=>[x.to,BigInt(x.value||0),x.data])]);
 const assets=[quote.target,c.details.token,...(label==='ETH'?[calls[0].to]:[])];
 const balances=()=>Promise.all(assets.map(a=>new ethers.Contract(a,['function balanceOf(address) view returns(uint256)'],provider).balanceOf(c.account)));
 const before=await balances();let failedHash;
 try{failedHash=await send({...batch,data:iface.encodeFunctionData('execute',['0x01'+'00'.repeat(31),badExecution])},false);}catch(e){failedHash=e.transactionHash;}
 assert(failedHash,'Expected a mined reverted batch, not transport rejection');
 const failedReceipt=await rpc('eth_getTransactionReceipt',[failedHash]);assert.equal(failedReceipt.status,'0x0');assert.equal(failedReceipt.logs.length,0);assert.deepEqual(await balances(),before);
 (out.atomicRollback??=[]).push({label,transactionHash:failedHash,status:failedReceipt.status,logs:0,assetBalancesUnchanged:true});

}
out.steps.push({label,steps,observations});console.log(label+' BATCH EXECUTED; direct adapter correctly rejects envelope');}out.status=signed7702?'PONS_SIGNED_7702_LOCAL_PASSED':'METAMASK_RUNTIME_MODEL_PASSED';}catch(e){out.status='FAILED';out.error=e.message;process.exitCode=1;console.error(e);}finally{fs.writeFileSync(output,JSON.stringify(out,null,2));proxy?.close();}})();
