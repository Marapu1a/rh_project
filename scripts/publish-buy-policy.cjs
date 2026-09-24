const {ABI,loadBuyPolicy}=require('./buy-policy-admission.cjs');
const {canonical,hash,buyPolicyHistory}=require('./direct-buy.cjs');
async function prepareBuyPolicy({trust,genesis,next,rpc}){
 const admission=await loadBuyPolicy({trust,genesis,rpc});
 const previous=admission.history.versions.at(-1).manifest;
 const head=await rpc('eth_getBlockByNumber',['latest',false]);
 const height=Number(BigInt(head.number));
 const added=next.routes?.slice(previous.routes?.length??1);
 if(!added?.length)throw Error('No added routes');
 const fromBlock=added[0].fromBlock;
 if(fromBlock-height<=trust.noticeBlocks)throw Error('Insufficient publication mining margin');
 const history=structuredClone(admission.history);
 history.versions.push({manifest:next,fromBlock,announcedAtBlock:height,announcedBlockHash:head.hash});
 buyPolicyHistory(history);
 const data=ABI.encodeFunctionData('announce',[hash(previous),hash(next),fromBlock,canonical(next)]);
 const request={from:trust.publisher,to:trust.source,data,value:'0x0'};
 // Exact bytes, checked against current source state and immutable publisher.
 await rpc('eth_call',[request,'latest']);
 const gas=await rpc('eth_estimateGas',[request]);
 return {schema:'buy-policy-publication-v1',trustHash:hash(trust),previousHash:hash(previous),nextHash:hash(next),fromBlock,request,estimatedGas:gas,checkpoint:admission.checkpoint};
}
// No automatic retry on send errors. Caller retains intent and reconciles nonce/hash.
async function publishBuyPolicy({trust,genesis,next,signer,persist,rpc}){
 if(typeof persist!=='function')throw Error('Durable publication journal required');
 if((await signer.getAddress()).toLowerCase()!==trust.publisher.toLowerCase())throw Error('Use the configured publisher wallet; contract wallets submit prepared calldata');
 const prepared=await prepareBuyPolicy({trust,genesis,next,rpc});
 const nonce=await signer.getNonce('pending');
 const intent={...prepared,nonce,status:'prepared'};await persist(intent);
 let tx;
 try{tx=await signer.sendTransaction({...prepared.request,nonce});}
 catch(error){await persist({...intent,status:'send-unknown',error:String(error.message)});throw error;}
 await persist({...intent,status:'broadcast',transactionHash:tx.hash});
 return tx;
}
module.exports={prepareBuyPolicy,publishBuyPolicy};
