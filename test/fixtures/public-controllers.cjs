const {ethers}=require('ethers'),hre=require('hardhat');
const rpc=(m,p=[])=>hre.network.provider.send(m,p),sent=async tx=>(await tx).wait();
async function fixture(compiled,{reset=true,quoteAddress,offset=true,minimumUnit=1}={}){
 if(reset)await rpc('hardhat_reset');
 await rpc('hardhat_setCode',['0x0000000000000000000000000000000000000064','0x'+compiled[offset?'OffsetArbSysFixture':'PublicArbSysFixture'].evm.deployedBytecode.object]);
 const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1}),admin=await provider.getSigner(),other=await provider.getSigner(1),owner=await admin.getAddress();
 const deploy=async(n,args=[])=>{const a=compiled[n],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,admin).deploy(...args);await c.waitForDeployment();return c;};
 const token=await deploy('MockToken'),quote=quoteAddress?new ethers.Contract(quoteAddress,compiled.LocalUSDGFixture.abi,admin):await deploy('LocalUSDGFixture'),registry=await deploy('ParticipantRegistry');
 const nonce=await provider.getTransactionCount(owner),address=n=>ethers.getCreateAddress({from:owner,nonce:nonce+n});
 const random=await deploy('DrandRandomAdapter',[address(1),address(2),[1800,30,5,1200,15]]);
 const base={vault:address(3),registry:registry.target,instance:ethers.id('public short fixture'),governor:owner,publisher:owner,provider:random.target,notice:3600,cutoffDelayBlocks:1,maxGasPrice:10n**12n,nativeFloor:0};
 const rules=require('./short-outcome.cjs').nearCertainRules;
 const short=await deploy('RobinhoodShortController',[{...base,maxBudget:100_000000},rules,[7,5,3],minimumUnit]);
 const monthly=await deploy('RobinhoodMonthlyController',[{...base,instance:ethers.id('public monthly fixture'),interval:30*86400},rules]);
 const vault=await deploy('DualControllerPromoVault',[token.target,quote.target,short.target,monthly.target,100_000000]);
 require('node:assert/strict').equal(vault.target,base.vault);
 const head=async()=>{const b=await provider.getBlock('latest');return {number:BigInt(b.number)+(offset?1000000n:0n),hash:b.hash};};
 return {provider,admin,other,owner,deploy,token,quote,registry,random,short,monthly,vault,base,rules,head};
}
module.exports={fixture,rpc,sent};
