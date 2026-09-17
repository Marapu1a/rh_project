// Input: {manifest,lifecycle,request,rules,weights,minimumUnit}; optional blocks
// are offline evidence, never a claim of independent chain authenticity.
const fs=require('node:fs');
const {ethers}=require('ethers');
const {scan}=require('./replay-direct-buy.cjs');
const {canonical,hash}=require('./direct-buy.cjs');
const {buildFromHistory,verifyPublication,verifyEpochGenesis}=require('./short-dataset.cjs');
async function main(){
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2){
    if(!['--input','--rpc','--proposal','--output'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('Invalid arguments');
    options[args[i]]=args[i+1];
  }
  if(!options['--input']||!options['--output'])throw Error('Required: --input FILE --output FILE [--rpc URL --proposal ID]');
  const input=JSON.parse(fs.readFileSync(options['--input'],'utf8'));
  if(options['--rpc']){
    const raw=await scan(input.manifest,options['--rpc'],String(input.request.cutoffBlockNumber),input.lifecycle);input.blocks=raw.blocks;
  }
  const artifact=buildFromHistory(input);
  if(options['--rpc']&&input.lifecycle.schema!=='attempt-lifecycle-v1'){
    await verifyEpochGenesis(new ethers.JsonRpcProvider(options['--rpc']),input.lifecycle.source,artifact.snapshot?.domain||artifact.domain);
    await require('./dual-bindings.cjs').verifyDualBindings(new ethers.JsonRpcProvider(options['--rpc']),artifact.snapshot?.domain||artifact.domain);
  }
  let publication=null;
  if(options['--proposal']){
    if(artifact.schema==='short-empty-epoch-artifact-v1')throw Error('Empty epoch has no dataset proposal');
    if(!options['--rpc'])throw Error('Publication verification requires --rpc');
    const provider=new ethers.JsonRpcProvider(options['--rpc']);
    const compiled=JSON.parse(fs.readFileSync('artifacts/compiled.json','utf8'));
    const source=new ethers.Contract(input.lifecycle.source,
      compiled[input.lifecycle.schema!=='attempt-lifecycle-v1'?'ShortEpochFixture':'ShortDatasetFixture'].abi,provider);
    publication=await verifyPublication(provider,source,options['--proposal'],artifact);
  }
  const nextAction=artifact.schema==='short-empty-epoch-artifact-v1'
    ?{method:'closeEmpty',args:[artifact.cutoff.blockNumber,artifact.cutoff.blockHash,artifact.snapshotHash]}:null;
  fs.writeFileSync(options['--output'],canonical({artifact,artifactHash:hash(artifact),publication,nextAction,
    provenance:options['--rpc']?'Replayed through selected RPC; finality not certified':'Offline evidence; authenticity not certified'})+'\n');
  console.log('Dataset artifact verified and written');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
