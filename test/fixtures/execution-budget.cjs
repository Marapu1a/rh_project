const {ACTIONS}=require('../../scripts/local-execution-budget.cjs');
// Deliberately conservative local fixture bounds, not measured production prices.
function opsProfile(extra=false){return {schema:'local-execution-budget-v1',network:{
  id:extra?'local-extra-fee':'local-plain',chainId:'31337',nativeDecimals:18,
  feeModel:extra?'LOCAL_EIP1559_EXTRA':'LOCAL_EIP1559',reserveGasPrice:'2000000000',
  extraFeePerTx:extra?'100000000000000':'0',signerBuffer:'100000000000000',safetyBps:12500,
  gasUnits:Object.fromEntries(ACTIONS.map(a=>[a,'3000000']))},
  settings:{maxGasPrice:'2000000000',receiptTimeoutMs:30000,pollSeconds:10}};}
module.exports={opsProfile};
