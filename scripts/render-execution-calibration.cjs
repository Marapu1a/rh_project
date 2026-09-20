// Render compact reproducible evidence from the calibration's per-transaction output.
const fs=require('node:fs'),path=require('node:path'),{ethers}=require('ethers');
function render(directory){
 const summary=JSON.parse(fs.readFileSync(path.join(directory,'summary.json'))),raw=JSON.parse(fs.readFileSync(path.join(directory,'transactions.json')));
 const sum=(rs,key)=>rs.reduce((s,r)=>s+BigInt(r[key]),0n),max=(a,b)=>a>b?a:b;
 const actions={};for(const r of raw){const a=actions[r.action]??={maxEstimate:0n,maxGasUsed:0n,maxCalldataBytes:0,minBlockGasLimit:BigInt(r.blockGasLimit),samples:0};
  a.maxEstimate=max(a.maxEstimate,BigInt(r.estimate));a.maxGasUsed=max(a.maxGasUsed,BigInt(r.gasUsed));a.maxCalldataBytes=Math.max(a.maxCalldataBytes,r.calldataBytes);a.minBlockGasLimit=BigInt(r.blockGasLimit)<a.minBlockGasLimit?BigInt(r.blockGasLimit):a.minBlockGasLimit;a.samples++;}
 const profile=require('../test/fixtures/execution-budget.cjs').opsProfile();profile.network.id='local-calibrated-envelope-v1';
 for(const [action,a] of Object.entries(actions))if(profile.network.gasUnits[action])profile.network.gasUnits[action]=String((a.maxEstimate*110n+99n)/100n);
 fs.writeFileSync(path.join(directory,'measured-profile.json'),JSON.stringify(profile,null,2)+'\n');
 const cases=summary.cases.map(c=>{
  const label=`${c.profile}-${c.n}-${c.mode}`,rows=raw.filter(r=>r.label===label),prepare=rows.filter(r=>['prepare','freeze'].includes(r.phase));
  const variants=[0,1].map(i=>{const completion=rows.filter(r=>r.phase==='seed'+i&&r.action!=='deliver'),delivery=rows.filter(r=>r.phase==='seed'+i&&r.action==='deliver');
   const gas=sum(prepare,'gasUsed')+sum(completion,'gasUsed');
   return {seedIndex:i,executionGas:String(gas),fixtureDeliveryGas:String(sum(delivery,'gasUsed')),executionNativeActual:String(sum(prepare,'nativeSpent')+sum(completion,'nativeSpent')),
    modelNativeAt1Gwei:String(gas*1000000000n),modelNativeAt2Gwei:String(gas*2000000000n),controllerRngFee:String(sum(prepare,'shortNativeSpent')+sum(prepare,'monthlyNativeSpent'))};});
  return {...c,variants};
 });
 const files=['contracts/ShortSettlement.sol','contracts/MonthlySettlement.sol','contracts/ShortOutcome.sol','contracts/ShortDatasetPreparation.sol','contracts/LocalShortController.sol','contracts/LocalMonthlyController.sol','contracts/DualControllerPromoVault.sol','contracts/PromoVault.sol','test/contracts/LocalRandomFixture.sol','test/fixtures/local-controllers.cjs','hardhat.config.cjs'];
 const report={schema:'local-execution-calibration-evidence-v1',environment:{chainId:31337,hardfork:'cancun',solc:require('solc').version(),optimizerRuns:200},
  scope:'Synthetic participants; two sampled seeds, chunk64, N100/1000/10000. Not a proof of worst-case gas or production throughput. Excludes BUY/indexer, deployments, claims, keeper overhead and real RNG/extra L2 fee. Gas price rows are assumptions, not live prices.',
  sourceHashes:Object.fromEntries(files.map(p=>[p,ethers.keccak256(ethers.toUtf8Bytes(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')))])),actions,cases};
 const json=JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n';fs.writeFileSync(path.join(directory,'evidence.json'),json);
 const lines=['| Режим | N | Порций на draw | Контуры | Gas за цикл, максимум двух seed | Native при 1 gwei |','|---|---:|---:|---|---:|---:|'];
 for(const c of cases){const gas=c.variants.reduce((a,v)=>max(a,BigInt(v.executionGas)),0n);lines.push(`| ${c.profile} | ${c.n} | ${c.chunks} | ${c.mode} | ${gas} | ${ethers.formatEther(gas*1000000000n)} |`);}
 lines.push('','| Метод | Max estimate | Max receipt gas | Старые 3M / max estimate |','|---|---:|---:|---:|');
 for(const [name,a] of Object.entries(actions))lines.push(`| ${name} | ${a.maxEstimate} | ${a.maxGasUsed} | ${profile.network.gasUnits[name]?(3000000/Number(a.maxEstimate)).toFixed(2):"n/a"} |`);
 fs.writeFileSync(path.join(directory,'tables.md'),lines.join('\n')+'\n');return report;
}
if(require.main===module)render(path.resolve(process.argv[2]||'.local/logs/execution-calibration'));
module.exports={render};
