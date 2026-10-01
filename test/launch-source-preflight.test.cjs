const {test}=require('node:test'),assert=require('node:assert/strict'),{Interface,keccak256,toBeHex,id}=require('ethers');
const {inspect}=require('../scripts/launch-source-preflight.cjs');
test('launch input omissions stay visible; explicit false and zero are not missing',()=>{
 const p=structuredClone(require('../config/reserve/pair-launch-plan.json'));
 p.launch.sniperProtection=false;p.launch.protectionBlocks=0;p.launch.vanityNonce=0;
 const r=require('../scripts/public-launch-plan.cjs').inspectPlan(p);
 assert(r.missing.includes('launch.openingProfile'));assert(r.missing.includes('launch.metadataURI'));
 assert(!r.missing.includes('launch.sniperProtection'));assert(!r.missing.includes('launch.vanityNonce'));
 assert.equal(r.executable,false);
});
function fixture(){
 const address=n=>'0x'+String(n).repeat(40),code='0x6000';
 const expected={proxy:address(1),sources:Object.fromEntries(['launch','engine','hook','adapter'].map((n,i)=>[n,{address:address(i+2),onchainBytecodeHash:keccak256(code)}])),quote:{address:address(6),codeHash:keccak256(code),decimals:6}};
 const abi=new Interface(['function launchpad() view returns(address)','function validateLaunchpad(address) view returns(bool)','function decimals() view returns(uint8)',...['launchFee','TOTAL_SUPPLY','protectionBlocks'].map(n=>`function ${n}() view returns(uint256)`) ]),calls=[];
 const rpc=async(m,p)=>{calls.push([m,p]);if(m==='eth_chainId')return '0x1237';if(m==='eth_getBlockByNumber')return {number:'0x64',hash:id('block'),timestamp:'0x1'};if(m==='eth_getCode')return code;if(m==='eth_getStorageAt')return toBeHex(BigInt(expected.sources.launch.address),32);if(m==='eth_gasPrice')return '0x1';if(m==='eth_call'){const tx=abi.parseTransaction({data:p[0].data});return abi.encodeFunctionResult(tx.name,[({launchpad:expected.proxy,validateLaunchpad:true,decimals:6,launchFee:500000000000000n,TOTAL_SUPPLY:10n**27n,protectionBlocks:10})[tx.name]]);}throw Error('Unexpected RPC');};
 return {expected,rpc,calls};
}
test('source check pins every state read to one block and never authorizes sends',async()=>{
 const f=fixture(),r=await inspect(f);assert.equal(r.matched,true);assert.equal(r.authorizationToSend,false);assert.equal(r.values.launchFee,'500000000000000');
 assert(f.calls.filter(([m])=>['eth_getCode','eth_call','eth_getStorageAt'].includes(m)).every(([m,p])=>p[m==='eth_getStorageAt'?2:1]==='0x64'));
 assert(f.calls.every(([m])=>!m.includes('send')&&!m.includes('sign')));
});
test('read failure, runtime drift and branch replacement stay unqualified without leaking provider errors',async()=>{
 for(const bad of ['eth_getCode','eth_getStorageAt','branch']){
  const f=fixture(),rpc=async(m,p)=>{if(m===bad)throw Error('secret-provider-url');if(bad==='branch'&&m==='eth_getBlockByNumber'&&p[0]==='0x64')return {hash:id('other')};return f.rpc(m,p);};
  const r=await inspect({...f,rpc});assert.equal(r.matched,false);assert.equal(JSON.stringify(r).includes('secret-provider-url'),false);assert.equal(r.publicLaunchReady,false);
 }
});
