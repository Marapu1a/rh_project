// Compatibility entrypoint for existing local Short commands.
const {main}=require('./run-local-promo.cjs');
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
