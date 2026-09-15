// Read-only bounded observation. Never calls sendTransaction/sendRawTransaction.
const fs=require('node:fs');
const {ethers}=require('ethers');
const endpoints=['https://rpc.mainnet.chain.robinhood.com','https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public'];
const abi=new ethers.Interface([
  'function getGasAccountingParams() view returns (uint256,uint256,uint256)',
  'function getMaxTxGasLimit() view returns (uint256)',
  'function getL1BaseFeeEstimate() view returns (uint256)',
  'function arbOSVersion() view returns (uint256)'
]);
async function main(){
  const report={schema:'short-scaling-rpc-v1',observedAt:new Date().toISOString(),methods:'read-only; no mempool submission',providers:[]};
  let commonBlock;
  for(const url of endpoints){
    const calls=[];
    async function rpc(method,params){
      const item={method,params};
      // Avoid duplicating large synthetic calldata in the report.
      if(method==='eth_estimateGas')item.params=[{...params[0],data:`<${(params[0].data.length-2)/2} bytes: repeated 0x11>`},...params.slice(1)];
      try{const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
        item.httpStatus=response.status;item.response=await response.json();
      }catch(error){item.error=error.message;}
      calls.push(item);return item.response?.result;
    }
    const chain=await rpc('eth_chainId',[]),latest=await rpc('eth_getBlockByNumber',['latest',false]);
    if(!commonBlock&&latest)commonBlock=latest.number;
    const pinned=commonBlock?await rpc('eth_getBlockByNumber',[commonBlock,false]):null;
    const decoded={};
    if(pinned){
      for(const name of ['getGasAccountingParams','getMaxTxGasLimit','getL1BaseFeeEstimate','arbOSVersion']){
        const data=await rpc('eth_call',[{to:name==='arbOSVersion'?'0x0000000000000000000000000000000000000064':'0x000000000000000000000000000000000000006c',data:abi.encodeFunctionData(name)},commonBlock]);
        if(data)try{decoded[name]=Array.from(abi.decodeFunctionResult(name,data),String);}catch(e){decoded[name]={decodeError:e.message};}
      }
      for(let i=1;i<=4;i++)await rpc('eth_getBlockByNumber',[ethers.toQuantity(BigInt(commonBlock)-BigInt(i)),false]);
      for(const bytes of [6276,96132,192132])await rpc('eth_estimateGas',[{to:'0x000000000000000000000000000000000000dEaD',data:'0x'+'11'.repeat(bytes)},commonBlock]);
    }
    report.providers.push({url,chain,commonBlock,commonBlockHash:pinned?.hash,decoded,calls});
    console.log(url,JSON.stringify(decoded));
  }
  fs.writeFileSync('research/short-scaling-rpc.json',JSON.stringify(report,null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
