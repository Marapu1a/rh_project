const {test}=require('node:test'),assert=require('node:assert/strict'),{Interface,id}=require('ethers');
const {expectedRewards,assertRewards}=require('../scripts/verify-wallet-reward-completeness.cjs');
test('missing, extra, misattributed and wrongly valued API rewards fail explicit completeness',()=>{
 const a=new Interface(['event RewardAssigned(bytes32 indexed drawId,address indexed winner,uint256 amount)','event RewardPaid(bytes32 indexed drawId,address indexed asset,address indexed winner,uint256 amount)']);
 const vault='0x'+'1'.repeat(40),wallet='0x'+'2'.repeat(40),asset='0x'+'3'.repeat(40),draw=id('completeness');
 const logs=[['RewardAssigned',[draw,wallet,70]],['RewardPaid',[draw,asset,wallet,70]]].map(([name,args])=>({address:vault,...a.encodeEventLog(a.getEvent(name),args)}));
 const expected=expectedRewards([{transactions:[{receipt:{logs}}]}],vault);assert.equal(expected.length,1);assert.equal(expected[0].status,'paid');
 const view={rewards:{items:expected,total:1}};assertRewards(view,expected);
 assert.throws(()=>assertRewards({rewards:{items:[],total:0}},expected));
 for(const field of ['winner','amountRaw','status'])assert.throws(()=>assertRewards({rewards:{items:[{...expected[0],[field]:'wrong'}],total:1}},expected));
 assert.throws(()=>assertRewards({rewards:{items:[...expected,...expected],total:2}},expected));
 assertRewards({rewards:{items:[],total:0}},[]);
});
