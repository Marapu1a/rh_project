// A read-only plan can be reused until an attempted transaction changes state.
// No reuse across polls; a later poll always observes fresh chain data.
const ACTIONS=['pull','sync','pay-prizes','pay-ops','pay-team','sweep','pull','pay-prizes','pay-ops','pay-team'];
async function runFundingPass({loadPlan,send,results=[]}){
 let plan=null;
 for(const action of ACTIONS){
  plan??=await loadPlan();const a=plan.actions[action];
  if(a?.status!=='ready'){results.push({action,status:a?.status||'unavailable'});continue;}
  try{await send(a.method,a.args||[]);}
  catch(e){if(!e.definiteRejection)throw e;results.push({action,status:'reverted'});}
  finally{plan=null;}
 }
 return results;
}
module.exports={runFundingPass};
