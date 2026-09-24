const fs=require('node:fs'),{ethers}=require('ethers'),{scan}=require('./replay-direct-buy.cjs');
const {canonical,hash}=require('./direct-buy.cjs'),{buildFromHistory,verifyPublication}=require('./monthly-dataset.cjs');
async function main(){
  const options={},args=process.argv.slice(2);
  for(let i=0;i<args.length;i+=2){
    if(!['--input','--rpc','--publication','--output'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('Invalid arguments');
    options[args[i]]=args[i+1];
  }
  if(!options['--input']||!options['--output'])throw Error('Required --input FILE --output FILE [--rpc URL --publication yes]');
  const input=JSON.parse(fs.readFileSync(options['--input'],'utf8'));
  let policyStatus={mode:'unadmitted',reason:'Offline evidence; no source admission'};
  if(options['--rpc']){
    const policyProvider=new ethers.JsonRpcProvider(options['--rpc']);
    try{const resolved=await require('./buy-policy-runtime.cjs').resolveBuyPolicy(input,(m,p)=>policyProvider.send(m,p),Number(input.request.cutoff));input.manifest=resolved.manifest;policyStatus=resolved.policyStatus;}finally{policyProvider.destroy();}
    input.blocks=(await scan(input.manifest,options['--rpc'],String(input.request.cutoff),input.lifecycle)).blocks;
  }
  const artifact=buildFromHistory(input),domain=artifact.snapshot?.domain||artifact.domain;let publication=null;
  const provider=options['--rpc']?new ethers.JsonRpcProvider(options['--rpc']):null;
  if(provider){
    await require('./dual-bindings.cjs').verifyDualBindings(provider,domain);
    await require('./short-dataset.cjs').verifyEpochGenesis(provider,domain.source,domain);
  }
  if(options['--publication']){
    if(options['--publication']!=='yes'||!provider||artifact.schema==='monthly-empty-epoch-artifact-v1')throw Error('Publication requires RPC and nonempty dataset');
    const compiled=JSON.parse(fs.readFileSync('artifacts/compiled.json','utf8'));
    publication=await verifyPublication(provider,new ethers.Contract(domain.monthlySource,compiled.MonthlySettlementFixture.abi,provider),artifact);
  }
  const nextAction=artifact.schema==='monthly-empty-epoch-artifact-v1'
    ?{method:'closeEmpty',args:[artifact.cutoff.blockNumber,artifact.cutoff.blockHash,artifact.snapshotHash]}:null;
  fs.writeFileSync(options['--output'],canonical({artifact,artifactHash:hash(artifact),publication,nextAction,policyStatus,
    provenance:provider?'Selected RPC; finality not certified':'Offline evidence; authenticity not certified'})+'\n');
  console.log('Monthly artifact verified and written');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
