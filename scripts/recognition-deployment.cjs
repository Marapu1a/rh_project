const fs=require('node:fs'),assert=require('node:assert/strict'),E=require('ethers');
const {hash}=require('./direct-buy.cjs');
function compile(){
 const file='contracts/PurchaseRecognitionSource.sol',solc=require('solc');
 const input={language:'Solidity',sources:{[file]:{content:fs.readFileSync(file,'utf8')}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences'],'':['ast']}}}};
 const output=JSON.parse(solc.compile(JSON.stringify(input)));assert(!(output.errors||[]).some(e=>e.severity==='error'));
 const artifact=output.contracts[file].PurchaseRecognitionSource,ids={};
 for(const c of output.sources[file].ast.nodes)for(const v of c.nodes||[])if(v.mutability==='immutable')ids[v.name]=String(v.id);
 assert.deepEqual(Object.keys(ids).sort(),['availableAt','instanceId','publisher']);
 return {compiler:solc.version(),input,artifact,ids};
}
function runtime(build,instanceId,publisher,timestamp){
 const code=Buffer.from(build.artifact.evm.deployedBytecode.object,'hex');
 const values={instanceId,publisher:E.zeroPadValue(publisher,32),availableAt:E.toBeHex(BigInt(timestamp)+86400n,32)};
 for(const [name,id]of Object.entries(build.ids)){
  const refs=build.artifact.evm.deployedBytecode.immutableReferences[id];assert(refs?.length);
  for(const r of refs){assert.equal(r.length,32);assert(r.start>=0&&r.start+32<=code.length);Buffer.from(values[name].slice(2),'hex').copy(code,r.start);}
 }
 return '0x'+code.toString('hex');
}
async function prepare({provider,governor,publisher,instanceId,maxGasPrice,build=compile()}){
 assert(E.isAddress(governor)&&E.isAddress(publisher)&&publisher!==E.ZeroAddress);assert.match(instanceId,/^0x[0-9a-f]{64}$/i);assert.notEqual(instanceId,E.ZeroHash);
 assert.equal((await provider.getNetwork()).chainId,4663n);
 const block=await provider.getBlock('finalized');assert(block?.hash);
 const nonce=await provider.getTransactionCount(governor,'latest');assert.equal(await provider.getTransactionCount(governor,'pending'),nonce,'Pending governor transaction');
 const predictedAddress=E.getCreateAddress({from:governor,nonce});assert.equal(await provider.getCode(predictedAddress),'0x');
 const generated=await new E.ContractFactory(build.artifact.abi,build.artifact.evm.bytecode.object).getDeployTransaction(instanceId,publisher);
 const gasPrice=(await provider.getFeeData()).gasPrice;assert(gasPrice>0n&&gasPrice<=BigInt(maxGasPrice));
 const request={from:governor,chainId:'0x1237',nonce:E.toQuantity(nonce),value:'0x0',data:generated.data};
 const estimate=await provider.estimateGas(request),gas=estimate*120n/100n+30000n;
 const price=gasPrice*120n/100n+1n;const bounded=price<BigInt(maxGasPrice)?price:BigInt(maxGasPrice);
 assert(await provider.getBalance(governor)>=gas*bounded,'Insufficient governor balance');
 assert.equal((await provider.getBlock(block.number)).hash,block.hash,'Finalized branch changed');
 const body={schema:'recognition-deployment-plan-v1',chainId:4663,governor,publisher,instanceId,predictedAddress,buildHash:hash(build),checkpoint:{number:block.number,hash:block.hash},request:{...request,gas:E.toQuantity(gas),gasPrice:E.toQuantity(bounded)},maxCostWei:String(gas*bounded),sent:false};
 return {...body,planHash:hash(body)};
}
async function verify({provider,plan,build,transactionHash}){
 const {planHash,...body}=plan;assert.equal(hash(body),planHash);assert.equal(hash(build),plan.buildHash);assert.equal((await provider.getNetwork()).chainId,4663n);
 const tx=await provider.getTransaction(transactionHash),receipt=await provider.getTransactionReceipt(transactionHash);assert(tx&&receipt);assert.equal(receipt.status,1);
 for(const k of ['from','data'])assert.equal(tx[k].toLowerCase(),plan.request[k].toLowerCase());assert.equal(tx.to,null);assert.equal(tx.value,0n);assert.equal(tx.chainId,4663n);assert.equal(tx.nonce,Number(BigInt(plan.request.nonce)));
 assert.equal(receipt.contractAddress.toLowerCase(),plan.predictedAddress.toLowerCase());
 const block=await provider.getBlock(receipt.blockNumber),final=await provider.getBlock('finalized');assert.equal(block.hash,receipt.blockHash);assert(final.number>=block.number,'Deployment not finalized');
 const code=await provider.getCode(plan.predictedAddress,block.number);assert.equal(code,runtime(build,plan.instanceId,plan.publisher,block.timestamp),'Exact source runtime mismatch');
 return {source:plan.predictedAddress,sourceCodeHash:E.keccak256(code),publisher:plan.publisher,instanceId:plan.instanceId,availableAt:String(BigInt(block.timestamp)+86400n),blockNumber:block.number,blockHash:block.hash,transactionHash};
}
function signing({plan,build,provider,maxGasPrice}){
 const {planHash,...body}=plan;assert.equal(hash(body),planHash);assert.equal(hash(build),plan.buildHash);
 const step={label:'deploy PurchaseRecognitionSource',predictedAddress:plan.predictedAddress,request:(( {gas,gasPrice,...r})=>r)(plan.request),summary:{publisher:plan.publisher,instanceId:plan.instanceId,notice:'Confirmation available 24h after deployment; public notice also required'}};
 const queuePlan={...plan,maxGasPrice,transactions:[step],next:'STOP: verify finality, publish notice and configure readers before confirming purchases'};
 const strategy={validate:p=>assert.equal(hash(p),hash(queuePlan)),step:async i=>i===0?step:null,
 check:async()=>{const fresh=await prepare({provider,governor:plan.governor,publisher:plan.publisher,instanceId:plan.instanceId,maxGasPrice,build});assert.equal(fresh.predictedAddress,plan.predictedAddress,'Nonce drift');assert.equal(fresh.request.data,plan.request.data);},
 verifyReceipt:async(s,r)=>verify({provider,plan,build,transactionHash:r.hash})};
 return {plan:queuePlan,strategy};
}
module.exports={compile,runtime,prepare,verify,signing};
if(require.main===module)(async()=>{
 const [configFile,output]=process.argv.slice(2);assert(configFile&&output&&!fs.existsSync(output));
 const c=JSON.parse(fs.readFileSync(configFile,'utf8')),url=process.env.RH_RPC_URL;assert.equal(new URL(url).protocol,'https:');
 const provider=new E.JsonRpcProvider(url,undefined,{cacheTimeout:-1});try{const build=compile(),plan=await prepare({...c,provider,build});fs.writeFileSync(output,JSON.stringify({plan,build},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({planHash:plan.planHash,predictedAddress:plan.predictedAddress,maxCostWei:plan.maxCostWei,sent:false}));}finally{provider.destroy();}
})().catch(()=>{console.error('Recognition deployment preparation failed; no transaction sent');process.exitCode=1;});
