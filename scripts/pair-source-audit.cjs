// Fetch verified public sources and bind their recorded runtime to a fresh read-only RPC snapshot.
const fs=require('node:fs');
const path=require('node:path');
const {keccak256,toUtf8Bytes,Interface}=require('ethers');
const ROOT='research/pair-source-audit';
const targets={
  locker:'0xefcf476e8870fb3eb8680f039414fdcce6c2a117',
  factory:'0x788ad4a211ceb310da07e8ef972fc1ef419c6cb7',
  handler:'0x8db10025017a30ab83a2a1a25e8871560357864f',
  registry:'0x34b34d3f409c562ff2d16f211f516e30695b3809',
  coordinator:'0xddc69cbfb38f3f24d23b980c9e156c62a431687b',
  hook:'0x438b86c71840c3b4df3f839aed6bb889e2d780c0',
  launchImplementation:'0x8000b64b62837a1511e302c62354e1bc39b5641a'
};
const selected=new Set(['PairV4Locker.sol','PairV5LaunchV2NativeFeeVaultV2.sol',
  'PairV5LaunchV2NativeFeeVaultFactoryV2.sol','PairV5LaunchV2NativeFeeModesV5.sol',
  'PairV5LaunchV2ModeRegistry.sol','PairV5LaunchV2NativeFeeCoordinator.sol',
  'PairV5LaunchV2NativeFeeHook.sol','PairLaunchpadV5Upgradeable.sol']);
async function main(){
  fs.mkdirSync(ROOT+'/sources',{recursive:true});
  const evidence={observedAt:new Date().toISOString(),rpc:'https://rpc.mainnet.chain.robinhood.com',contracts:{},reads:[]};
  let seq=0;
  async function rpc(method,params){
    if(!['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_call'].includes(method))throw Error('read-only');
    const response=await fetch(evidence.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++seq,method,params}),signal:AbortSignal.timeout(15000)});
    const j=await response.json();evidence.reads.push({method,params,response:j});
    if(j.error)throw Error(JSON.stringify(j.error));return j.result;
  }
  evidence.chain=await rpc('eth_chainId',[]);if(evidence.chain!=='0x1237')throw Error('wrong chain');
  evidence.block=await rpc('eth_blockNumber',[]);
  evidence.header=await rpc('eth_getBlockByNumber',[evidence.block,false]);
  const proxy='0x8660a7f019c7943b0b0a91b8e39aff3b6db6ae62';
  evidence.launchpadImplementationSlot=await rpc('eth_getStorageAt',[proxy,'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',evidence.block]);
  if(evidence.launchpadImplementationSlot.slice(-40)!==targets.launchImplementation.slice(2))throw Error('launchpad implementation changed');
  const proxyAbi=new Interface(['function launchV2Coordinator() view returns(address)']);
  evidence.launchpadCoordinator=await rpc('eth_call',[{to:proxy,data:proxyAbi.encodeFunctionData('launchV2Coordinator')},evidence.block]);
  const registryAbi=new Interface(['function activeLaunchV2ModeRegistry() view returns(address)','function launchV2ModeRegistry() view returns(address)']);
  evidence.launchpadRegistries={};
  for(const sig of ['activeLaunchV2ModeRegistry','launchV2ModeRegistry']){
    const raw=await rpc('eth_call',[{to:proxy,data:registryAbi.encodeFunctionData(sig)},evidence.block]);
    evidence.launchpadRegistries[sig]=registryAbi.decodeFunctionResult(sig,raw)[0];
  }
  const active=evidence.launchpadRegistries.activeLaunchV2ModeRegistry;
  evidence.selectedRegistry=/^0x0{40}$/i.test(active)?evidence.launchpadRegistries.launchV2ModeRegistry:active;
  if(evidence.selectedRegistry.toLowerCase()!==targets.registry)throw Error('canonical registry changed');
  const stored={};
  for(const [name,address] of Object.entries(targets)){
    const url=`https://sourcify.dev/server/v2/contract/4663/${address}?fields=all`;
    const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`${name}: ${response.status}`);
    const data=await response.json();const code=await rpc('eth_getCode',[address,evidence.block]);
    if(data.runtimeMatch!=='exact_match'||code.toLowerCase()!==data.runtimeBytecode.onchainBytecode.toLowerCase())throw Error(`${name}: runtime mismatch`);
    const row={address,url,runtimeMatch:data.runtimeMatch,verifiedAt:data.verifiedAt,
      runtimeCodeHash:keccak256(code),compilation:data.compilation,sources:[],getters:{}};
    for(const [source,value] of Object.entries(data.sources)){
      const name=path.posix.basename(source);if(!selected.has(name))continue;
      const hash=keccak256(toUtf8Bytes(value.content));
      if(hash!==data.metadata.sources[source].keccak256)throw Error(`source hash mismatch ${source}`);
      if(stored[name]&&stored[name]!==hash)throw Error(`conflicting source ${name}`);
      stored[name]=hash;fs.writeFileSync(ROOT+'/sources/'+name,value.content);
      row.sources.push({source,file:'sources/'+name,keccak256:hash});
    }
    const abi=new Interface(data.abi);
    for(const sig of ['coordinator()','vaultFactory()','modeRegistry()','launchV2Coordinator()','currentCoordinator()','currentHandler(uint32)']){
      if(!abi.getFunction(sig))continue;
      try{row.getters[sig]=await rpc('eth_call',[{to:address,data:abi.encodeFunctionData(sig,sig.includes('uint32')?[1]:[])},evidence.block]);}
      catch(e){row.getters[sig]={error:e.message};}
    }
    evidence.contracts[name]=row;console.log(name,'runtime matched',row.runtimeCodeHash);
  }
  evidence.limitations=['Sourcify exact-match attestation and fresh RPC runtime equality; no independent solc rebuild.',
    'VaultV2 source is authenticated through verified factory creation code; no future project vault exists yet.',
    'This is a pinned graph candidate, not proof of all current launch readiness or full dependencies.',
    'Historical public vault 0xd1ade... has no Sourcify match from prior request; do not identify it as this V2.'];
  fs.writeFileSync(ROOT+'/manifest.json',JSON.stringify(evidence,null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1});
