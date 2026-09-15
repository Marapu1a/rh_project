// Only local Hardhat transactions; public RPC is restricted to reads by the proxy.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const hre=require('hardhat');
const {compile}=require('./compile.cjs');
const {startReadProxy}=require('./read-only-fork-rpc.cjs');
const ROOT='research/direct-buy';
const RPC=process.env.RH_RPC_URL||'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public';
const ROUTER='0x8876789976decbfcbbbe364623c63652db8c0904';
const MANAGER='0x8366a39cc670b4001a1121b8f6a443a643e40951';
const USDG='0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const PERMIT='0x000000000022d473030f116ddee9f6b43ac78ba3';
const PROXY='0x8660a7f019c7943b0b0a91b8e39aff3b6db6ae62';
const LAUNCH='(string,string,string,bytes32,(address,uint16)[],uint32,bytes,address[],uint16[],address,(uint256,uint256,(address,uint256,uint256)[]),uint256,bytes32)';
const SWAP='((address,address,uint24,int24,address),bool,uint128,uint128,uint256,bytes)';
const coder=ethers.AbiCoder.defaultAbiCoder();
let proxy;
async function main(){
  fs.mkdirSync(ROOT+'/sources',{recursive:true});
  const compiled=compile();
  proxy=await startReadProxy(RPC);
  await hre.network.provider.send('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url}}]);
  const rpc=(m,p=[])=>hre.network.provider.send(m,p);
  assert.equal(await rpc('eth_chainId'),'0x7a69');
  const forkBlock=await rpc('eth_getBlockByNumber',['latest',false]);
  const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
  const admin=await provider.getSigner(0),user=await provider.getSigner(2),other=await provider.getSigner(3);
  const wallet=await user.getAddress();
  async function deploy(name,args=[]){const a=compiled[name];const c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,admin).deploy(...args);await c.waitForDeployment();return c;}
  const observations=[];
  async function sent(label,promise){const receipt=await(await promise).wait();observations.push({label,hash:receipt.hash});console.log(label,receipt.hash);return receipt;}
  const registry=await deploy('ParticipantRegistry');
  const inputSource=JSON.parse(fs.readFileSync('research/current-launch-2026-09-12.json'));
  const creator=inputSource.vanity.creator,tokenAddress=inputSource.vanity.predicted;
  assert.equal(await provider.getCode(tokenAddress),'0x','Saved launch salt already used; refresh launch evidence');
  await rpc('hardhat_impersonateAccount',[creator]);
  await rpc('hardhat_setBalance',[creator,ethers.toBeHex(ethers.parseEther('10'))]);
  const launchInput=inputSource.reads.find(r=>r.method==='eth_call'&&r.params[0].data.startsWith('0xb802af88')).params[0];
  const params=coder.decode([LAUNCH],'0x'+launchInput.data.slice(10))[0].toArray(true);
  params[6]=coder.encode(['address[]','uint16[]'],[[await admin.getAddress()],[10000]]);
  params[11]=(await provider.getBlock('latest')).timestamp+1200;
  const receipt=await sent('native PAIR launch',new ethers.JsonRpcSigner(provider,creator).sendTransaction({to:PROXY,data:'0xb802af88'+coder.encode([LAUNCH],[params]).slice(2),value:launchInput.value,gasLimit:15000000}));
  const initAbi=new ethers.Interface(['event Initialize(bytes32 indexed id,address indexed currency0,address indexed currency1,uint24 fee,int24 tickSpacing,address hooks,uint160 sqrtPriceX96,int24 tick)']);
  const init=receipt.logs.filter(l=>l.address.toLowerCase()===MANAGER).map(l=>{try{return initAbi.parseLog(l);}catch{return null;}}).find(l=>l&&[l.args.currency0.toLowerCase(),l.args.currency1.toLowerCase()].includes(tokenAddress.toLowerCase()));
  assert.ok(init,'No TOKEN pool initialization');
  const key=[init.args.currency0,init.args.currency1,init.args.fee,init.args.tickSpacing,init.args.hooks];
  assert.ok(key.slice(0,2).some(a=>a.toLowerCase()===USDG));
  const erc=['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','function approve(address,uint256) returns(bool)'];
  const token=new ethers.Contract(tokenAddress,erc,user),quote=new ethers.Contract(USDG,erc,user);
  assert.equal(await quote.decimals(),6n);
  // Sandbox capital only. Never change pool balances or launch TOKENS to force a result.
  const trace=await rpc('debug_traceCall',[{to:USDG,data:quote.interface.encodeFunctionData('balanceOf',[wallet])},'latest',{}]);
  const slots=[...new Set(trace.structLogs.filter(l=>l.op==='SLOAD').map(l=>'0x'+l.stack.at(-1)))];
  let fundedSlot;
  for(const slot of slots){const snapshot=await rpc('evm_snapshot');await rpc('hardhat_setStorageAt',[USDG,slot,ethers.zeroPadValue(ethers.toBeHex(1000_000000n),32)]);try{if(await quote.balanceOf(wallet)===1000_000000n){fundedSlot=slot;break;}}catch{}await rpc('evm_revert',[snapshot]);}
  assert.ok(fundedSlot,'Could not fund local participant');
  const permit=new ethers.Contract(PERMIT,['function approve(address,address,uint160,uint48)'],user);
  for(const asset of [quote,token]){await sent('ERC20 approval',asset.approve(PERMIT,ethers.MaxUint256));await sent('Permit2 approval',permit.approve(asset.target,ROUTER,(1n<<160n)-1n,(1n<<48n)-1n));}
  const router=new ethers.Contract(ROUTER,['function execute(bytes,bytes[],uint256) payable'],user);
  function payload(buy,amount,recipient=wallet){
    const currencyIn=buy?USDG:tokenAddress,currencyOut=buy?tokenAddress:USDG;
    return coder.encode(['bytes','bytes[]'],['0x060b0e',[
      coder.encode([SWAP],[[key,key[0].toLowerCase()===currencyIn.toLowerCase(),amount,1n,0n,'0x']]),
      coder.encode(['address','uint256','bool'],[currencyIn,0,true]),
      coder.encode(['address','address','uint256'],[currencyOut,recipient,0])]]);
  }
  async function trade(label,inputs){const before=await quote.balanceOf(wallet);await sent(label,router.execute(inputs.length===1?'0x10':'0x1010',inputs,(await provider.getBlock('latest')).timestamp+600,{gasLimit:3000000}));observations.at(-1).diagnosticQuoteDelta=String((await quote.balanceOf(wallet))-before);}
  await trade('BUY before registration',[payload(true,1_000000n)]);
  await sent('register participant',registry.connect(user).register());
  await trade('BUY 99 USDG',[payload(true,99_000000n)]);
  await trade('BUY 1 USDG',[payload(true,1_000000n)]);
  await trade('SELL',[payload(false,(await token.balanceOf(wallet))/10n)]);
  await trade('payer differs from recipient',[payload(true,1_000000n,await other.getAddress())]);
  await trade('unsupported batch',[payload(true,1_000000n),payload(true,1_000000n)]);
  const sourceUrl=`https://sourcify.dev/server/v2/contract/4663/${ROUTER}?fields=all`;
  const response=await fetch(sourceUrl,{signal:AbortSignal.timeout(20000)});assert.ok(response.ok);
  const source=await response.json(),routerCode=await provider.getCode(ROUTER);
  // This deployment is reported as Sourcify "match", not "exact_match". Compilation
  // uses bytecodeHash=none. Preserve the status; still require fresh runtime equality.
  assert.ok(['match','exact_match'].includes(source.runtimeMatch));assert.equal(source.runtimeBytecode.onchainBytecode.toLowerCase(),routerCode.toLowerCase());
  const selected=['UniversalRouter.sol','Dispatcher.sol','Lock.sol','V4Router.sol','IV4Router.sol','V4SwapRouter.sol','BaseActionsRouter.sol','DeltaResolver.sol','ActionConstants.sol','Permit2Payments.sol'];
  const sources=[];
  for(const [file,v] of Object.entries(source.sources)){
    if(!selected.includes(file.split('/').at(-1)) || file.includes('v4-core/'))continue;
    const hash=ethers.keccak256(ethers.toUtf8Bytes(v.content));assert.equal(hash,source.metadata.sources[file].keccak256);
    const name=file.replaceAll('/','_');fs.writeFileSync(ROOT+'/sources/'+name,v.content);sources.push({source:file,file:'sources/'+name,keccak256:hash});
  }
  const latest=await rpc('eth_getBlockByNumber',['latest',false]);
  const blocks=[];
  for(let n=BigInt(forkBlock.number)+1n;n<=BigInt(latest.number);n++){
    const block=await rpc('eth_getBlockByNumber',['0x'+n.toString(16),true]);
    const transactions=[];
    for(const tx of block.transactions)transactions.push({tx,receipt:await rpc('eth_getTransactionReceipt',[tx.hash])});
    blocks.push({number:block.number,hash:block.hash,parentHash:block.parentHash,timestamp:block.timestamp,transactions});
  }
  const addresses={router:ROUTER,manager:MANAGER,token:tokenAddress,quote:USDG,registry:registry.target,hook:key[4]};
  const codeHashes={};for(const [name,address]of Object.entries(addresses))codeHashes[name]=ethers.keccak256(await provider.getCode(address));
  const data={schema:'pair-direct-buy-evidence-v1',mode:'local-fork-only',originChainId:4663,chainId:31337,forkBlock:{number:forkBlock.number,hash:forkBlock.hash},
    sourceVerification:{url:sourceUrl,runtimeMatch:source.runtimeMatch,compilation:source.compilation,sources},
    manifest:{schema:'direct-buy-v1',chainId:31337,...addresses,codeHashes,poolId:init.args.id,poolKey:key.map(String),quoteDecimals:6,entryThresholdRaw:'100000000',routeVersion:'rh-ur-10-060b0e-v1',anchor:{number:forkBlock.number,hash:forkBlock.hash}},
    sandboxFunding:{wallet,quote:USDG,amountRaw:'1000000000',storageSlot:fundedSlot},observations,blocks};
  fs.writeFileSync(ROOT+'/evidence.json',JSON.stringify(data,null,2)+'\n');console.log('Saved evidence',blocks.length,'blocks');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>proxy?.close());
