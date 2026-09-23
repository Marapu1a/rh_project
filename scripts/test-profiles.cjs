const profiles=require('./test-profiles.json');
function parseArgs(args,{selfTest=false}={}){
 if(selfTest&&args.length===1&&args[0]==='--self-test')return {profile:'self-test',pattern:null};
 const result={profile:'full',pattern:null},seen=new Set();
 for(let i=0;i<args.length;i+=2){
  const key=args[i];if(!['--profile','--match'].includes(key)||seen.has(key)||!args[i+1])throw Error('Use --profile NAME [--match REGEX]');
  seen.add(key);result[key==='--profile'?'profile':'pattern']=args[i+1];
 }
 if(!Object.hasOwn(profiles,result.profile))throw Error('Unknown test profile: '+result.profile);
 if(result.pattern)new RegExp(result.pattern);
 return result;
}
module.exports={profiles,parseArgs};
