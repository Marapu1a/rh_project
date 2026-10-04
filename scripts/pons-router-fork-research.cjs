// Developer research only: mutations and transactions execute exclusively on Hardhat.
process.env.HARDHAT_CONFIG=require.resolve('../test/fixtures/pons-wallet-cycle-hardhat.config.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),E=require('ethers'),hre=require('hardhat');
const ROUTER=require('./pons-router-trace-research.cjs').ROUTER;
const SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const word=(input,index,value)=>input.slice(0,10+index*64)+E.toBeHex(value,32).slice(2)+input.slice(10+(index+1)*64);
async function run(out){
 assert(process.env.RH_FORK_RPC_URL&&!fs.existsSync(out));
 const result={schema:'pons-router-fork-research-v1',admitted:false,publicSends:0,cases:[],roles:[],limits:['Captured calldata mutations, not a verified ABI or full module audit','Synthetic local funds and impersonation; no production admission']};
 const proxy=await require('./read-only-fork-rpc.cjs').startReadProxy(process.env.RH_FORK_RPC_URL);
 const rpc=(method,params=[])=>hre.network.provider.send(method,params);
 try{
  for(const name of ['usdg','eth']){
   const f=require('../test/fixtures/pons-router-research/'+name+'.json'),height=Number(BigInt(f.tx.blockNumber))-1;
   await rpc('hardhat_reset',[{forking:{jsonRpcUrl:proxy.url,blockNumber:height}}]);await rpc('evm_mine');
   const parent=await rpc('eth_getBlockByNumber',[E.toQuantity(height),false]);
   const sender=f.tx.from,other='0x0000000000000000000000000000000000001234',admin='0x75fc5cd1794921e617d97e4afa2ff93613413be3';
   for(const address of [sender,other,admin]){await rpc('hardhat_impersonateAccount',[address]);await rpc('hardhat_setBalance',[address,E.toQuantity(E.parseEther('10'))]);}
   const abi=new E.Interface(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)','function transfer(address,uint256) returns(bool)']);
   const role={route:name,block:height,admin};
   for(const [key,to]of [['routerOwner',ROUTER],['proxyAdminOwner',admin]])try{role[key]=await rpc('eth_call',[{to,data:'0x8da5cb5b'},'latest']);}catch{role[key]=null;}
   result.roles.push(role);
   const read=async(to,method,args)=>abi.decodeFunctionResult(method,await rpc('eth_call',[{to,data:abi.encodeFunctionData(method,args)},'latest']))[0];
   if(name==='usdg')await rpc('eth_sendTransaction',[{from:sender,to:f.manifest.quote,data:abi.encodeFunctionData('approve',[ROUTER,E.MaxUint256]),gas:'0x50000'}]);
   const base=await rpc('evm_snapshot');
   async function scenario(label,{from=sender,input=f.tx.input,value=f.tx.value,setup}={},expect){
    const before=await rpc('evm_snapshot');
    try{
     if(setup)await setup();
     const originalBefore=await read(f.manifest.token,'balanceOf',[sender]),otherBefore=await read(f.manifest.token,'balanceOf',[other]);
     let hash,error,receipt;try{hash=await rpc('eth_sendTransaction',[{from,to:ROUTER,data:input,value,gas:'0x4c4b40'}]);receipt=await rpc('eth_getTransactionReceipt',[hash]);}catch(e){error=String(e.message).replace(/https?:\/\/\S+/g,'[RPC]');}
     const success=receipt?.status==='0x1';
     const row={route:name,label,forkBlock:height,forkHash:parent.hash,success,error:error||null,originalTokensDelta:String(await read(f.manifest.token,'balanceOf',[sender])-originalBefore),otherTokensDelta:String(await read(f.manifest.token,'balanceOf',[other])-otherBefore)};
     row.implementationAfter=await rpc('eth_getStorageAt',[ROUTER,SLOT,'latest']);
     result.cases.push(row);if(expect!==undefined)assert.equal(success,expect,label);
     if(label==='captured baseline'){assert(BigInt(row.originalTokensDelta)>0n);assert.equal(row.otherTokensDelta,'0');}
     if(label==='different outer sender'&&name==='eth'||label==='different sender with own USDG'){assert.equal(row.originalTokensDelta,'0');assert(BigInt(row.otherTokensDelta)>0n);}
     if(!success||label.includes('implementation replacement')||label==='proxy admin upgrade'){assert.equal(row.originalTokensDelta,'0');assert.equal(row.otherTokensDelta,'0');}
    }finally{await rpc('evm_revert',[before]);}
   }
   await scenario('captured baseline',{},true);
   await scenario('impossible minimum output',{input:word(f.tx.input,3,E.MaxUint256)},false);
   await scenario('expired deadline',{input:word(f.tx.input,4,1)},false);
   await scenario('different outer sender',{from:other},name==='eth');
   if(name==='usdg'){
    await scenario('different sender with own USDG',{from:other,setup:async()=>{
     await rpc('eth_sendTransaction',[{from:sender,to:f.manifest.quote,data:abi.encodeFunctionData('transfer',[other,200000000]),gas:'0x50000'}]);
     await rpc('eth_sendTransaction',[{from:other,to:f.manifest.quote,data:abi.encodeFunctionData('approve',[ROUTER,E.MaxUint256]),gas:'0x50000'}]);
    }},true);
    await scenario('revoked payer allowance',{setup:()=>rpc('eth_sendTransaction',[{from:sender,to:f.manifest.quote,data:abi.encodeFunctionData('approve',[ROUTER,0]),gas:'0x50000'}])},false);
    await scenario('unknown route discriminator',{input:word(f.tx.input,7,65535)},false);
    await scenario('substituted curve target',{input:word(f.tx.input,10,BigInt(other))},false);
   }
   const upgrade=new E.Interface(['function upgradeToAndCall(address,bytes) payable']).encodeFunctionData('upgradeToAndCall',[other,'0x']);
   await scenario('unauthorized proxy upgrade',{input:upgrade,value:'0x0',setup:()=>rpc('hardhat_setCode',[other,'0x00'])},false);
   await scenario('proxy admin upgrade',{from:admin,input:upgrade,value:'0x0',setup:()=>rpc('hardhat_setCode',[other,'0x00'])},true);
   await scenario('local implementation replacement',{setup:()=>rpc('hardhat_setStorageAt',[ROUTER,SLOT,E.toBeHex(BigInt(other),32)])},true);
   if(name==='eth'){
    function find(n){if(n.input?.startsWith('0xfa461e33'))return n.input;for(const c of n.calls||[]){const x=find(c);if(x)return x;}}
    await scenario('spoofed funding callback',{from:other,input:find(f.trace),value:'0x0'},false);
   }
   await rpc('evm_revert',[base]);
  }
  result.status='COMPLETED';
 }catch(e){result.status='FAILED';result.error=String(e.message).replace(/https?:\/\/\S+/g,'[RPC]');throw e;}
 finally{result.proxyStats=proxy.stats;fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});await proxy.close();}
 return result;
}
if(require.main===module)run(process.argv[2]).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(String(e.message).replace(/https?:\/\/\S+/g,'[RPC]'));process.exitCode=1;});
module.exports={word};
