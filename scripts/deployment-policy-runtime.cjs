const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{ethers:E}=require('ethers');
function build(compiled){
 const sources={};for(const dir of ['contracts','contracts/vendor/drand','test/contracts'])for(const name of fs.readdirSync(dir))if(name.endsWith('.sol'))sources[`${dir}/${name}`]={content:fs.readFileSync(`${dir}/${name}`,'utf8')};
 const output=JSON.parse(require('solc').compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences'],'':['ast']}}}}),{import:file=>{try{return {contents:fs.readFileSync(path.join('node_modules',file),'utf8')};}catch{return {error:'Missing import'};}}}));
 assert(!(output.errors||[]).some(e=>e.severity==='error'));
 const file='contracts/BuyPolicySource.sol',code=output.contracts[file].BuyPolicySource.evm.deployedBytecode;
 assert.equal(code.object,compiled.BuyPolicySource.evm.deployedBytecode.object,'Compilation mismatch');
 const vars=output.sources[file].ast.nodes.find(n=>n.nodeType==='ContractDefinition').nodes.filter(n=>n.nodeType==='VariableDeclaration'&&n.mutability==='immutable');
 assert.deepEqual(vars.map(v=>v.name).sort(),['genesisAdaptersHash','genesisHash','instanceId','noticeBlocks','publisher']);
 return Object.fromEntries(vars.map(v=>{const refs=code.immutableReferences[v.id];assert(refs?.length&&refs.every(r=>r.length===32));return [v.name,refs];}));
}
function runtime(artifact,layout,values){
 const code=Buffer.from(artifact.evm.deployedBytecode.object,'hex');
 assert.deepEqual(Object.keys(layout).sort(),Object.keys(values).sort());
 for(const [name,refs]of Object.entries(layout))for(const r of refs){assert.equal(r.length,32);assert(r.start>=0&&r.start+32<=code.length);Buffer.from(E.toBeHex(BigInt(values[name]),32).slice(2),'hex').copy(code,r.start);}
 return '0x'+code.toString('hex');
}
module.exports={build,runtime};
