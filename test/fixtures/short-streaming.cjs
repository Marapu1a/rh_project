const {ethers}=require('ethers');
const hre=require('hardhat');
const model=require('../../scripts/short-outcome.cjs');
const {normalRules,rpc,sent}=require('./short-outcome.cjs');
const coder=ethers.AbiCoder.defaultAbiCoder();
function rootFor(ps){let root=ethers.id('SHORT_ORDERED_LIST_STUDY_V1');
  for(const p of ps)root=ethers.keccak256(coder.encode(['bytes32','address','uint128','uint128'],[root,p.wallet,p.firstAttempt,p.lastAttempt]));return root;}
function split(ps,size){const chunks=[];for(let i=0;i<ps.length;i+=size)chunks.push(ps.slice(i,i+size));return chunks;}
function normalize(r){return {winners:Array.from(r.winners,x=>x.toLowerCase()),amounts:Array.from(r.amounts),prizeIndices:Array.from(r.prizeIndices),admittedCount:r.admittedCount};}
function resultHash(context,seed,root,rules,prizes,result){return ethers.keccak256(coder.encode(
  ['bytes32','bytes32','bytes32','bytes32','bytes32','bytes32',model.RESULT],
  [ethers.id('SHORT_STREAM_RESULT_STUDY_V1'),context,seed,root,model.rulesHash(rules),ethers.keccak256(coder.encode(['uint256[]'],[prizes])),{...result,resultHash:ethers.ZeroHash}]));}
async function fixture(compiled,ps,{rules=normalRules,weights=[7,5,3],budget=1000000n,fund=true,root=rootFor(ps)}={}){
  await rpc('hardhat_reset');
  const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
  const admin=await provider.getSigner(),other=await provider.getSigner(1),third=await provider.getSigner(2);
  async function deploy(name,args=[]){const a=compiled[name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,admin).deploy(...args);await c.waitForDeployment();return c;}
  const token=await deploy('MockToken'),quote=await deploy('MockToken');
  const predicted=ethers.getCreateAddress({from:await admin.getAddress(),nonce:await provider.getTransactionCount(await admin.getAddress())+1});
  const source=await deploy('ShortStreamingStudy',[predicted]),vault=await deploy('PromoVault',[token.target,quote.target,source.target,100]);
  await sent(quote.mint(await admin.getAddress(),100000000000n));await sent(quote.approve(vault.target,ethers.MaxUint256));
  if(fund)await sent(vault.fundUSDG(budget,1));
  const block=await rpc('eth_getBlockByNumber',['latest',false]);
  const setup={drawId:ethers.id('stream study draw'),snapshotHash:ethers.id('synthetic snapshot'),expectedRoot:root,expectedCount:ps.length,
    cutoff:Number(BigInt(block.number)),cutoffHash:block.hash,budget};
  const beginReceipt=await sent(source.begin(setup,rules,weights,1));
  return {provider,admin,other,third,source,vault,quote,setup,rules,beginReceipt,prizes:Array.from(await source.basket())};
}
async function recoverChunks(provider,source){
  const events=await source.queryFilter(source.filters.ChunkPublished()),chunks=[];
  for(const event of events){
    if(event.args.index!==BigInt(chunks.length))throw Error('Missing chunk event');
    const tx=await provider.getTransaction(event.transactionHash),decoded=source.interface.parseTransaction({data:tx.data});
    if(decoded.name!=='publish')throw Error('Wrong publication transaction');
    const chunk=Array.from(decoded.args[0],p=>({wallet:p.wallet,firstAttempt:p.firstAttempt,lastAttempt:p.lastAttempt}));
    if(ethers.keccak256(coder.encode([model.PARTICIPANTS],[chunk]))!==event.args.hash)throw Error('Bad published chunk');
    chunks.push(chunk);
  }
  return chunks;
}
module.exports={fixture,rootFor,split,normalize,resultHash,recoverChunks,rpc,sent};
