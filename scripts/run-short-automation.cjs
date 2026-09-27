const {main}=require('./run-promo-automation.cjs');
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({status:'error',message:e.message,code:e.code}));process.exitCode=1;});
module.exports={main};
