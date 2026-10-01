// Research-only. All writes target in-process Hardhat; upstream proxy is read-only.
process.env.HARDHAT_CONFIG=require.resolve('../test/fixtures/public-hardhat.config.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers'),hre=require('hardhat'),solc=require('solc');
const {startReadProxy}=require('./read-only-fork-rpc.cjs');
const FACTORY='0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',USDG='0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',OWNER='0x098afA6731239a00CE0aff669aaefD16b7C72114';
const { FAB, ERC, CUR } = require('./integrations/pons-v2.cjs');
const helper=`pragma solidity ^0.8.26;
interface E{function claimToken(address) external returns(uint256);}
interface T{function balanceOf(address) external view returns(uint256);function transfer(address,uint256) external returns(bool);}
// Diagnostic recipient, NOT a production collector or PromoVault.
contract ProbeRecipient {address immutable escrow;address immutable quote;address immutable prize;address immutable ops;address immutable team;
constructor(address e,address q,address p,address o,address t){escrow=e;quote=q;prize=p;ops=o;team=t;}
function sweep(address curve) external{(bool ok,bytes memory data)=curve.call(abi.encodeWithSignature("sweepFees(uint256)",0));if(!ok)assembly{revert(add(data,32),mload(data))}}
function sweepPool(address hook,bytes32 id) external{(bool ok,bytes memory data)=hook.call(abi.encodeWithSignature("sweepPoolFees(bytes32,uint256,uint256)",id,0,0));if(!ok)assembly{revert(add(data,32),mload(data))}}
function claimAndSplit() external {uint beforeBal=T(quote).balanceOf(address(this));E(escrow).claimToken(quote);uint got=T(quote).balanceOf(address(this))-beforeBal;uint five=got*500/10000;require(T(quote).transfer(ops,five));require(T(quote).transfer(team,five));require(T(quote).transfer(prize,got-five-five));}}
`;
const swapHelper=`pragma solidity ^0.8.26;
struct Key {address currency0;address currency1;uint24 fee;int24 tickSpacing;address hooks;}
struct Params {bool zeroForOne;int256 amountSpecified;uint160 sqrtPriceLimitX96;}
interface PM {function unlock(bytes calldata) external returns(bytes memory);function swap(Key calldata,Params calldata,bytes calldata) external returns(int256);function sync(address) external;function settle() external payable returns(uint256);function take(address,address,uint256) external;}
interface Coin {function transferFrom(address,address,uint256) external returns(bool);}
// Test-only explicit pool route, not a production router.
contract ProbeSwap {PM immutable manager;constructor(address m){manager=PM(m);}
function trade(Key calldata k,bool zeroForOne,uint256 amount) external {manager.unlock(abi.encode(k,zeroForOne,amount,msg.sender));}
function unlockCallback(bytes calldata data) external returns(bytes memory){require(msg.sender==address(manager));(Key memory k,bool z,uint a,address payer)=abi.decode(data,(Key,bool,uint,address));int256 delta=manager.swap(k,Params(z,-int256(a),z?4295128740:1461446703485210103287273052203988822378723970341),"");int128 d0=int128(delta>>128);int128 d1=int128(delta);settle(k.currency0,d0,payer);settle(k.currency1,d1,payer);return abi.encode(delta);}
function settle(address currency,int128 d,address payer) private{if(d<0){manager.sync(currency);require(Coin(currency).transferFrom(payer,address(manager),uint128(-d)));manager.settle();}else if(d>0){manager.take(currency,payer,uint128(d));}}}
`;
async function main(){
 const file=process.argv[2];assert(file&&!fs.existsSync(file),'Supply new output filename');
 const out={schema:'pons-fork-research-v1',status:'RUNNING',publicSends:false,assumptions:['Local impersonation and synthetic USDG funding only','Probe recipient is NOT production collector; prize destination is test address, not PromoVault','ABI from current Pons docs/repository, runtime source equivalence not yet proved','No BUY indexer or ticket/draw qualification'],steps:[]};let proxy,remote;
 const rpc=(m,p=[])=>hre.network.provider.send(m,p);const save=()=>fs.writeFileSync(file,JSON.stringify(out,(_,v)=>typeof v==='bigint'?v.toString():v,2));
 try{
 remote=new ethers.JsonRpcProvider('https://rpc.mainnet.chain.robinhood.com');const block=await remote.getBlock('latest');out.anchor={number:block.number,hash:block.hash};
 proxy=await startReadProxy(process.env.RH_FORK_RPC_URL||'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public');
 console.log('fork at',block.number);await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:block.number}}]);
 assert.equal((await rpc('eth_getBlockByNumber',['latest',false])).hash,block.hash);await rpc('evm_mine');
 const p=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});await rpc('hardhat_impersonateAccount',[OWNER]);await rpc('hardhat_setBalance',[OWNER,ethers.toQuantity(ethers.parseEther('10'))]);const owner=new ethers.JsonRpcSigner(p,OWNER),factory=new ethers.Contract(FACTORY,FAB,owner),quote=new ethers.Contract(USDG,ERC,owner);
 assert(await factory.canLaunch(OWNER));assert(await factory.approvedPairTokens(USDG));assert.equal(await quote.decimals(),6n);
 const hook=await factory.memeHook(),escrow=await factory.feeEscrow();out.graph={factory:FACTORY,hook,escrow};out.codeHashes={};for(const a of [FACTORY,hook,escrow,USDG])out.codeHashes[a]=ethers.keccak256(await p.getCode(a));
 out.economics={pair:Array.from(await factory.pairTokenEconomics(USDG)),snipeSeconds:await factory.snipeTaxSeconds(),pin:await factory.previewLaunchEconomics(0,USDG),launchFee:await factory.launchFee()};save();
 const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Probe.sol':{content:helper}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));assert(!compiled.errors?.some(e=>e.severity==='error'),JSON.stringify(compiled.errors));const art=compiled.contracts['Probe.sol'].ProbeRecipient;
 const destinations=await Promise.all([1,2,3].map(async i=>(await p.getSigner(i)).getAddress()));const collector=await new ethers.ContractFactory(art.abi,art.evm.bytecode.object,owner).deploy(escrow,USDG,...destinations);await collector.waitForDeployment();out.probeRecipient=collector.target;
 const params=['QIANQI TEST','QT','', 'local fork only',['','','','',''],collector.target,300,false,out.economics.pin,ethers.id('pons-rehearsal-'+block.hash)];
 console.log('launch');const launched=await (await factory.launchToken(params,0,USDG,{value:out.economics.launchFee,gasLimit:15000000})).wait();
 const ev=launched.logs.map(l=>{try{return factory.interface.parseLog(l)}catch{return null}}).find(e=>e?.name==='TokenLaunched');assert(ev,'TokenLaunched');out.token=ev.args.token;out.curve=ev.args.curve;out.policy=Array.from(await factory.getLaunchFeePolicy(out.token));
 const curve=new ethers.Contract(out.curve,CUR,owner),token=new ethers.Contract(out.token,ERC,owner),ledger=new ethers.Contract(escrow,['function balanceOfToken(address,address) view returns(uint256)'],p);
 out.steps.push({stage:'launch',hash:launched.hash});out.rates={base:await curve.feeBps(),tax:await curve.creatorTaxBps()};assert.equal(out.rates.tax,300n);save();
 async function send(tx,label){const receipt=await (await tx).wait();assert.equal(receipt.status,1);out.steps.push({stage:label,hash:receipt.hash});save();return receipt;}
 async function fund(amount){const data=quote.interface.encodeFunctionData('balanceOf',[OWNER]);const trace=await rpc('debug_traceCall',[{to:USDG,data},'latest',{disableMemory:true,disableStorage:true}]);for(const slot of [...new Set(trace.structLogs.filter(x=>x.op==='SLOAD').map(x=>'0x'+x.stack.at(-1)))]){const snap=await rpc('evm_snapshot');await rpc('hardhat_setStorageAt',[USDG,slot,ethers.toBeHex(amount,32)]);try{if(await quote.balanceOf(OWNER)===amount){out.syntheticFunding={slot,amount};return;}}catch{}await rpc('evm_revert',[snap]);}throw Error('USDG funding slot not found');}
 await fund(20000_000000n);await send(quote.approve(out.curve,ethers.MaxUint256),'approve quote');
 const before=await quote.balanceOf(OWNER),expected=await curve.buy.staticCall(101_000000n,0,OWNER);await send(curve.buy(101_000000n,expected*99n/100n,OWNER,{gasLimit:3000000}),'buy101');assert.equal(before-await quote.balanceOf(OWNER),101_000000n);
 out.buy={debit:101_000000n,tokens:await token.balanceOf(OWNER),baseFee:await curve.quoteFeeBalance(),creatorTax:await curve.creatorTaxBalance()};assert.equal(out.buy.creatorTax,3030000n);
 await send(token.approve(out.curve,ethers.MaxUint256),'approve token');const sellAmount=out.buy.tokens/2n,sellQuote=await curve.sell.staticCall(sellAmount,0,OWNER);await send(curve.sell(sellAmount,sellQuote*99n/100n,OWNER,{gasLimit:3000000}),'sell half');
 console.log('sweep and claim');out.beforeSweep={base:await curve.quoteFeeBalance(),tax:await curve.creatorTaxBalance()};await send(collector.sweep(out.curve,{gasLimit:3000000}),'recipient sweep');out.claimable=await ledger.balanceOfToken(collector.target,USDG);assert(out.claimable>0n);assert.equal(out.claimable,out.beforeSweep.base-out.beforeSweep.base*out.policy[1]/10000n+out.beforeSweep.tax);
 const balances=await Promise.all(destinations.map(a=>quote.balanceOf(a)));await send(collector.claimAndSplit({gasLimit:1000000}),'claim split');out.split=await Promise.all(destinations.map(async(a,i)=>(await quote.balanceOf(a))-balances[i]));assert.equal(out.split.reduce((a,b)=>a+b,0n),out.claimable);assert.equal(out.split[1],out.claimable*500n/10000n);assert.equal(out.split[2],out.split[1]);
 console.log('graduation');await send(curve.buy(15000_000000n,0,OWNER,{gasLimit:16000000}),'threshold buy (test-only zero minOut)');let record=await factory.getLaunchedToken(out.token);if(record.phase===1n){await send(factory.createGraduatedPool(out.token,{gasLimit:16000000}),'finish graduation');record=await factory.getLaunchedToken(out.token);}out.graduation={phase:record.phase,record:Array.from(record)};assert.equal(record.phase,2n);out.status='PRE_GRADUATION_AND_GRADUATION_PASSED';
 console.log('post-graduation explicit v4 swaps');
 const h=new ethers.Contract(hook,['function poolManager() view returns(address)','function feeSweepOperator() view returns(address)','function pendingFees(bytes32,address) view returns(uint256)','function pendingCreatorTax(bytes32,address) view returns(uint256)','function sweepPoolFees(bytes32,uint256,uint256)'],owner);
 const sc=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Swap.sol':{content:swapHelper}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));assert(!sc.errors?.some(e=>e.severity==='error'),JSON.stringify(sc.errors));const sa=sc.contracts['Swap.sol'].ProbeSwap;
 const router=await new ethers.ContractFactory(sa.abi,sa.evm.bytecode.object,owner).deploy(await h.poolManager());await router.waitForDeployment();out.probeRouter=router.target;
 const currencies=[USDG,out.token].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1),key=[...currencies,record.poolFee,record.tickSpacing,hook];const id=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address','address','uint24','int24','address'],key));out.poolId=id;
 await send(quote.approve(router.target,ethers.MaxUint256),'approve v4 quote');await send(token.approve(router.target,ethers.MaxUint256),'approve v4 token');
 const prior=await token.balanceOf(OWNER);await send(router.trade(key,currencies[0]===USDG,101_000000n,{gasLimit:5000000}),'v4 buy101 (test-only unbounded price)');out.postBuy={tokens:(await token.balanceOf(OWNER))-prior,taxToken:await h.pendingCreatorTax(id,out.token),taxUSDG:await h.pendingCreatorTax(id,USDG)};assert(out.postBuy.taxToken>0n);
 try{await collector.sweepPool.staticCall(hook,id);throw Error('Expected creator conversion restriction');}catch(e){assert(e.data?.startsWith(ethers.id('InternalSwapRequiresOperator()').slice(0,10)),e.message);out.creatorConversionBlocked={selector:e.data};}
 await send(router.trade(key,currencies[0]===out.token,out.postBuy.tokens/2n,{gasLimit:5000000}),'v4 sell half');out.postSell={taxToken:await h.pendingCreatorTax(id,out.token),taxUSDG:await h.pendingCreatorTax(id,USDG)};assert(out.postSell.taxUSDG>0n);
 const operator=await h.feeSweepOperator();out.operator=operator;await rpc('hardhat_impersonateAccount',[operator]);await rpc('hardhat_setBalance',[operator,ethers.toQuantity(ethers.parseEther('1'))]);out.assumptions.push('Pons sweep operator impersonated ONLY locally to prove conditional conversion; we do not control it on mainnet');
 await send(h.connect(new ethers.JsonRpcSigner(p,operator)).sweepPoolFees(id,1,0,{gasLimit:6000000}),'operator conversion (test-only 1 raw minOut)');out.postClaimable=await ledger.balanceOfToken(collector.target,USDG);assert(out.postClaimable>0n);await send(collector.claimAndSplit({gasLimit:1000000}),'post graduation claim split');out.status='CURVE_AND_V4_DIAGNOSTIC_PASSED';
 }catch(e){out.status='FAILED';out.error={message:e.shortMessage||e.message,data:e.data,info:e.info,stack:e.stack};process.exitCode=1;}
 finally{out.proxyStats=proxy?.stats;save();proxy?.close();remote?.destroy();console.log(JSON.stringify({status:out.status,error:out.error,economics:out.economics,rates:out.rates,policy:out.policy,split:out.split,graduation:out.graduation},(_,v)=>typeof v==='bigint'?v.toString():v,2));}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
