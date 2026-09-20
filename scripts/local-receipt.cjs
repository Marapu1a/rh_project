// Shared bounded receipt wait. A stopped/timed-out wait does NOT cancel a tx.
function stopped(tx){
  const error=new Error('Stopped after broadcast; transaction may still confirm: '+tx.hash);
  error.code='LOCAL_EXECUTION_STOPPED';error.transactionHash=tx.hash;return error;
}
async function waitLocalReceipt(tx,{signal,receiptTimeoutMs=30000}={}){
  if(signal?.aborted)throw stopped(tx);
  let abort;
  try{
    const confirmation=tx.wait(1,receiptTimeoutMs);
    const receipt=await (signal?Promise.race([confirmation,new Promise((_,reject)=>{
      abort=()=>reject(stopped(tx));signal.addEventListener('abort',abort,{once:true});
      if(signal.aborted)abort();
    })]):confirmation);
    if(!receipt||receipt.status!==1){const error=new Error('Transaction not confirmed: '+tx.hash);error.receipt=receipt;throw error;}
    return receipt;
  }catch(error){
    if(error.code==='TIMEOUT'){
      const timeout=new Error('Receipt timeout; inspect the same transaction before retrying: '+tx.hash);
      timeout.code='LOCAL_RECEIPT_TIMEOUT';timeout.transactionHash=tx.hash;throw timeout;
    }
    throw error;
  }finally{if(abort)signal.removeEventListener('abort',abort);}
}
function receiptOptions(timeout){
  if(!Number.isInteger(timeout)||timeout<1||timeout>300000)throw Error('Invalid receipt timeout');
}
// Only this explicit read-only estimate or a receipt for the original tx proves rollback.
async function sendLocalTransaction(method,args,overrides,options={}){
  let stage='estimate',tx;
  try{
    const gasLimit=await method.estimateGas(...args,overrides);
    if(options.signal?.aborted){const e=new Error('Stopped before broadcast');e.code='LOCAL_EXECUTION_STOPPED';throw e;}
    stage='broadcast';tx=await method(...args,{...overrides,gasLimit});
    stage='confirm';const receipt=await waitLocalReceipt(tx,options);
    return receipt;
  }catch(cause){
    const error=new Error(cause.shortMessage||cause.message,{cause});
    error.code=cause.code;error.stage=stage;
    error.transactionHash=tx?.hash||cause.transactionHash;
    error.definiteRejection=(stage==='estimate'&&cause.code==='CALL_EXCEPTION')||
      (stage==='confirm'&&cause.code!=='TRANSACTION_REPLACED'&&cause.receipt?.status===0&&
        typeof tx?.hash==='string'&&cause.receipt.hash===tx.hash);
    throw error;
  }
}
module.exports={waitLocalReceipt,receiptOptions,sendLocalTransaction};
