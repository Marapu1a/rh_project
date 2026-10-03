// Build only. This does not deploy contracts or enable public execution.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function build(output){
 const root=path.resolve(__dirname,'..'),out=path.resolve(output);
 if(process.cwd()!==root)throw Error('Build from repository root');
 if(fs.existsSync(out))throw Error('Release output must not exist');
 if(process.env.RH_TEST_ARTIFACT||process.env.RH_TEST_ARTIFACT_SHA256)throw Error('Build requires fresh compilation, not test artifacts');
 const compiled=require('./compile.cjs').compile({writeArtifacts:false});
 fs.mkdirSync(out,{recursive:true});
 // Ship source scripts for existing dynamic workers. No configs, state, keys or test fixtures.
 fs.cpSync(path.join(root,'scripts'),path.join(out,'scripts'),{recursive:true});
 fs.cpSync(path.join(root,'ops'),path.join(out,'ops'),{recursive:true});
 fs.cpSync(path.join(root,'web'),path.join(out,'web'),{recursive:true,filter:src=>!src.endsWith('.test.cjs')&&!src.includes(path.sep+'purchase-demo')});
 fs.copyFileSync(path.join(root,'web/concepts/hk/index.html'),path.join(out,'web/index.html'));
 fs.mkdirSync(path.join(out,'artifacts'));
 const bytes=Buffer.from(JSON.stringify(compiled)),sha=digest(bytes);
 fs.writeFileSync(path.join(out,'artifacts/compiled.json'),bytes);
 fs.writeFileSync(path.join(out,'scripts/compile.cjs'),`// Release-only loader: no compiler fallback or source overrides.\nmodule.exports.compile=(options={})=>{if(Object.keys(options).length)throw Error('Runtime compilation options forbidden');return require('./runtime-artifact.cjs').load(require('node:path').join(__dirname,'../artifacts/compiled.json'),${JSON.stringify(sha)});};\n`);
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
 fs.writeFileSync(path.join(out,'package.json'),JSON.stringify({...pkg,scripts:{start:'node scripts/user-status-api.cjs --standby'}},null,2)+'\n');
 fs.copyFileSync(path.join(root,'package-lock.json'),path.join(out,'package-lock.json'));
 const files={};function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())scan(f);else files[path.relative(out,f).split(path.sep).join('/')]=digest(fs.readFileSync(f));}}scan(out);
 const manifest={schema:'qianqi-runtime-build-v1',publicExecution:false,artifactSha256:sha,files};
 fs.writeFileSync(path.join(out,'release.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(require.main===module){if(process.argv.length!==3)throw Error('Usage: node scripts/build-runtime.cjs NEW_OUTPUT_DIRECTORY');console.log(JSON.stringify(build(process.argv[2])));}
module.exports={build};
