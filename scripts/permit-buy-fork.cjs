// Executes ONLY on local Hardhat. Upstream transport rejects all write RPC methods.
// node scripts/permit-buy-fork.cjs NEW_OUTPUT.json
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers'),hre=require('hardhat');
const {startReadProxy}=require('./read-only-fork-rpc.cjs');
const {SWAP_TYPE,SWAP_ABI,TRANSFER_ABI}=require('./direct-buy.cjs');
const cfg=require('../research/pair-usdg-active-reference-2026-09-23.json').decoderConfig;
const PERMIT='0x000000000022d473030f116ddee9f6b43ac78ba3';
const RPC=process.env.RH_RPC_URL||'https://rpc.mainnet.chain.robinhood.com';
const coder=ethers.AbiCoder.defaultAbiCoder();
async function main(){
 const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('NEW output required');
 const integration=process.argv[3]==='--integration';
 const source=process.argv[3]==='--source';
 const market=process.argv[3]==='--market';
 if(process.argv.length>4||process.argv[3]&&!integration&&!source&&!market)throw Error('Expected NEW_OUTPUT.json [--integration|--source|--market]');
 const e={schema:'permit-buy-fork-v1',mode:'local-fork-only',upstream:RPC,config:cfg,observedAt:new Date().toISOString(),observations:[]};let proxy;
 const rpc=(m,p=[])=>hre.network.provider.send(m,p);
 try{
  e.stage='fork';proxy=await startReadProxy(RPC);
  await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url}}]);
  assert.equal(await rpc('eth_chainId'),'0x7a69');
  e.forkBlock=await rpc('eth_getBlockByNumber',['latest',false]);
  // Execute on a new local Cancun block, not an upstream historical block whose
  // chain-specific hardfork history Hardhat does not know. Do not invent that history.
  await rpc('evm_mine');
  e.localExecutionBlock=await rpc('eth_getBlockByNumber',['latest',false]);
  const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1}),user=await provider.getSigner(2),wallet=await user.getAddress();
  e.wallet=wallet;e.codeHashes={};e.stage='runtime';
  for(const [name,address] of Object.entries({router:cfg.router,manager:cfg.manager,hook:cfg.hook,token:cfg.token,quote:cfg.quote,permit:PERMIT})){
   const code=await provider.getCode(address);assert.notEqual(code,'0x',name);e.codeHashes[name]=ethers.keccak256(code);
  }
  assert.equal(e.codeHashes.router,'0x2ce6aaaf9f4151f5e1cbf774668772f17f532ae11b15e9284fd0a072a8b0fbde');
  const erc=['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','function approve(address,uint256) returns(bool)'];
  const quote=new ethers.Contract(cfg.quote,erc,user),token=new ethers.Contract(cfg.token,erc,user);
  e.stage='usdg-decimals';
  try{assert.equal(await quote.decimals(),6n);}catch(error){
   e.callError=error.info||String(error);
   try{const tr=await rpc('debug_traceCall',[{from:wallet,to:cfg.quote,data:'0x313ce567'},'latest',{}]);e.failedCallTrace={failed:tr.failed,returnValue:tr.returnValue,tail:tr.structLogs.slice(-16)};}catch(traceError){e.traceError=String(traceError);}
   throw error;
  }
  e.stage='sandbox-wallet-funding';
  const trace=await rpc('debug_traceCall',[{to:cfg.quote,data:quote.interface.encodeFunctionData('balanceOf',[wallet])},'latest',{}]);
  const slots=[...new Set(trace.structLogs.filter(l=>l.op==='SLOAD').map(l=>'0x'+l.stack.at(-1)))];let slotUsed;
  for(const slot of slots){const snap=await rpc('evm_snapshot');await rpc('hardhat_setStorageAt',[cfg.quote,slot,ethers.zeroPadValue(ethers.toBeHex(1000_000000n),32)]);
   try{if(await quote.balanceOf(wallet)===1000_000000n){slotUsed=slot;break;}}catch{}await rpc('evm_revert',[snap]);}
  assert(slotUsed,'Cannot identify wallet balance slot');e.sandboxFunding={slot:slotUsed,amount:'1000000000',limitation:'Local USDG wallet balance only; no mint provenance claim'};
  async function sent(label,promise){const tx=await promise,receipt=await tx.wait();e.observations.push({label,transaction:await rpc('eth_getTransactionByHash',[tx.hash]),receipt:await rpc('eth_getTransactionReceipt',[tx.hash])});assert.equal(receipt.status,1);return receipt;}
  e.stage='approve';await sent('ERC20 approves Permit2',quote.approve(PERMIT,ethers.MaxUint256));
  const permit=new ethers.Contract(PERMIT,['function allowance(address,address,address) view returns(uint160 amount,uint48 expiration,uint48 nonce)'],user);
  async function buy(label='Permit2 + USDG BUY'){
  const previous=await permit.allowance(wallet,cfg.quote,cfg.router);e.allowanceBefore=previous.toArray().map(String);assert.equal(previous.amount,0n,'Test requires no prior Permit2 spending allowance');
  const now=(await provider.getBlock('latest')).timestamp;
  const details={token:cfg.quote,amount:100_000000n,expiration:now+600,nonce:previous.nonce},permitSingle={details,spender:cfg.router,sigDeadline:now+600};
  const types={PermitDetails:[{name:'token',type:'address'},{name:'amount',type:'uint160'},{name:'expiration',type:'uint48'},{name:'nonce',type:'uint48'}],PermitSingle:[{name:'details',type:'PermitDetails'},{name:'spender',type:'address'},{name:'sigDeadline',type:'uint256'}]};
  const signature=await user.signTypedData({name:'Permit2',chainId:31337,verifyingContract:PERMIT},types,permitSingle);
  const permitInput=coder.encode(['((address,uint160,uint48,uint48),address,uint256)','bytes'],[[[details.token,details.amount,details.expiration,details.nonce],permitSingle.spender,permitSingle.sigDeadline],signature]);
  const input=coder.encode(['bytes','bytes[]'],['0x060b0e',[
   coder.encode([SWAP_TYPE],[[cfg.poolKey,cfg.poolKey[0].toLowerCase()===cfg.quote.toLowerCase(),100_000000n,1n,0,'0x']]),
   coder.encode(['address','uint256','bool'],[cfg.quote,0,true]),coder.encode(['address','address','uint256'],[cfg.token,wallet,0])]]);
  const router=new ethers.Contract(cfg.router,['function execute(bytes,bytes[],uint256) payable'],user);
  e.stage='permit-swap';const qBefore=await quote.balanceOf(wallet),tBefore=await token.balanceOf(wallet);
  const receipt=await sent(label,router.execute('0x0a10',[permitInput,input],now+600,{gasLimit:3000000}));
  e.actual={quoteSpent:String(qBefore-await quote.balanceOf(wallet)),tokenReceived:String(await token.balanceOf(wallet)-tBefore)};
  assert.equal(e.actual.quoteSpent,'100000000');assert(BigInt(e.actual.tokenReceived)>0n);
  const swaps=receipt.logs.filter(l=>l.address.toLowerCase()===cfg.manager.toLowerCase()&&l.topics[0]===SWAP_ABI.getEvent('Swap').topicHash);assert.equal(swaps.length,1);assert.equal(SWAP_ABI.parseLog(swaps[0]).args.id,cfg.poolId);
  e.transfers=receipt.logs.filter(l=>[cfg.token.toLowerCase(),cfg.quote.toLowerCase()].includes(l.address.toLowerCase())&&l.topics[0]===TRANSFER_ABI.getEvent('Transfer').topicHash).map(l=>({token:l.address,...TRANSFER_ABI.parseLog(l).args.toObject()}));
  e.allowanceAfter=(await permit.allowance(wallet,cfg.quote,cfg.router)).toArray().map(String);
  assert.equal(e.allowanceAfter[0],'0');assert.equal(BigInt(e.allowanceAfter[2]),previous.nonce+1n);
  return receipt;
  }
  if(integration)await require('./permit-buy-integration.cjs').run({e,cfg,provider,user,quote,rpc,buy,out});
  else if(source)await require('./fee-source-integration.cjs').run({e,cfg,provider,user,rpc,buy});
  else if(market)await require('./v4-market-integration.cjs').run({e,cfg,provider,user,rpc,buy});
  else await buy();
  e.stage='complete';
 }catch(error){e.error=error.stack||String(error);e.errorDetails=error.info||error.error||null;process.exitCode=1;}
 finally{e.proxyStats=proxy?.stats;fs.writeFileSync(out,JSON.stringify(e,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,stage:e.stage,error:e.error,actual:e.actual,proxyStats:e.proxyStats}));await proxy?.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
