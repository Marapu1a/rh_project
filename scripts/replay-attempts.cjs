const fs=require('node:fs');
const {canonical,hash}=require('./direct-buy.cjs');
const {replayAttempts,domainFor}=require('./attempt-lifecycle.cjs');
const {scan}=require('./replay-direct-buy.cjs');

async function main(){
  const options={},args=process.argv.slice(2);
  const valued=new Set(['--evidence','--manifest','--rpc','--to-block','--output','--verify']);
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(options[key]!==undefined)throw Error('Duplicate option');
    if(key==='--example')options[key]=true;
    else{if(!valued.has(key)||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid option');options[key]=args[++i];}
  }
  let input,inputMode,policyStatus={mode:'unadmitted',reason:'Offline evidence; no source admission'};
  if(options['--example']){
    if(options['--evidence']||options['--manifest']||options['--rpc']||options['--to-block'])throw Error('Example cannot be combined with other inputs');
    input=require('../test/fixtures/attempt-history.cjs').example();inputMode=input.mode;
  }else if(options['--evidence']){
    if(options['--manifest']||options['--rpc']||options['--to-block'])throw Error('Choose saved evidence or independent RPC');
    input=JSON.parse(fs.readFileSync(options['--evidence'],'utf8'));inputMode='Supplied raw history; authenticity is not verified offline';
  }else{
    if(!options['--manifest']||!options['--rpc']||!options['--to-block'])throw Error('Supply --example, --evidence FILE or --manifest FILE --rpc URL --to-block N');
    const config=JSON.parse(fs.readFileSync(options['--manifest'],'utf8'));
    domainFor(config.manifest,config.lifecycle);
    const {JsonRpcProvider}=require('ethers');
    const provider=new JsonRpcProvider(options['--rpc']);
    let resolved;
    try{resolved=await require('./buy-policy-runtime.cjs').resolveBuyPolicy(config,(m,p)=>provider.send(m,p),Number(options['--to-block']));}finally{provider.destroy();}
    policyStatus=resolved.policyStatus;
    const raw=await scan(resolved.manifest,options['--rpc'],options['--to-block'],config.lifecycle);
    if(config.lifecycle.schema!=='attempt-lifecycle-v1'){
      const {JsonRpcProvider}=require('ethers');
      await require('./short-dataset.cjs').verifyEpochGenesis(new JsonRpcProvider(options['--rpc']),
        config.lifecycle.source,domainFor(config.manifest,config.lifecycle));
      await require('./dual-bindings.cjs').verifyDualBindings(new JsonRpcProvider(options['--rpc']),domainFor(config.manifest,config.lifecycle));
    }
    input={...raw,lifecycle:config.lifecycle};inputMode='Read through selected RPC; finality/RNG correctness not certified';
  }
  const ledger=replayAttempts(input.manifest,input.lifecycle,input.blocks);
  const result={inputMode,policyStatus,ledger,ledgerHash:hash(ledger)};
  if(options['--verify']){
    const claimed=JSON.parse(fs.readFileSync(options['--verify'],'utf8'));
    // inputMode is a local provenance label, not an attestation supplied by an operator.
    if(claimed.ledgerHash!==result.ledgerHash||canonical(claimed.ledger)!==canonical(ledger))throw Error('Published attempt ledger differs from replay');
  }
  if(options['--output'])fs.writeFileSync(options['--output'],canonical(result)+'\n');
  console.log(JSON.stringify({inputMode,policyStatus,ledgerHash:result.ledgerHash,pending:ledger.pending,wallets:ledger.wallets,draws:ledger.draws.map(d=>({drawId:d.drawId,kind:d.kind,status:d.status,totalAttempts:d.totalAttempts}))},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
