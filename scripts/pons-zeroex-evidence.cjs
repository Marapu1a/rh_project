// Offline forensic report for captured quotes/receipts. NOT a BUY admission adapter.
const assert=require('node:assert/strict'),E=require('ethers'),V=require('./pons-v4-buy.cjs');
const HOLDER='0x0000000000001ff3684f28c67538d4d072c22734';
const outerAbi=new E.Interface(['function exec(address operator,address token,uint256 amount,address target,bytes data) payable returns(bytes)']);
const innerAbi=new E.Interface(['function execute((address recipient,address buyToken,uint256 minAmountOut) slippage,bytes[] actions,bytes32 zid) payable returns(bool)']);
const transferAbi=new E.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const curveAbi=new E.Interface(require('./integrations/pons-v2.cjs').CUR);
const low=x=>String(x).toLowerCase();
function inspect(row){
 const {tx,receipt}=row.execution,q=row.response.quote,b=row.body;
 // Reuse the existing diagnostic's full receipt/log identity checks.
 require('./pons-channel-attribution.cjs').inspect({chainId:4663,curve:row.venue?.curve||E.ZeroAddress,quote:b.sellToken,token:b.buyToken},tx,receipt);
 assert.equal(BigInt(receipt.status),1n,'Failed execution');assert.equal(low(tx.hash),low(receipt.transactionHash),'Receipt identity');assert.equal(BigInt(tx.chainId),4663n,'Chain');
 assert.equal(low(tx.from),low(b.taker),'Taker');assert.equal(low(tx.to),HOLDER,'Entrypoint');assert.equal(low(q.allowanceTarget),HOLDER,'Allowance target');
 assert.equal(low(tx.input),low(q.transaction.data),'Submitted calldata');assert.equal(BigInt(tx.value),BigInt(q.transaction.value||0),'Submitted value');
 const outer=outerAbi.parseTransaction({data:tx.input}),inner=innerAbi.parseTransaction({data:outer.args.data});
 assert.equal(low(outer.args.token),low(b.sellToken),'Sell token');assert.equal(outer.args.amount,BigInt(b.sellAmountWei),'Sell amount');assert.equal(low(outer.args.operator),low(outer.args.target),'Operator');
 assert.equal(low(inner.args.slippage.recipient),low(tx.from),'Recipient');assert.equal(low(inner.args.slippage.buyToken),low(b.buyToken),'Buy token');
 const transfers=receipt.logs.filter(l=>l.topics[0]===transferAbi.getEvent('Transfer').topicHash&&l.topics.length===3).map(l=>{const p=transferAbi.parseLog(l).args;return {token:low(l.address),from:low(p.from),to:low(p.to),value:BigInt(p.value)};});
 const net=(token,owner)=>transfers.filter(t=>t.token===low(token)).reduce((n,t)=>n+(t.to===low(owner)?t.value:0n)-(t.from===low(owner)?t.value:0n),0n);
 const debit=-net(b.sellToken,tx.from),received=net(b.buyToken,tx.from);
 assert.equal(debit,BigInt(row.before.sell)-BigInt(row.after.sell),'Sell balance/receipt mismatch');assert.equal(received,BigInt(row.after.buy)-BigInt(row.before.buy),'Buy balance/receipt mismatch');assert(received>=inner.args.slippage.minAmountOut,'Minimum output');
 const curves=receipt.logs.filter(l=>l.topics[0]===curveAbi.getEvent('CurveBuy').topicHash).map(l=>{const p=curveAbi.parseLog(l).args;return {curve:low(l.address),buyer:low(p.buyer),recipient:low(p.recipient),quoteIn:String(p.quoteIn),tokensOut:String(p.tokensOut)};});
 const swaps=receipt.logs.filter(l=>low(l.address)===V.PINS.manager[0]&&l.topics[0]===V.SWAP.getEvent('Swap').topicHash).map(l=>{const p=V.SWAP.parseLog(l).args;return {poolId:low(p.id),sender:low(p.sender),amount0:String(p.amount0),amount1:String(p.amount1)};});
 const v=row.venue,expectedPoolId=v?.phase==='2'?V.poolId([...[v.token,v.quote].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1),v.poolFee,v.tickSpacing,v.hook]):null;
 return {admission:'NOT_IMPLEMENTED',payer:low(tx.from),recipient:low(inner.args.slippage.recipient),settler:low(outer.args.target),walletDebitRaw:String(debit),walletReceivedRaw:String(received),refundToPayerRaw:String(transfers.filter(t=>t.token===low(b.sellToken)&&t.to===low(tx.from)).reduce((n,t)=>n+t.value,0n)),actionSelectors:Array.from(inner.args.actions,a=>a.slice(0,10)),curves,swaps,expectedPoolId,targetPoolSwaps:expectedPoolId?swaps.filter(s=>s.poolId===expectedPoolId).length:null,transfers:transfers.map(t=>({...t,value:String(t.value)}))};
}
module.exports={inspect};
