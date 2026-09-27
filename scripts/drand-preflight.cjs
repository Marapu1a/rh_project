// Operational pre-freeze gate only. Does not enforce finality on-chain.
const {ethers}=require('ethers');
const {assessDrandTiming}=require('./drand-timing-readiness.cjs');
const PROFILE=ethers.id('drand-evmnet-operational-v1');
async function drandPreflight(provider,source){
 const address=await source.randomProvider();
 const a=new ethers.Contract(address,['function PROFILE() view returns(bytes32)','function leadSeconds() view returns(uint256)',...['maxClockLag','maxClockAhead','maxFinalizedLag','maxBeaconLag'].map(k=>`function ${k}() view returns(uint256)`),'function verify(uint64,bytes) view returns(bool)'],provider);
 let profile;
 try{profile=await a.PROFILE();}catch(e){if(e.code==='CALL_EXCEPTION'&&(!e.data||e.data==='0x'))return null;throw e;} // Legacy fixture only; mainnet requires pinned adapter admission.
 if(profile!==PROFILE)throw Error('Unknown RNG profile');
 try{
  const latest=await provider.getBlock('latest'),finalized=await provider.getBlock('finalized');
  if(!latest||!finalized||finalized.number>latest.number)return {status:'wait',reasons:['missingNetworkObservation']};
  const at={blockTag:latest.number};
  const [lead,maxClockLag,maxClockAhead,maxFinalizedLag,maxBeaconLag]=await Promise.all(['leadSeconds','maxClockLag','maxClockAhead','maxFinalizedLag','maxBeaconLag'].map(k=>a[k](at)));
  const response=await fetch('https://api.drand.sh/04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3/public/latest',{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Beacon HTTP '+response.status);const beacon=await response.json();
  if(!Number.isSafeInteger(beacon.round)||beacon.round<=0||!/^([0-9a-fA-F]{128})$/.test(beacon.signature))throw Error('Malformed beacon');
  if(!await a.verify(beacon.round,'0x'+beacon.signature,at))throw Error('Unverified beacon');
  if((await provider.getBlock(latest.number))?.hash!==latest.hash||(await provider.getBlock(finalized.number))?.hash!==finalized.hash)return {status:'wait',reasons:['changedNetworkObservation']};
  return assessDrandTiming({now:BigInt(Math.floor(Date.now()/1000)),latestTimestamp:BigInt(latest.timestamp),finalizedTimestamp:BigInt(finalized.timestamp),beaconRound:BigInt(beacon.round),lead,maxClockLag,maxClockAhead,maxFinalizedLag,maxBeaconLag});
 }catch(e){return {status:'wait',reasons:['rngObservationUnavailable'],detail:e.message};}
}
module.exports={drandPreflight,PROFILE};
