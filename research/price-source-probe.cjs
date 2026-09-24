// Read-only reference probe, not a production oracle. No transaction methods.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const hook = '0x438b86c71840c3b4df3f839aed6bb889e2d780c0';
const pool = '0xcba8f1e548abf84741726c3a31ed56522794682171520a2b72280f99aa59b03e';
const rpcUrl = 'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public';
const output = process.argv[2];
if (!output || fs.existsSync(output)) throw new Error('Supply a new output path');
let id = 0;
const evidence = { rpcUrl, hook, pool, calls: [] };
async function rpc(method, params) {
  assert(['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call'].includes(method));
  const response = await fetch(rpcUrl, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({jsonrpc:'2.0',id:++id,method,params}), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  evidence.calls.push({ method, params, response: body });
  return body;
}
(async () => {
  assert.equal((await rpc('eth_chainId', [])).result, '0x1237');
  const block = (await rpc('eth_getBlockByNumber', ['latest', false])).result;
  evidence.block = { number: block.number, hash: block.hash, timestamp: block.timestamp };
  const code = (await rpc('eth_getCode', [hook, block.number])).result;
  evidence.runtimeHash = ethers.keccak256(code);
  assert.equal(evidence.runtimeHash, '0x61be10dbf714fa832ac3179b3f24f2c60f244f6ea79b06655dd866b93e67837a');
  evidence.sourceHash = ethers.keccak256(fs.readFileSync('research/pair-source-audit/sources/PairV5LaunchV2NativeFeeHook.sol'));
  assert.equal(evidence.sourceHash, '0x62dc4131c8b04625cbfa0241ef54971689d7c62db26dc627b01e158eddebf1f1');
  async function call(signature, args = []) {
    const abi = new ethers.Interface([`function ${signature}`]);
    const fn = signature.split('(')[0];
    const result = await rpc('eth_call', [{to:hook,data:abi.encodeFunctionData(fn,args)},block.number]);
    return result.error ? {error:result.error} : Array.from(abi.decodeFunctionResult(fn,result.result), String);
  }
  evidence.values = {};
  for (const [name,type] of [['TWAP_WINDOW','uint32'],['MAX_OBSERVATION_AGE','uint32'],['MIN_OBSERVATION_INTERVAL','uint32'],['MAX_OBSERVATIONS','uint8']]) evidence.values[name] = await call(`${name}() view returns(${type})`);
  evidence.values.pool = await call('pools(bytes32) view returns(address,address,address,uint256,bool)', [pool]);
  evidence.values.count = await call('observationCount(bytes32) view returns(uint8)', [pool]);
  evidence.observations = [];
  const count = Number(evidence.values.count[0]);
  assert(Number.isInteger(count) && count <= 32);
  for (let i=0; i<count; i++) evidence.observations.push(await call('observationAt(bytes32,uint8) view returns(uint32,int24)', [pool,i]));
  evidence.values.consult = await call('consult(bytes32,uint32) view returns(int24)', [pool,1800]);
  evidence.values.tokenQuote = await call('getQuote(bytes32,uint256,bool) view returns(uint256)', [pool,10n**18n,false]);
  evidence.insufficientHistorySelector = ethers.id('InsufficientHistory()').slice(0,10);
  evidence.latestObservationAge = Number(BigInt(block.timestamp)) - Math.max(...evidence.observations.map(x=>Number(x[0])));
  assert.equal((await rpc('eth_getBlockByNumber', [block.number,false])).result.hash, block.hash);
  evidence.complete = true;
  fs.writeFileSync(output, JSON.stringify(evidence,null,2)+'\n', {flag:'wx'});
  console.log(JSON.stringify({block:evidence.block,age:evidence.latestObservationAge,values:evidence.values},null,2));
})().catch(error => { evidence.failure=error.message; fs.writeFileSync(output,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'}); console.error(error); process.exitCode=1; });
