// Offline source-to-runtime comparison; metadata mismatch is reported, never hidden.
const fs=require('fs'),assert=require('assert/strict'),{ethers:E}=require('ethers');
const [sourceFile,compilerFile,probeFile,runtimeFile,output]=process.argv.slice(2);
assert(output&&!fs.existsSync(output));
const source=JSON.parse(fs.readFileSync(sourceFile)),probe=JSON.parse(fs.readFileSync(probeFile));
const solc=require('solc').setupMethods(require(require('path').resolve(compilerFile)));
assert(solc.version().startsWith(source.compilation.compilerVersion));
const input=structuredClone(source.stdJsonInput);input.settings.outputSelection={'*':{'*':['abi','evm.deployedBytecode'],'':['ast']}};
const compiled=JSON.parse(solc.compile(JSON.stringify(input)));assert(!(compiled.errors||[]).some(e=>e.severity==='error'));
const file='contracts/src/v2/PonsV2LauncherToken.sol',artifact=compiled.contracts[file].PonsV2LauncherToken,code=Buffer.from(artifact.evm.deployedBytecode.object,'hex');
const ids={};for(const x of compiled.sources[file].ast.nodes.find(n=>n.nodeType==='ContractDefinition').nodes)if(x.mutability==='immutable')ids[x.id]=x.name;
assert.deepEqual(Object.values(ids).sort(),['curve','deployer','launchFactory']);
for(const[id,refs]of Object.entries(artifact.evm.deployedBytecode.immutableReferences))for(const r of refs){assert.equal(r.length,32);Buffer.from(E.zeroPadValue(probe.references[ids[id]],32).slice(2),'hex').copy(code,r.start);}
const actual=Buffer.from(fs.readFileSync(runtimeFile,'utf8').trim().slice(2),'hex');assert.equal(E.keccak256(actual),probe.runtimeHash);
const body=b=>{const size=b.readUInt16BE(b.length-2),end=b.length-size-2;assert(end>0&&b[end-1]===0xfe);return b.subarray(0,end);};
assert(body(code).equals(body(actual)),'Executable bytecode mismatch');
const result={status:'EXECUTABLE_RUNTIME_MATCH',compiler:solc.version(),runtimeHash:probe.runtimeHash,executableHash:E.keccak256(body(actual)),fullMetadataMatch:code.equals(actual),immutableValues:probe.references,functions:artifact.abi.filter(x=>x.type==='function').map(x=>x.name),sourceMatch:source.runtimeMatch,sourcePeer:source.address,sourceUrl:'https://sourcify.dev/server/v2/contract/4663/'+source.address+'?fields=all',limits:['CBOR metadata differs from local recompilation; not an exact full-bytecode verification','This verifies token logic only, not the whole Pons factory/curve/hook graph','Public QIANQI source verification must be checked after launch']};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
