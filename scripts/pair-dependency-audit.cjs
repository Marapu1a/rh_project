// Read-only evidence collector. Candidates are NOT asserted to be the active launch release.
const fs=require('node:fs');
const {id,keccak256,toBeHex}=require('ethers');
const RPC=process.env.RH_RPC_URL||'https://rpc.mainnet.chain.robinhood.com';
const targets={
  launchpad:'0x8660a7f019c7943b0b0a91b8e39aff3b6db6ae62',
  implementationSept12:'0x8000b64b62837a1511e302c62354e1bc39b5641a',
  docsLocker:'0xefcf476e8870fb3eb8680f039414fdcce6c2a117',
  docsHook:'0x16d1560630ce74af4478d9b8ad46548a092a2000',
  coordinatorSept12:'0xddc69cbfb38f3f24d23b980c9e156c62a431687b',
  registrySept12:'0x34b34d3f409c562ff2d16f211f516e30695b3809',
  nativeHookSept12:'0x438b86c71840c3b4df3f839aed6bb889e2d780c0',
  coordinatorFrontendCandidate:'0x481a0da17707c30fe1cd633f57d5a22c2ce68515',
  registryFrontendCandidate:'0x8e1bff2008ac5ac7c662a11a706a852610d98738',
  historicalPublicVault:'0xd1adef92714bfa5e0f59dd48479bcf9a5ee77c01'
};
const methods=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_call']);
async function main(){
  let requestId=0;
  const evidence={observedAt:new Date().toISOString(),scope:'read-only; no signatures or public transactions',rpc:RPC,reads:[],contracts:{},http:[]};
  async function rpc(method,params){
    if(!methods.has(method))throw Error('read-only methods only');
    try{
      const r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++requestId,method,params}),signal:AbortSignal.timeout(12000)});
      const j=await r.json();evidence.reads.push({method,params,httpStatus:r.status,response:j});
      return j.error?{error:j.error}:j.result;
    }catch(e){const error={error:e.message};evidence.reads.push({method,params,...error});return error;}
  }
  evidence.chain=await rpc('eth_chainId',[]);
  if(evidence.chain!=='0x1237')throw Error('expected chain 4663');
  const block=await rpc('eth_blockNumber',[]);
  if(typeof block!=='string')throw Error('block unavailable');
  evidence.block=block;evidence.blockHeader=await rpc('eth_getBlockByNumber',[block,false]);
  const slots=Object.fromEntries(['implementation','admin','beacon'].map(n=>[n,toBeHex(BigInt(id(`eip1967.proxy.${n}`))-1n,32)]));
  for(const [name,address] of Object.entries(targets)){
    const code=await rpc('eth_getCode',[address,block]);
    const row={address,codeHash:typeof code==='string'?keccak256(code):null,codeBytes:typeof code==='string'?(code.length-2)/2:null,slots:{},getters:{}};
    for(const [key,slot] of Object.entries(slots))row.slots[key]=await rpc('eth_getStorageAt',[address,slot,block]);
    for(const sig of ['owner()','epoch()','projectToken()','registrar()','modeRegistry()','locker()'])row.getters[sig]=await rpc('eth_call',[{to:address,data:id(sig).slice(0,10)},block]);
    evidence.contracts[name]=row;
    console.log(name,row.codeBytes,row.slots.implementation);
  }
  for(const path of ['/api/quote-assets/launch-readiness','/api/launches/native-fee-v2-readiness','/api/v5-v2/native-fee/consumer-live','/api/v5-v2/standard-route/consumer-live']){
    const url='https://pair.fund'+path;
    try{const r=await fetch(url,{signal:AbortSignal.timeout(12000)});const body=await r.text();let data;try{data=JSON.parse(body)}catch{data=body.slice(0,300)}evidence.http.push({url,status:r.status,data});}
    catch(e){evidence.http.push({url,error:e.message});}
  }
  fs.writeFileSync('research/pair-dependency-audit-2026-09-15.json',JSON.stringify(evidence,null,2)+'\n');
  console.log('saved evidence at block',block);
}
main().catch(e=>{console.error(e);process.exitCode=1});
