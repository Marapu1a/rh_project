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
    if(!receipt||receipt.status!==1)throw Error('Transaction not confirmed: '+tx.hash);
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
module.exports={waitLocalReceipt,receiptOptions};
