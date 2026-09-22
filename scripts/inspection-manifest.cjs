const fs=require('node:fs'),path=require('node:path');
const {hash}=require('./direct-buy.cjs');
const {buildCoordinatorIdentity}=require('./local-coordinator-identity.cjs');
const schema='local-native-refill-inspection-manifest-v1';
function expectedFromDeployment(d){
 if(d?.schema!=='local-coordinator-deployment-v1'||!path.isAbsolute(d.schedulerState||''))throw Error('Explicit deployment schema and absolute schedulerState required');
 const allowed=['schema','prizeJob','schedulerConfig','schedulerState','roles','ops','nativeRefill'];
 if(Object.keys(d).some(k=>!allowed.includes(k)))throw Error('Unexpected deployment field');
 if(!d.nativeRefill||Object.keys(d.nativeRefill).some(k=>!['source','policy','protectedAddresses'].includes(k)))throw Error('Explicit refill configuration required');
 const {config,refillInput}=buildCoordinatorIdentity(d);
 return {configHash:hash(config),coordinatorConfig:config,refill:refillInput,deploymentHash:hash(d)};
}
function createInspectionManifest(deployment,provenance){
 if(!provenance||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(provenance.commit)||typeof provenance.dirty!=='boolean'||!Number.isFinite(Date.parse(provenance.generatedAt)))throw Error('Invalid provenance');
 const payload={schema,...expectedFromDeployment(deployment),provenance};
 return {...payload,checksum:hash(payload)};
}
function verifyInspectionManifest(manifest,deployment){
 const {checksum,...payload}=manifest||{};
 if(payload.schema!==schema||checksum!==hash(payload))throw Error('Manifest checksum/schema mismatch');
 const expected=createInspectionManifest(deployment,payload.provenance);
 if(hash(expected)!==hash(manifest))throw Error('Manifest differs from independent deployment configuration');
 return {configHash:expected.configHash,refill:expected.refill};
}
function main(){
 const [mode,...args]=process.argv.slice(2),o={};
 for(let i=0;i<args.length;i+=2){if(!['--deployment','--out','--manifest'].includes(args[i])||!args[i+1]||o[args[i]])throw Error('Invalid arguments');o[args[i]]=args[i+1];}
 const d=JSON.parse(fs.readFileSync(o['--deployment'],'utf8'));
 if(mode==='export'&&o['--out']&&!o['--manifest']){
  const {execFileSync}=require('node:child_process');const git=args=>execFileSync('git',args,{cwd:path.join(__dirname,'..'),encoding:'utf8'}).trim();
  const m=createInspectionManifest(d,{commit:git(['rev-parse','HEAD']),dirty:!!git(['status','--porcelain']),generatedAt:new Date().toISOString()});
  verifyInspectionManifest(m,d);fs.writeFileSync(o['--out'],JSON.stringify(m,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:'exported',configHash:m.configHash}));
 }else if(mode==='verify'&&o['--manifest']&&!o['--out']){
  const result=verifyInspectionManifest(JSON.parse(fs.readFileSync(o['--manifest'],'utf8')),d);console.log(JSON.stringify({status:'verified',configHash:result.configHash}));
 }else throw Error('Use export --deployment FILE --out NEW_FILE or verify --deployment FILE --manifest FILE');
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={createInspectionManifest,verifyInspectionManifest,expectedFromDeployment,schema};
