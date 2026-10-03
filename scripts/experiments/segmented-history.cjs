// Disposable storage hypothesis, NOT an indexer or supported persistence format.
// 64-byte synthetic rows; no BUY validation, lifecycle, network, signer or funds.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const WIDTH=64,CHUNK=10000;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function flush(file,bytes){const fd=fs.openSync(file,'w');try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function rows(first,count){const b=Buffer.alloc(count*WIDTH,0x61);for(let i=0;i<count;i++){const n=first+i,o=i*WIDTH;b.writeUInt32LE(n,o);b.writeUInt32LE(n%10000,o+4);b.writeUInt32LE(100+n%97,o+8);}return b;}
function store(dir,b,first){const digest=sha(b),name=digest+'.bin';if(!fs.existsSync(path.join(dir,name)))flush(path.join(dir,name),b);return {name,sha256:digest,first,count:b.length/WIDTH};}
function publish(dir,m){flush(path.join(dir,'manifest.tmp'),JSON.stringify(m));fs.renameSync(path.join(dir,'manifest.tmp'),path.join(dir,'manifest.json'));}
function open(dir){const raw=fs.readFileSync(path.join(dir,'manifest.json')),m=JSON.parse(raw);assert.equal(m.schema,'storage-hypothesis-v1');let next=0;for(const s of m.segments){assert.equal(s.first,next);assert(Number.isInteger(s.count)&&s.count>0&&s.count<=CHUNK);assert.equal(s.name,s.sha256+'.bin');assert(/^[a-f0-9]{64}$/.test(s.sha256));next+=s.count;}assert.equal(m.count,next);return {m,bytes:raw.length};}
function read(dir,s){const b=fs.readFileSync(path.join(dir,s.name));assert.equal(b.length,s.count*WIDTH);assert.equal(sha(b),s.sha256,'segment checksum');return b;}
function tail(dir,count){const {m,bytes}=open(dir);let readBytes=bytes,seen=0,sum=0;const from=Math.max(0,m.count-count);
 for(const s of m.segments){if(s.first+s.count<=from)continue;const b=read(dir,s);readBytes+=b.length;for(let i=Math.max(0,from-s.first);i<s.count;i++){const n=s.first+i;assert.equal(b.readUInt32LE(i*WIDTH),n);assert.equal(b.readUInt32LE(i*WIDTH+4),n%10000);assert.equal(b.readUInt32LE(i*WIDTH+8),100+n%97);sum+=b.readUInt32LE(i*WIDTH+8);seen++;}}
 assert.equal(seen,Math.min(count,m.count));return {count:m.count,rows:seen,sum,readBytes,manifestBytes:bytes};}
function append(dir,count,{failBeforePublish=false}={}){const {m,bytes}=open(dir);let next=m.count,left=count,written=0;while(left){const n=Math.min(left,CHUNK),b=rows(next,n);m.segments.push(store(dir,b,next));next+=n;left-=n;written+=b.length;}m.count=next;if(failBeforePublish)throw Error('injected before publication');publish(dir,m);return {count:m.count,readBytes:bytes,writtenBytes:written+fs.statSync(path.join(dir,'manifest.json')).size};}
function rollback(dir,count){const {m,bytes}=open(dir);assert(count>=0&&count<m.count);let readBytes=bytes,writtenBytes=0;const kept=[];
 for(const s of m.segments){if(s.first>=count)break;if(s.first+s.count<=count)kept.push(s);else{const b=read(dir,s);readBytes+=b.length;const prefix=b.subarray(0,(count-s.first)*WIDTH);kept.push(store(dir,prefix,s.first));writtenBytes+=prefix.length;}}
 m.segments=kept;m.count=count;publish(dir,m);return {count,readBytes,writtenBytes:writtenBytes+fs.statSync(path.join(dir,'manifest.json')).size};}
function audit(dir){const {m,bytes}=open(dir);let readBytes=bytes,total=0;for(const s of m.segments){const b=read(dir,s);readBytes+=b.length;for(let i=0;i<s.count;i++){const n=s.first+i;assert.equal(b.readUInt32LE(i*WIDTH),n);assert.equal(b.readUInt32LE(i*WIDTH+4),n%10000);assert.equal(b.readUInt32LE(i*WIDTH+8),100+n%97);total++;}}assert.equal(total,m.count);return {rows:total,readBytes};}
function timed(fn){const start=performance.now(),result=fn();return {...result,elapsedMs:performance.now()-start,peakRssKiB:process.resourceUsage().maxRSS};}
function worker(dir,size){
 fs.mkdirSync(dir);publish(dir,{schema:'storage-hypothesis-v1',count:0,segments:[]});
 const seed=timed(()=>append(dir,size)),tailRead=timed(()=>tail(dir,100));
 const child=spawnSync(process.execPath,[__filename,'--reopen',dir],{encoding:'utf8',timeout:60000});assert.equal(child.status,0,child.stderr);const restart=JSON.parse(child.stdout);
 const before=fs.readFileSync(path.join(dir,'manifest.json'));const appendOne=timed(()=>append(dir,1));assert.equal(tail(dir,1).count,size+1);
 const rollbackTail=timed(()=>rollback(dir,size-37));assert.equal(tail(dir,100).count,size-37);
 const resume=timed(()=>append(dir,38));assert.equal(tail(dir,100).count,size+1);
 const committed=fs.readFileSync(path.join(dir,'manifest.json'));assert.throws(()=>append(dir,7,{failBeforePublish:true}),/injected/);assert.deepEqual(fs.readFileSync(path.join(dir,'manifest.json')),committed);assert.equal(tail(dir,100).count,size+1);
 const s=open(dir).m.segments.at(-1),file=path.join(dir,s.name),good=fs.readFileSync(file),bad=Buffer.from(good);bad[12]^=1;flush(file,bad);assert.throws(()=>tail(dir,100),/checksum/);flush(file,good);
 // Restore an earlier complete manifest; immutable old chunks were never removed.
 flush(path.join(dir,'manifest.tmp'),before);fs.renameSync(path.join(dir,'manifest.tmp'),path.join(dir,'manifest.json'));assert.equal(tail(dir,100).count,size);
 const fullAudit=timed(()=>audit(dir));
 return {size,seed,tailRead,restart,appendOne,rollbackTail,resume,fullAudit,checks:{freshProcess:true,partialSegmentRollback:true,orphanIgnored:true,corruptTailRejected:true,oldManifestRestore:true},retainedBytes:fs.readdirSync(dir).reduce((n,f)=>n+fs.statSync(path.join(dir,f)).size,0)};
}
function main(){
 if(process.argv[2]==='--reopen'){console.log(JSON.stringify(timed(()=>tail(process.argv[3],100))));return;}
 if(process.argv[2]==='--worker'){console.log(JSON.stringify(worker(process.argv[3],Number(process.argv[4]))));return;}
 const dir=process.argv[2],sizes=(process.argv[3]||'100000,1000000,5000000').split(',').map(Number);
 if(!dir||fs.existsSync(dir)||sizes.some(n=>!Number.isSafeInteger(n)||n<100||n>5000000))throw Error('New output directory and sizes 100..5000000 required');
 fs.mkdirSync(dir,{recursive:true});const report={date:new Date().toISOString(),scope:'64-byte synthetic rows, immutable chunks and small manifest; no crypto project replay or throughput claim; single writer; warm OS cache',width:WIDTH,chunkRows:CHUNK,node:process.version,platform:process.platform,rows:[]};
 for(const size of sizes){const child=spawnSync(process.execPath,[__filename,'--worker',path.resolve(dir,String(size)),String(size)],{encoding:'utf8',timeout:300000});assert.equal(child.status,0,child.stderr);const r=JSON.parse(child.stdout);report.rows.push(r);fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(size,'seed',Math.round(r.seed.elapsedMs)+'ms','tail',Math.round(r.tailRead.elapsedMs)+'ms','append',Math.round(r.appendOne.elapsedMs)+'ms');}
}
main();
