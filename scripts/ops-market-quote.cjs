// Read-only qualification. Returns exact calldata, never signs/approves/sends.
const {ethers}=require('ethers');
const profile=require('../config/ops-market-robinhood.json'),coder=ethers.AbiCoder.defaultAbiCoder();
const keyType='tuple(address,address,address,address,uint24,bytes32)';
const abi={
 manager:['function poolIdToPoolKey(bytes32) view returns(address,address,address,address,uint24,bytes32)','function getLiquidity(bytes32) view returns(uint128)'],
 quoter:[`function poolManager() view returns(address)`,`function quoteExactInputSingle((${keyType},bool,uint128,bytes)) returns(uint256,uint256)`],
 quote:['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)'],
 permit2:['function allowance(address,address,address) view returns(uint160,uint48,uint48)'],
 router:['function execute(bytes,bytes[],uint256) payable']};
const interfaces=Object.fromEntries(Object.entries(abi).map(([k,a])=>[k,new ethers.Interface(a)]));
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
function transaction(source,amount,minOut,deadline){
 const key=profile.poolKey,p=profile.pins;
 const inputs=[coder.encode(['bytes','bytes[]'],['0x060c0e',[
 coder.encode([`tuple(${keyType} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`],[[key,false,amount,minOut,'0x']]),
 coder.encode(['address','uint256'],[p.quote[0],amount]),coder.encode(['address','address','uint256'],[p.weth[0],p.router[0],0])]]),coder.encode(['address','uint256'],[source,minOut])];
 return {from:source,to:p.router[0],value:'0x0',data:interfaces.router.encodeFunctionData('execute',['0x100c',inputs,deadline])};
}
async function prepareSwap(provider,{source,amountRaw,slippageBps,maxImpactBps,maxAgeSeconds,deadlineSeconds,maxGasPrice,maxGasUnits,nativeFloor,extraFeeWei,localFork=false},{now=()=>Math.floor(Date.now()/1000)}={}){
 if(!ethers.isAddress(source)||same(source,ethers.ZeroAddress))throw Error('Explicit operations EOA required');
 for(const n of [slippageBps,maxImpactBps])if(!Number.isInteger(n)||n<0||n>1000)throw Error('Invalid quote bps');
 for(const n of [maxAgeSeconds,deadlineSeconds])if(!Number.isInteger(n)||n<=0||n>600)throw Error('Invalid quote timing');
 for(const n of [amountRaw,maxGasPrice,maxGasUnits,nativeFloor,extraFeeWei])if(typeof n!=='string'||!/^(0|[1-9][0-9]*)$/.test(n))throw Error('Explicit quote bounds required');
 const amount=BigInt(amountRaw);if(amount<=1n||amount>=(1n<<127n)||BigInt(maxGasPrice)===0n||BigInt(maxGasUnits)===0n)throw Error('Invalid quote bounds');
 const wait=(reason,more={})=>({status:'waiting',reason,...more});let stage='reads';
 try{
 const chain=BigInt(await provider.send('eth_chainId',[]));
 if(localFork){const m=await provider.send('hardhat_metadata',[]);if(chain!==31337n||Number(m.forkedNetwork?.chainId)!==4663)return wait('wrongNetwork');}
 else if(chain!==4663n)return wait('wrongNetwork');
 const head=await provider.send('eth_getBlockByNumber',['latest',false]),tag=head.number,stamp=Number(BigInt(head.timestamp));
 if(now()<stamp-5||now()-stamp>maxAgeSeconds)return wait('staleQuote');
 const observation={blockNumber:Number(BigInt(tag)),blockHash:head.hash,timestamp:stamp};
 for(const [name,[address,digest]]of Object.entries(profile.pins))if(ethers.keccak256(await provider.send('eth_getCode',[address,tag]))!==digest)return wait('marketPinMismatch',{pin:name});
 if(await provider.send('eth_getCode',[source,tag])!=='0x')return wait('sourceNotEOA');
 const call=async(name,method,args=[])=>interfaces[name].decodeFunctionResult(method,await provider.send('eth_call',[{to:profile.pins[name][0],data:interfaces[name].encodeFunctionData(method,args)},tag]));
 if(!same((await call('quoter','poolManager'))[0],profile.pins.manager[0]))return wait('quoterBindingMismatch');
 const key=await call('manager','poolIdToPoolKey',[profile.poolId]);if(ethers.keccak256(coder.encode([keyType],[Array.from(key)]))!==profile.poolId)return wait('poolKeyMismatch');
 if((await call('manager','getLiquidity',[profile.poolId]))[0]===0n)return wait('insufficientLiquidity');
 stage='quote';const small=amount/100n||1n;
 const out=(await call('quoter','quoteExactInputSingle',[[profile.poolKey,false,amount,'0x']]))[0];
 const marginal=(await call('quoter','quoteExactInputSingle',[[profile.poolKey,false,small,'0x']]))[0];
 if(out<=0n||marginal<=0n)return wait('insufficientLiquidity');
 if(out*small*10000n<marginal*amount*BigInt(10000-maxImpactBps))return wait('priceImpact');
 const min=out*BigInt(10000-slippageBps)/10000n;if(min===0n||min>=(1n<<128n))return wait('invalidQuote');
 const deadline=stamp+deadlineSeconds,quoted={observation,amountRaw,quotedNative:String(out),minOut:String(min),deadline};
 stage='reads';const fresh=async()=>{const b=await provider.send('eth_getBlockByNumber',[tag,false]),latest=await provider.send('eth_getBlockByNumber',['latest',false]);return same(b.hash,head.hash)&&Number(BigInt(latest.timestamp))<deadline&&now()-stamp<=maxAgeSeconds&&now()<deadline&&now()>=stamp-5;};
 if((await call('quote','balanceOf',[source]))[0]<amount)return wait('insufficientUSDG',quoted);
 const allowance=(await call('quote','allowance',[source,profile.pins.permit2[0]]))[0],permit=await call('permit2','allowance',[source,profile.pins.quote[0],profile.pins.router[0]]);
 if(!await fresh())return wait('staleQuote');
 if(allowance<amount||permit[0]<amount||permit[1]<BigInt(deadline))return wait('allowanceRequired',quoted);
 const gasPrice=BigInt(await provider.send('eth_gasPrice',[]));if(gasPrice<=0n||gasPrice>BigInt(maxGasPrice))return wait('expensiveGas',quoted);
 const tx=transaction(source,amount,min,deadline);stage='simulation';await provider.send('eth_call',[tx,tag]);
 stage='estimate';const gas=BigInt(await provider.send('eth_estimateGas',[tx,tag]));if(gas>BigInt(maxGasUnits)||BigInt(maxGasUnits)>BigInt(head.gasLimit))return wait('gasBound',quoted);
 const native=BigInt(await provider.send('eth_getBalance',[source,tag]));
 // Conservative configured cap, including an explicit extra fee allowance. No Nitro guarantee.
 const reserve=BigInt(maxGasUnits)*BigInt(maxGasPrice)+BigInt(extraFeeWei);
 if(native<reserve+BigInt(nativeFloor))return wait('sourceNeedsETH',quoted);
 if(!await fresh())return wait('staleQuote');
 return {status:'prepared',...quoted,transaction:tx,estimatedGas:String(gas),gasPrice:String(gasPrice),maximumFeeReserve:String(reserve),authorizationToSend:false};
 }catch(e){return wait(e.code==='CALL_EXCEPTION'||e.code===3||e.code===-32000&&/revert/i.test(e.message)?(stage==='quote'?'quoteRejected':stage==='simulation'?'simulationRejected':'readRejected'):'rpcUnavailable',{stage,detail:e.shortMessage||e.message});}
}
module.exports={prepareSwap,transaction,profile,interfaces,keyType};
