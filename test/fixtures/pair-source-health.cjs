const {ethers}=require('ethers');
const {hash}=require('../../scripts/direct-buy.cjs');
const {ROLES,SLOT,poolId}=require('../../scripts/pair-source-health.cjs');
function fixture(){
 const addr=n=>ethers.getAddress('0x'+n.toString(16).padStart(40,'0')),code='0x6001600055',contracts={};
 const implementation={kind:'eip1167',address:addr(9),codeHash:ethers.keccak256(code)};
 const clone='0x363d3d373d3d3d363d73'+addr(9).slice(2)+'5af43d82803e903d91602b57fd5bf3';
 for(const [i,role]of ROLES.entries())contracts[role]={address:addr(i+1),codeHash:ethers.keccak256(role==='token'?clone:code),implementation:role==='token'?implementation:role==='quote'?{kind:'eip1967',address:addr(10),codeHash:ethers.keccak256(code)}:null};
 const m={schema:'pair-source-health-v1',chainId:'4663',anchor:{number:1,hash:ethers.id('deployment')},contracts,positionId:'123',sourceEpoch:'1',poolKey:[addr(1),addr(2),10000,200,addr(6)],futureLaunch:{coordinator:addr(11),handler:addr(12),version:'5'}};
 const abi=new ethers.Interface([
  'function positionCount() view returns(uint256)','function launchEnabled() view returns(bool)','function projectToken() view returns(address)','function quoteToken() view returns(address)','function pairVault() view returns(address)',
  'function positionId() view returns(uint256)','function sourceEpoch() view returns(uint64)','function positionManager() view returns(address)',
  'function policyController() view returns(address)','function modeId() view returns(uint32)','function epoch() view returns(uint64)',
  'function poolManager() view returns(address)','function epochRecipientCount(uint64) view returns(uint256)',
  'function epochRecipient(uint64,uint256) view returns(address,uint16)','function vaultOf(address) view returns(address)',
  'function ownerOf(uint256) view returns(address)','function positions(uint256) view returns(bool,address,bytes32)',
  'function getPoolAndPositionInfo(uint256) view returns((address,address,uint24,int24,address),uint256)',
  'function currentCoordinator() view returns(address)','function currentHandler(uint32) view returns(address,uint256,bool)']);
 const values={positionCount:[1],launchEnabled:[true],projectToken:[addr(1)],quoteToken:[addr(2)],pairVault:[addr(4)],positionId:[123],sourceEpoch:[1],positionManager:[addr(5)],policyController:[addr(8)],modeId:[1],epoch:[1],poolManager:[addr(7)],epochRecipientCount:[1],epochRecipient:[addr(3),10000],vaultOf:[addr(4)],ownerOf:[addr(4)],positions:[true,addr(2),poolId(m.poolKey)],getPoolAndPositionInfo:[m.poolKey,0],currentCoordinator:[addr(11)],currentHandler:[addr(12),5,true]};
 const state={chainId:4663n,values:{},code:{},fail:null,slot:ethers.zeroPadValue(addr(10),32),reorg:false},calls=[];
 const provider={
  getNetwork:async()=>({chainId:state.chainId}),
  getBlock:async n=>n===1?{number:1,hash:m.anchor.hash,timestamp:100}:{number:2,hash:ethers.id(n===2&&state.reorg?'reorg':'head'),timestamp:200},
  getCode:async(a,block)=>{calls.push(['code',block]);return state.code[a]??(a===addr(1)?clone:code);},
  getStorage:async(a,slot,block)=>{if(slot!==SLOT)throw Error('wrong slot');calls.push(['storage',block]);return state.slot;},
  call:async tx=>{
   const f=abi.parseTransaction({data:tx.data}),role=ROLES.find(r=>contracts[r].address===tx.to),label=role+'.'+f.name;calls.push([label,tx.blockTag]);
   if(state.fail===label)throw Object.assign(Error('RPC unavailable'),{code:'TIMEOUT'});
   return abi.encodeFunctionResult(f.fragment,state.values[label]??values[f.name]);
  }
 };
 return {manifest:m,expectedHash:hash(m),provider,state,calls,addr};
}
module.exports={fixture};
