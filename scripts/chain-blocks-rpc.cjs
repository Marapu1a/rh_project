// Public read-only EVM simulation; no signing/deployment/state changes.
const fs=require('node:fs'),solc=require('solc'),{ethers}=require('ethers');
const names=['contracts/ChainBlocks.sol','test/contracts/ChainBlocksFixture.sol'];
async function main(){
  const sources=Object.fromEntries(names.map(n=>[n,{content:fs.readFileSync(n,'utf8')}]));
  const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',
    outputSelection:{'*':{'*':['abi','evm.deployedBytecode.object']}}}})));
  if((out.errors||[]).some(e=>e.severity==='error'))throw Error(JSON.stringify(out.errors));
  const a=out.contracts[names[1]].ChainBlocksFixture,abi=new ethers.Interface(a.abi),target='0x0000000000000000000000000000000000001234';
  const override={[target]:{code:'0x'+a.evm.deployedBytecode.object}},rows=[];
  for(const [chainId,url]of [[4663,'https://rpc.mainnet.chain.robinhood.com'],[46630,'https://rpc.testnet.chain.robinhood.com']]){
    const row={chainId,url};rows.push(row);
    const rpc=async(method,params=[])=>{const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('HTTP '+response.status);const j=await response.json();if(j.error)throw Error(JSON.stringify(j.error));return j.result;};
    try{
      if(Number(BigInt(await rpc('eth_chainId')))!==chainId)throw Error('Chain mismatch');
      const b=await rpc('eth_getBlockByNumber',['latest',false]),height=BigInt(b.number);
      row.block={number:b.number,hash:b.hash};row.samples=[];
      for(const age of [0,1,256,257,-1]){
        const n=height-BigInt(age),raw=await rpc('eth_call',[{to:target,data:abi.encodeFunctionData('read',[n])},b.number,override]);
        const v=abi.decodeFunctionResult('read',raw),expected=age>=1&&age<=256?(await rpc('eth_getBlockByNumber',[ethers.toQuantity(n),false])).hash:ethers.ZeroHash;
        row.samples.push({age,number:n.toString(),nativeNumber:v[0].toString(),l2Number:v[1].toString(),nativeHash:v[2],l2Hash:v[3],expectedHash:expected});
        if(v[1]!==height||v[3]!==expected||v[0]===height)throw Error('Identity mismatch');
      }
      if((await rpc('eth_getBlockByNumber',[b.number,false])).hash!==b.hash)throw Error('Pinned block changed');
      row.passed=true;
    }catch(e){row.passed=false;row.error=e.message;}
  }
  const report={schema:'robinhood-chain-blocks-v1',checkedAt:new Date().toISOString(),compiler:solc.version(),rows,
    sourceHashes:Object.fromEntries(names.map(n=>[n,ethers.keccak256(ethers.toUtf8Bytes(sources[n].content.replace(/\r\n/g,'\n')))])),
    limitations:['eth_call with probe code override, no public deployment','One RPC per chain; not finality proof','256 recent completed L2 blocks only']};
  fs.mkdirSync('research/chain-blocks',{recursive:true});fs.writeFileSync('research/chain-blocks/rpc-result.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));if(rows.some(r=>!r.passed))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
