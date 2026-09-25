// Pure funding forecast. Does not authorize a transaction or declare a draw ready.
const uint=(x,name)=>{if(typeof x!=='bigint'||x<0n)throw Error('Invalid '+name);return x;};
function shortAllocation(amount,phase){
  uint(amount,'amount');
  if(!Number.isInteger(phase)||phase<0||phase>5)throw Error('Invalid phase');
  let out=(amount/6n)*3n;
  for(let i=0;i<Number(amount%6n);i++)if((phase+i)%2===0)out++;
  return out;
}
function planShortConversion({freeShort,target,phase,amountIn,maxInput,expectedUSDG,quoteAge,maxQuoteAge}){
  for(const [k,v] of Object.entries({freeShort,target,amountIn,maxInput,expectedUSDG,quoteAge,maxQuoteAge}))uint(v,k);
  if(target===0n||maxInput===0n||maxQuoteAge===0n)throw Error('Invalid limits');
  const projectedShort=freeShort+shortAllocation(expectedUSDG,phase);
  const reason=amountIn===0n?'noInventory':amountIn>maxInput?'amountLimit':
    quoteAge>maxQuoteAge?'staleQuote':expectedUSDG===0n?'noOutput':'candidate';
  return {reason,shouldAttempt:reason==='candidate',projectedShort};
}
module.exports={planShortConversion,shortAllocation};
