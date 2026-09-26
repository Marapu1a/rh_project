// Inject only read failures; signer sends/estimates/receipts keep the real local provider.
function callFault(provider,predicate,error){
  const original=provider.call;let hits=0;
  provider.call=async function(request,...args){
    if(predicate(request)){hits++;throw error;}
    return original.call(this,request,...args);
  };
  return {get hits(){return hits;},restore(){provider.call=original;}};
}
module.exports={callFault};
