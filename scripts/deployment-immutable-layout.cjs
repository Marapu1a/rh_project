// Recover exact solc offsets for the two timestamp immutables. No bytecode edits.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function build(compiled){
 const sources={};for(const dir of ['contracts','contracts/vendor/drand','test/contracts'])for(const name of fs.readdirSync(dir))if(name.endsWith('.sol'))sources[`${dir}/${name}`]={content:fs.readFileSync(`${dir}/${name}`,'utf8')};
 const output=JSON.parse(require('solc').compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences'],'':['ast']}}}}),{import:file=>{try{return {contents:fs.readFileSync(path.join('node_modules',file),'utf8')};}catch{return {error:'Missing import'};}}}));
 assert(!(output.errors||[]).some(e=>e.severity==='error'));const ids={};
 function walk(x){if(!x||typeof x!=='object')return;if(x.nodeType==='VariableDeclaration'&&x.mutability==='immutable'&&['shortRulesStartedAt','monthlyStartedAt'].includes(x.name)){assert(!ids[x.name]);ids[x.name]=String(x.id);}for(const v of Object.values(x))if(v&&typeof v==='object')Array.isArray(v)?v.forEach(walk):walk(v);}
 for(const source of Object.values(output.sources))walk(source.ast);
 const result={};for(const [contract,variable]of [['RobinhoodShortController','shortRulesStartedAt'],['RobinhoodMonthlyController','monthlyStartedAt']]){
  const code=output.contracts['contracts/'+contract+'.sol'][contract].evm.deployedBytecode;
  assert.equal(code.object,compiled[contract].evm.deployedBytecode.object,'Compilation mismatch');
  const refs=code.immutableReferences[ids[variable]];assert(refs?.length&&refs.every(r=>r.length===32));result[contract]={variable,byteLength:code.object.length/2,references:refs};
 }
 return {schema:'qianqi-timestamp-immutables-v1',artifactHash:require('./direct-buy.cjs').hash(compiled),contracts:result};
}
if(require.main===module){const [artifact,output]=process.argv.slice(2);assert(artifact&&output&&!fs.existsSync(output));fs.writeFileSync(output,JSON.stringify(build(JSON.parse(fs.readFileSync(artifact))),null,2)+'\n',{flag:'wx'});console.log('Timestamp immutable offsets verified against exact artifact');}
module.exports={build};
