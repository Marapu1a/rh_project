// Exact binomial arithmetic under independent uniform admission hashes. This is
// a model of equal-entry wallets, not a forecast of volume or human behaviour.
function analyze(n,entries,pNumerator=4,pDenominator=5,k=10){
 if(![n,entries,pNumerator,pDenominator,k].every(Number.isSafeInteger)||n<1||n>100||entries<1||entries>100||pNumerator<1||pNumerator>=pDenominator||k<1)throw Error('Invalid model bounds');
 const a=BigInt(pNumerator*entries),b=BigInt(pDenominator*(entries+1)),d=b**BigInt(n);
 let choose=1n,total=0n,winners=0n;
 for(let m=0;m<=n;m++){
  const mass=choose*a**BigInt(m)*(b-a)**BigInt(n-m);total+=mass;winners+=BigInt(Math.min(k,m))*mass;
  if(m<n)choose=choose*BigInt(n-m)/BigInt(m+1);
 }
 if(total!==d)throw Error('Probability mass mismatch');
 const pct=(x,y)=>Number(x*1000000n/y)/10000;
 const none=(b-a)**BigInt(n);
 return {wallets:n,entriesPerWallet:entries,admissionPercent:pct(a,b),noWinnerPercent:pct(none,d),
  atLeastOneWinnerPercent:pct(d-none,d),expectedWinners:Number(winners*1000000n/d)/1000000,
  walletWinPercent:pct(winners,d*BigInt(n)),expectedBasketPaidPercent:pct(winners,d*BigInt(k))};
}
function report(){return {schema:'short-launch-analysis-v1',assumptions:['Equal entries per wallet; independent uniform hashes; fixed ten prizes randomly assigned without replacement.',
 'Exact rational binomial model; displayed decimals truncated. Contract admission additionally floors a uint256 threshold.',
 'Expected payment concerns the constructed basket, excludes raw rounding dust, and is not guaranteed payment. Sponsor money increases prizes, not probabilities.'],
 comparisons:[2,4].flatMap(p=>[1,3,10,25,100].map(n=>({pNumerator:p,pDenominator:5,...analyze(n,1,p)}))),
 approved:[1,5,10].flatMap(e=>[1,3,10,25,100].map(n=>analyze(n,e)))};}
if(require.main===module)console.log(JSON.stringify(report(),null,2));
module.exports={analyze,report};
