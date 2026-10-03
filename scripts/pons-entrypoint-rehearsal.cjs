// Local Hardhat-only execution proof; no production admission or public sender.
const E=require('ethers'),assert=require('node:assert/strict');
const {ENTRY,IMPLEMENTATION,ENTRY_HASH,IMPLEMENTATION_HASH,OP,ENTRY_ABI,ACCOUNT}=require('./pons-entrypoint-codec.cjs');
async function execute({rpc,provider,owner,request,capture,row}){
 const meta=await rpc('hardhat_metadata');assert.equal(Number(meta.forkedNetwork.chainId),4663);
 const wallet=new E.Wallet(require('./pons-launch-rehearsal.cjs').KEY);assert.equal(wallet.address.toLowerCase(),owner.address.toLowerCase());
 row.entrypoint={admitted:false,scope:'Signed local UserOperation; not installed wallet UI',runtimes:{}};
 for(const [a,h]of [[ENTRY,ENTRY_HASH],[IMPLEMENTATION,IMPLEMENTATION_HASH]]){const code=await rpc('eth_getCode',[a,'latest']);assert.equal(E.keccak256(code),h);row.entrypoint.runtimes[a]={code,hash:h};}
 const nonce=Number(BigInt(await rpc('eth_getTransactionCount',[wallet.address,'latest']))),head=await rpc('eth_getBlockByNumber',['latest',false]);
 const authorization=await wallet.authorize({address:IMPLEMENTATION,chainId:4663,nonce:nonce+1});
 const raw=await wallet.signTransaction({type:4,chainId:4663,nonce,to:wallet.address,data:'0x',value:0,gasLimit:200000n,maxFeePerGas:BigInt(head.baseFeePerGas)*2n+1000000000n,maxPriorityFeePerGas:1000000000n,authorizationList:[authorization]});
 const hash=await rpc('eth_sendRawTransaction',[raw]);row.entrypoint.delegation={tx:await rpc('eth_getTransactionByHash',[hash]),receipt:await rpc('eth_getTransactionReceipt',[hash])};assert.equal(row.entrypoint.delegation.receipt.status,'0x1');
 const code=await rpc('eth_getCode',[wallet.address,'latest']);assert.equal(code,'0xef0100'+IMPLEMENTATION.slice(2));row.entrypoint.accountCode=code;
 const binding=ACCOUNT.decodeFunctionResult('entryPoint',await rpc('eth_call',[{to:wallet.address,data:ACCOUNT.encodeFunctionData('entryPoint')},'latest']))[0];assert.equal(binding.toLowerCase(),ENTRY);
 const bundler=await provider.getSigner(0);assert.notEqual(bundler.address.toLowerCase(),wallet.address.toLowerCase());
 const ep=new E.Contract(ENTRY,ENTRY_ABI,bundler);
 const op={sender:wallet.address,nonce:await ep.getNonce(wallet.address,1),initCode:'0x',callData:ACCOUNT.encodeFunctionData('execute',[request.to,request.value,request.data]),accountGasLimits:E.solidityPacked(['uint128','uint128'],[500000,1000000]),preVerificationGas:50000,gasFees:E.solidityPacked(['uint128','uint128'],[1000000000n,BigInt(head.baseFeePerGas)*2n+1000000000n]),paymasterAndData:'0x',signature:'0x'};
 const userOpHash=await ep.getUserOpHash(op);op.signature='0xff00'+(await wallet.signMessage(E.getBytes(userOpHash))).slice(2);
 // Bad signature must fail validation, not merely produce success=false after execution.
 try{await ep.handleOps.staticCall([{...op,signature:'0xff00'+(await new E.Wallet(E.id('public invalid test signer')).signMessage(E.getBytes(userOpHash))).slice(2)}],bundler.address);throw Error('Bad signature accepted');}catch(e){assert.equal(e.code,'CALL_EXCEPTION');row.entrypoint.invalidSignature={code:e.code,data:e.data};}
 row.entrypoint.op=op;row.entrypoint.userOpHash=userOpHash;row.entrypoint.bundler=bundler.address;
 row.entrypoint.beforeBlock=await rpc('eth_getBlockByNumber',['latest',false]);
 const result=await capture(ep.handleOps([op],bundler.address,{gasLimit:3000000}));
 const events=result.receipt.logs.filter(l=>l.address.toLowerCase()===ENTRY&&l.topics[0]===ENTRY_ABI.getEvent('UserOperationEvent').topicHash).map(l=>ENTRY_ABI.parseLog(l).args);
 assert.equal(events.length,1);assert.equal(events[0].userOpHash,userOpHash);assert.equal(events[0].success,true);assert.equal(events[0].sender.toLowerCase(),wallet.address.toLowerCase());
 row.entrypoint.event=events[0].toObject();return result;
}
module.exports={ENTRY,IMPLEMENTATION,ENTRY_HASH,IMPLEMENTATION_HASH,OP,ENTRY_ABI,ACCOUNT,execute};
