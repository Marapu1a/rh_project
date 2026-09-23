const path=require('node:path');
// Node 24 wrapper completion includes process startup, unlike the case-only summary.
module.exports=async function*(events){
 const files=new Map();let total=null,executedCases=0;
 for await(const {type,data} of events){
  const fileCompletion=data.file&&path.resolve(data.name||'')===path.resolve(data.file);
  if(type==='test:complete'&&!fileCompletion&&data.details.type==='test'&&!data.skip&&!data.todo)executedCases++;
  if(type==='test:summary'){
   if(data.file){const key=path.resolve(data.file);files.set(key,{...files.get(key),file:key,caseDurationMs:data.duration_ms,counts:data.counts});}
   else total=data;
  }
  if(type==='test:complete'&&fileCompletion){
   const key=path.resolve(data.file);files.set(key,{...files.get(key),file:key,wallMs:data.details.duration_ms,passed:data.details.passed});
  }
 }
 yield JSON.stringify({schema:'test-file-timings-v1',executedCases,files:[...files.values()].sort((a,b)=>(b.wallMs||0)-(a.wallMs||0)),total},null,2)+'\n';
};
