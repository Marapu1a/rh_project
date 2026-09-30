// Read-only source check. Does not construct/sign/send transactions or approve launch settings.
const fs=require('node:fs'),path=require('node:path');
const {Interface,keccak256,isHexString}=require('ethers');
const {httpRpc}=require('./public-rpc-qualification.cjs');
const PROXY='0xB0D389250c61c69EcCD5d986fC8482CBfA5418C4';
const SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
function inputs(){
 const source=n=>JSON.parse(fs.readFileSync(path.join(__dirname,'../research/infinity-source-audit',n+'.json'),'utf8'));
 const quote=JSON.parse(fs.readFileSync(path.join(__dirname,'../config/robinhood-launch-plan.json'),'utf8')).contracts.quote;
 return {proxy:PROXY,sources:Object.fromEntries(['launch','engine','hook','adapter'].map(n=>[n,source(n)])),quote};
}
async function inspect({rpc,expected=inputs()}){
 const out={schema:'launch-source-preflight-v1',observedAt:new Date().toISOString(),checks:[],values:{},publicLaunchReady:false,authorizationToSend:false};
 async function check(name,read,predicate=()=>true){try{const value=await read();const ok=!!predicate(value);out.checks.push({name,ok,...(!ok?{reason:'mismatch'}:{})});return value;}catch{out.checks.push({name,ok:false,reason:'readFailed'});return null;}}
 const chain=await check('chainId',()=>rpc('eth_chainId',[]),v=>BigInt(v)===4663n);
 if(chain===null||BigInt(chain)!==4663n){out.matched=false;return out;}
 const head=await check('head',()=>rpc('eth_getBlockByNumber',['latest',false]),v=>v&&isHexString(v.hash,32)&&/^0x[0-9a-f]+$/i.test(v.number));
 if(!head||!out.checks.at(-1).ok){out.matched=false;return out;}
 const tag=head.number;out.block={number:tag,hash:head.hash,timestamp:head.timestamp};
 const read=async(address,signature,args=[])=>{const abi=new Interface([signature]),fn=abi.fragments[0];return abi.decodeFunctionResult(fn,await rpc('eth_call',[{to:address,data:abi.encodeFunctionData(fn,args)},tag]))[0];};
 await Promise.all(Object.entries(expected.sources).map(([name,s])=>check(name+'Runtime',()=>rpc('eth_getCode',[s.address,tag]),code=>code!=='0x'&&keccak256(code)===s.onchainBytecodeHash)));
 await check('quoteRuntime',()=>rpc('eth_getCode',[expected.quote.address,tag]),code=>code!=='0x'&&keccak256(code)===expected.quote.codeHash);
 await check('launchImplementation',()=>rpc('eth_getStorageAt',[expected.proxy,SLOT,tag]),v=>isHexString(v,32)&&v.slice(-40).toLowerCase()===expected.sources.launch.address.slice(2).toLowerCase());
 await check('engineLaunchpad',()=>read(expected.sources.engine.address,'function launchpad() view returns(address)'),v=>v.toLowerCase()===expected.proxy.toLowerCase());
 await check('engineAdmission',()=>read(expected.sources.engine.address,'function validateLaunchpad(address) view returns(bool)',[expected.proxy]),v=>v===true);
 const decimals=await check('quoteDecimals',()=>read(expected.quote.address,'function decimals() view returns(uint8)'),v=>Number(v)===expected.quote.decimals);
 out.values.quoteDecimals=decimals===null?null:Number(decimals);
 for(const name of ['launchFee','TOTAL_SUPPLY','protectionBlocks']){
  const value=await check(name,()=>read(expected.proxy,`function ${name}() view returns(uint256)`));out.values[name]=value===null?null:String(value);
 }
 const gas=await check('gasPrice',()=>rpc('eth_gasPrice',[]),v=>/^0x[0-9a-f]+$/i.test(v));out.values.gasPriceWei=gas===null?null:String(BigInt(gas));
 await check('blockUnchanged',()=>rpc('eth_getBlockByNumber',[tag,false]),v=>v?.hash===head.hash);
 out.matched=out.checks.every(c=>c.ok);
 out.limitation='Pinned source sample only; gasPrice is not a deployment estimate. No opening price, archive qualification, project deployment, custody or execution authorization.';
 return out;
}
if(require.main===module)(async()=>{
 const file=process.argv[2];if(!file||fs.existsSync(file))throw Error('New output path required');
 const rpc=httpRpc(process.env.RH_RPC_URL||'https://rpc.mainnet.chain.robinhood.com');
 const out=await inspect({rpc});fs.writeFileSync(file,JSON.stringify(out,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({matched:out.matched,failed:out.checks.filter(c=>!c.ok).map(c=>c.name),values:out.values,authorizationToSend:false}));
})().catch(()=>{console.error('Source preflight failed; no transactions sent');process.exitCode=1;});
module.exports={inspect,inputs};
