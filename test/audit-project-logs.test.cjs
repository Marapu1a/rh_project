const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('../scripts/direct-buy.cjs'),{audit}=require('../scripts/audit-project-logs.cjs');
const fixture=require('./fixtures/purchase-recognition.cjs').fixture;
test('whole project log audit detects omissions, extra saved logs, wrong chain and branch changes',async()=>{
 const f=fixture(),config={manifest:f.m,lifecycle:f.config},blocks=f.marked(),head=Number(blocks.at(-1).number);
 const s={configHash:D.hash({kind:'persistent-buy-indexer-v1',config}),index:{manifest:f.manifest,blocks,head}};s.checksum=require('../scripts/indexer-checksum.cjs').indexerChecksum(s);
 const relevant=require('../scripts/project-history.cjs'),addresses=relevant.watched(f.manifest,f.config),logs=blocks.flatMap(b=>b.transactions.flatMap(r=>r.receipt.logs)).filter(l=>relevant.relevant(l,f.m,addresses));
 const rpc=async(method,args)=>{if(method==='eth_chainId')return '0x1237';if(method==='eth_getBlockByNumber'){return args[0]==='finalized'?{number:head}:BigInt(args[0])===BigInt(head)?blocks.at(-1):f.m.anchor;}if(method==='eth_getLogs')return args[0].topics?[]:logs;throw Error(method);};
 assert((await audit({config,state:s,rpc})).matched);
 await assert.rejects(audit({config,state:s,rpc:async(m,a)=>m==='eth_getLogs'?[]:rpc(m,a)}),/log mismatch/);
 await assert.rejects(audit({config,state:s,rpc:async(m,a)=>m==='eth_getLogs'&&!a[0].topics?[...logs,{...logs[0],logIndex:999}]:rpc(m,a)}),/log mismatch/);
 await assert.rejects(audit({config,state:s,rpc:async(m,a)=>m==='eth_chainId'?'0x1':rpc(m,a)}),/chain/);
 await assert.rejects(audit({config,state:s,rpc:async(m,a)=>m==='eth_getBlockByNumber'&&a[0]!=='finalized'?{hash:'0xdead'}:rpc(m,a)}),/head changed/);
});
