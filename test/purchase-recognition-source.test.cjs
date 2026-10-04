const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),E=require('ethers');
test('real local commitment contract: publisher only, bounded append-only batches, no duplicate or backdating input',async()=>{
 const file='contracts/PurchaseRecognitionSource.sol',output=JSON.parse(require('solc').compile(JSON.stringify({language:'Solidity',sources:{[file]:{content:fs.readFileSync(file,'utf8')}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
 assert.equal((output.errors||[]).filter(e=>e.severity==='error').length,0);
 const a=output.contracts[file].PurchaseRecognitionSource,hre=require('hardhat');await hre.network.provider.send('hardhat_reset');
 const provider=new E.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1}),owner=await provider.getSigner(0),other=await provider.getSigner(1),instance=E.id('local recognition instance');
 const factory=new E.ContractFactory(a.abi,a.evm.bytecode.object,owner),source=await factory.deploy(instance,await owner.getAddress());await source.waitForDeployment();
 assert.equal(await source.instanceId(),instance);assert.equal(await source.publisher(),await owner.getAddress());
 const key=E.id('reviewed evidence bundle');await assert.rejects(source.connect(other).confirm.staticCall(key,1));
 await assert.rejects(source.confirm.staticCall(key,1));
 await hre.network.provider.send('evm_increaseTime',[86400]);await hre.network.provider.send('evm_mine');
 for(const [hash,count] of [[E.ZeroHash,1],[key,0],[key,51]])await assert.rejects(source.confirm.staticCall(hash,count));
 const receipt=await(await source.confirm(key,50)).wait(),event=source.interface.parseLog(receipt.logs[0]);
 assert.equal(event.args.bundleHash,key);assert.equal(event.args.count,50n);assert.equal(await source.published(key),true);await assert.rejects(source.confirm.staticCall(key,1));
 assert.equal(receipt.logs.length,1);assert.equal(await provider.getBalance(source.target),0n);
});
