// Discover third-party native-fee TOKEN/USDG reference pools. Public reads only.
const fs=require('node:fs'),{Interface,zeroPadValue,keccak256}=require('ethers');
const RPC='https://rpc.mainnet.chain.robinhood.com';
const coordinator='0xddc69cbfb38f3f24d23b980c9e156c62a431687b';
const quote='0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const events=new Interface(['event CanonicalPoolLaunched(address indexed project,address indexed vault,address indexed quote,bytes32 poolId,uint16 weightBps,uint32 modeId,uint256 modeVersion,address handler)']);
const vaultAbi=new Interface(['function projectToken() view returns(address)','function epoch() view returns(uint64)',
 'function modeId() view returns(uint32)','function positionCount() view returns(uint256)',
 'function positionIdAt(uint256) view returns(uint256)','function positions(uint256) view returns(bool,address,bytes32)',
 'function epochRecipientCount(uint64) view returns(uint256)','function epochRecipient(uint64,uint256) view returns(address,uint16)',
 'function claimable(uint64,address,address) view returns(uint256)','function positionManager() view returns(address)']);
async function main(){
 const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('New output path required');
 const e={observedAt:new Date().toISOString(),rpc:RPC,coordinator,quote,reads:[],candidates:[]};let seq=0;
 const allowed=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getLogs','eth_getCode','eth_call']);
 async function read(method,params=[]){if(!allowed.has(method))throw Error('read-only');
  const row={method,params};e.reads.push(row);
  try{const r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++seq,method,params}),signal:AbortSignal.timeout(20000)});
   row.status=r.status;row.response=await r.json();if(row.response.error)throw Error(JSON.stringify(row.response.error));return row.response.result;
  }catch(error){row.error=error.message;throw error;}
 }
 async function call(address,name,args=[]){const raw=await read('eth_call',[{to:address,data:vaultAbi.encodeFunctionData(name,args)},e.block]);return vaultAbi.decodeFunctionResult(name,raw);}
 const clean=v=>JSON.parse(JSON.stringify(v,(_,v)=>typeof v==='bigint'?v.toString():v));
 try{
  if(await read('eth_chainId')!=='0x1237')throw Error('Wrong network');
  e.block=await read('eth_blockNumber');e.header=await read('eth_getBlockByNumber',[e.block,false]);
  // Indexed quote + coordinator strongly narrows this all-history event query.
  const logs=await read('eth_getLogs',[{address:coordinator,fromBlock:'0x0',toBlock:e.block,
   topics:[events.getEvent('CanonicalPoolLaunched').topicHash,null,null,zeroPadValue(quote,32)]}]);
  e.launches=logs.map(log=>({...clean(events.parseLog(log).args.toObject()),blockNumber:log.blockNumber,blockHash:log.blockHash,transactionHash:log.transactionHash}));
  for(const launch of e.launches.filter(l=>l.modeId==='1').slice(-6).reverse()){
   const c={launch};e.candidates.push(c);
   try{
    const v=launch.vault;c.codeHash=keccak256(await read('eth_getCode',[v,e.block]));
    c.projectToken=(await call(v,'projectToken'))[0];c.epoch=String((await call(v,'epoch'))[0]);
    c.modeId=String((await call(v,'modeId'))[0]);c.positionManager=(await call(v,'positionManager'))[0];
    c.positions=[];const count=Number((await call(v,'positionCount'))[0]);
    for(let i=0;i<Math.min(count,8);i++){const id=(await call(v,'positionIdAt',[i]))[0];c.positions.push({id:String(id),data:clean(await call(v,'positions',[id]))});}
    c.recipients=[];const countR=Number((await call(v,'epochRecipientCount',[c.epoch]))[0]);
    for(let i=0;i<Math.min(countR,8);i++){const [recipient,bps]=await call(v,'epochRecipient',[c.epoch,i]);
     c.recipients.push({recipient,bps:String(bps),tokenDue:String((await call(v,'claimable',[c.epoch,recipient,c.projectToken]))[0]),quoteDue:String((await call(v,'claimable',[c.epoch,recipient,quote]))[0])});}
   }catch(error){c.error=error.message;}
  }
  e.anchorStable=(await read('eth_getBlockByNumber',[e.block,false])).hash===e.header.hash;
 }catch(error){e.error=error.message;process.exitCode=1;}
 finally{fs.writeFileSync(out,JSON.stringify(e,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,error:e.error,launches:e.launches?.length,candidates:e.candidates}));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
