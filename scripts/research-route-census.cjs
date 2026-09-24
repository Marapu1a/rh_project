// Read-only bounded evidence sampler. Input is a saved failed census or this tool's output.
// Never treat manager Swap.sender as the final buyer. Stops on first RPC error.
const fs=require('node:fs'),{AbiCoder}=require('ethers');
const {SWAP_ABI,EXECUTE_ABI}=require('./direct-buy.cjs');
const RPC='https://rpc.mainnet.chain.robinhood.com';
const MANAGER='0x8366a39cc670b4001a1121b8f6a443a643e40951';
const ROUTER='0x8876789976decbfcbbbe364623c63652db8c0904';
async function main(){
 const [input,out]=process.argv.slice(2);
 if(!input||!out||fs.existsSync(out))throw Error('Usage: INPUT.json NEW_OUTPUT.json');
 const old=JSON.parse(fs.readFileSync(input,'utf8'));
 const row=old.reads.find(r=>r.method==='eth_getLogs'&&r.params[0].address.toLowerCase()===MANAGER&&r.params[0].topics.length===1&&Array.isArray(r.response?.result));
 const logs=old.logs||row?.response.result,query=old.logQuery||row?.params[0];
 if(old.rpc!==RPC||!logs||!query)throw Error('Missing bounded log response');
 const e={schema:'route-observation-v1',rpc:RPC,observedAt:new Date().toISOString(),anchor:old.anchor||old.header,logQuery:query,logs,reads:[],samples:[],provenance:'Reuses bounded logs only; failed historical/init queries excluded'};
 async function rpc(method,params){
  if(!['eth_chainId','eth_getBlockByNumber','eth_getTransactionByHash','eth_getTransactionReceipt'].includes(method))throw Error('Read-only');
  await new Promise(r=>setTimeout(r,1200));
  const row={method,params};e.reads.push(row);
  const response=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:e.reads.length,method,params}),signal:AbortSignal.timeout(30000)});
  row.status=response.status;row.response=await response.json();
  if(!response.ok||row.response.error)throw Error(JSON.stringify(row.response));return row.response.result;
 }
 try{
  if(await rpc('eth_chainId',[])!=='0x1237')throw Error('Wrong chain');
  e.startHeader=await rpc('eth_getBlockByNumber',[query.fromBlock,false]);
  const senders=new Map();
  for(const l of logs){const s=SWAP_ABI.parseLog(l).args.sender.toLowerCase();if(!senders.has(s))senders.set(s,[]);senders.get(s).push(l.transactionHash);}
  e.senders=[...senders].map(([sender,hs])=>({sender,swaps:hs.length,transactions:new Set(hs).size})).sort((a,b)=>b.swaps-a.swaps);
  const hs=[...new Set(logs.map(l=>l.transactionHash))];
  e.counts={swaps:logs.length,transactions:hs.length,pools:new Set(logs.map(l=>l.topics[1])).size};
  e.selection={method:'First two unique tx for each of four leading Swap.sender addresses plus four evenly spaced tx; deduplicated. Not a frequency estimate.',hashes:[...new Set([...e.senders.slice(0,4).flatMap(s=>[...new Set(senders.get(s.sender))].slice(0,2)),...[0,1,2,3].map(i=>hs[Math.floor(i*(hs.length-1)/3)]).filter(Boolean)])]};
  for(const hash of e.selection.hashes){
   const tx=await rpc('eth_getTransactionByHash',[hash]),receipt=await rpc('eth_getTransactionReceipt',[hash]);
   const header=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]);
   if(tx.hash!==hash||receipt.transactionHash!==hash||tx.blockHash!==receipt.blockHash||header.hash!==receipt.blockHash)throw Error('Header mismatch');
   let commands=null,actions=[];
   if(tx.to?.toLowerCase()===ROUTER){try{const p=EXECUTE_ABI.parseTransaction({data:tx.input});commands=p.args.commands;for(let i=0;i<p.args.inputs.length;i++)if((parseInt(commands.slice(2+i*2,4+i*2),16)&0x7f)===0x10)actions.push(AbiCoder.defaultAbiCoder().decode(['bytes','bytes[]'],p.args.inputs[i])[0]);}catch{actions.push('undecoded');}}
   e.samples.push({hash,to:tx.to,from:tx.from,selector:tx.input.slice(0,10),commands,actions,canonical:true,status:receipt.status,managerSwaps:receipt.logs.filter(l=>l.address.toLowerCase()===MANAGER&&l.topics[0]===SWAP_ABI.getEvent('Swap').topicHash).length});
  }
  e.anchorStable=(await rpc('eth_getBlockByNumber',[e.anchor.number,false])).hash===e.anchor.hash;if(!e.anchorStable)throw Error('Anchor changed');
 }catch(error){e.error=error.message;process.exitCode=1;}
 finally{fs.writeFileSync(out,JSON.stringify(e,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({counts:e.counts,samples:e.samples,error:e.error,anchorStable:e.anchorStable},null,2));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
