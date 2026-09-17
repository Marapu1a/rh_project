// Isolated compiler experiment. Does not change production sources/settings/artifacts.
const fs=require('node:fs'),path=require('node:path'),solc=require('solc');
const {ethers}=require('ethers');
const ROOT='research/controller-size/ControllerSizeStudy.sol';
const HELPER='research/controller-size/FixedSelectionSizeHelper.sol';
function replaceOnce(source,from,to){
  if(source.split(from).length!==2)throw Error(`Study transformation no longer matches: ${from}`);
  return source.replace(from,to);
}
function compileVariant({helpers=false,viaIR=false,runs=200,dual=false}={}){
  const sources={};
  for(const name of fs.readdirSync('contracts').filter(n=>n.endsWith('.sol'))){
    const p=`contracts/${name}`;sources[p]={content:fs.readFileSync(p,'utf8')};
  }
  for(const p of [ROOT,HELPER,'test/contracts/Fixtures.sol','test/contracts/ShortSettlementFixture.sol'])sources[p]={content:fs.readFileSync(p,'utf8')};
  if(dual){const p='research/controller-size/MonthlyRngSizeStudy.sol';sources[p]={content:fs.readFileSync(p,'utf8')};}
  if(helpers){
    let s=sources['contracts/ShortSettlement.sol'].content;
    s=replaceOnce(s,'abstract contract ShortSettlement is ShortRulesEpochs {',
      'abstract contract ShortSettlement is ShortRulesEpochs {\n    ExternalSelectionSizeHelper internal immutable sizeHelper = new ExternalSelectionSizeHelper();');
    s=replaceOnce(s,'import {ShortOutcome}',`import {ExternalSelectionSizeHelper} from "../${HELPER}";\nimport {ShortOutcome}`);
    s=replaceOnce(s,'ShortOutcome.selectTopK(', 'sizeHelper.select(');
    sources['contracts/ShortSettlement.sol'].content=s;
    sources[ROOT].content=replaceOnce(sources[ROOT].content,'ShortOutcome.selectTopK(', 'sizeHelper.select(');
  }
  const inputs=Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,v.content]));
  const settings={optimizer:{enabled:true,runs},viaIR,evmVersion:'cancun',
    outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}};
  const result=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings}),{import:p=>{
    const file=p.startsWith('@')?path.join('node_modules',p):p;
    try{const contents=fs.readFileSync(file,'utf8');inputs[p]=contents;return {contents};}catch{return {error:`Missing ${p}`};}
  }}));
  const errors=(result.errors||[]).filter(e=>e.severity==='error');
  if(errors.length)throw Error(errors.map(e=>e.formattedMessage).join('\n'));
  const artifacts={};for(const entries of Object.values(result.contracts))Object.assign(artifacts,entries);
  const measured=['ShortSettlementFixture','ShortRngSizeStudy','FullControllerSizeStudy','ExternalSelectionSizeHelper','PromoVault'];
  if(dual)measured.push('MonthlyRngSizeStudy','DualControllerPromoVault');
  const sizes=Object.fromEntries(measured.map(name=>{const a=artifacts[name];const runtime=a.evm.deployedBytecode.object.length/2;
    return [name,{runtime,initcode:a.evm.bytecode.object.length/2,headroom:24576-runtime,fits:runtime<=24576}];}));
  const sourceHashes=Object.fromEntries(Object.entries(inputs).sort(([a],[b])=>a.localeCompare(b))
    .map(([p,s])=>[p,ethers.keccak256(ethers.toUtf8Bytes(s.replace(/\r\n/g,'\n')))]));
  return {artifacts,report:{helpers,viaIR,runs,sizes,sourceHashes,
    warnings:(result.errors||[]).filter(e=>e.severity==='warning').map(e=>e.formattedMessage)}};
}
module.exports={compileVariant};
if(require.main===module){
  const report={schema:'controller-size-study-v1',solc:solc.version(),evmVersion:'cancun',runtimeLimit:24576,variants:[]};
  for(const settings of [{},{helpers:true},{runs:1},{viaIR:true},{viaIR:true,helpers:true},{viaIR:true,helpers:true,runs:1}]){
    const {report:row}=compileVariant(settings);report.variants.push(row);console.log(JSON.stringify({settings,sizes:row.sizes}));
  }
  fs.writeFileSync('research/controller-size/sizes.json',JSON.stringify(report,null,2)+'\n');
}
