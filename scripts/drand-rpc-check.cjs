// Read-only remote EVM execution via state overrides; NOT a deployed transaction.
const fs=require('node:fs'),{ethers}=require('ethers');
const {compile,root}=require('./drand-feasibility.cjs');
const {beacon}=require('../research/drand-feasibility/vector.json');
async function main(){
  const {artifact,meta}=compile(),abi=new ethers.Interface(artifact.abi);
  const target='0x0000000000000000000000000000000000001234';
  const overrides={[target]:{code:'0x'+artifact.evm.deployedBytecode.object}};
  const observations=[];
  for(const [chainId,url]of [[4663,'https://rpc.mainnet.chain.robinhood.com'],[46630,'https://rpc.testnet.chain.robinhood.com']]){
    const o={chainId,url};observations.push(o);
    const rpc=async(method,params=[])=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();if(j.error)throw Error(JSON.stringify(j.error));return j.result;};
    try{
      if(Number(BigInt(await rpc('eth_chainId')))!==chainId)throw Error('Chain mismatch');
      const b=await rpc('eth_getBlockByNumber',['latest',false]);o.block={number:b.number,hash:b.hash,timestamp:b.timestamp};
      const call=async(method,args)=>{const data=abi.encodeFunctionData(method,args);
        return abi.decodeFunctionResult(method,await rpc('eth_call',[{to:target,data,gas:'0x1e8480'},b.number,overrides]))[0];};
      const sig='0x'+beacon.signature;
      o.valid=await call('verify',[beacon.round,sig]);
      o.wrongRound=await call('verify',[beacon.round+1,sig]);
      o.proveResult=await call('prove',[beacon.round,sig]);
      if(o.valid!==true||o.wrongRound!==false||o.proveResult!=='0x'+beacon.randomness)throw Error('Unexpected verification result');
      try{o.estimateGas=String(BigInt(await rpc('eth_estimateGas',[{to:target,data:abi.encodeFunctionData('prove',[beacon.round,sig])},b.number,overrides])));}
      catch(e){o.estimateError=e.message;}
      if((await rpc('eth_getBlockByNumber',[b.number,false])).hash!==b.hash)throw Error('Block changed');
      o.passed=true;
    }catch(e){o.error=e.message;o.passed=false;}
  }
  const result={schema:'drand-rpc-state-override-v1',checkedAt:new Date().toISOString(),runtimeHash:ethers.keccak256('0x'+artifact.evm.deployedBytecode.object),
    ...meta,observations,limitations:['Public RPC state override simulation; no contract deployed, no transaction sent',
      'Not independent RPC consensus, finality evidence, audit, or production readiness','eth_estimateGas is not a paid receipt']};
  fs.writeFileSync(root+'/rpc-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
  if(observations.some(o=>!o.passed))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
