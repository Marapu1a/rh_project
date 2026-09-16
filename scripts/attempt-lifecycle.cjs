// Permanent accounting/replay format. A source event is NOT proof of fair randomness.
const {Interface,isAddress,isHexString,ZeroAddress,ZeroHash}=require('ethers');
const {replay:replayBuys,canonical,hash}=require('./direct-buy.cjs');

const ABI=new Interface([
  'event AttemptsFrozen(bytes32 indexed drawId,uint8 indexed kind,uint256 cutoffBlockNumber,bytes32 cutoffBlockHash,bytes32 rulesHash,bytes32 snapshotHash)',
  'event AttemptsConsumed(bytes32 indexed drawId,uint8 indexed kind,bytes32 snapshotHash,uint8 outcome,bytes32 resultHash)',
  'event ShortRulesAnnounced(uint64 indexed epoch,bytes32 rulesHash,uint256 eligibleAt)',
  'event ShortRulesActivated(uint64 indexed oldEpoch,uint64 indexed newEpoch,uint256 firstNewBlock)',
  'event ShortEpochEmpty(uint64 indexed epoch,uint256 cutoffBlockNumber,bytes32 cutoffBlockHash,bytes32 snapshotHash)'
]);
const KINDS=['SHORT','MONTHLY'];
const lower=x=>x.toLowerCase();
const requireThat=(ok,message)=>{if(!ok)throw Error(message);};
function integer(x){const n=Number(BigInt(x));requireThat(Number.isSafeInteger(n)&&n>=0,'Invalid block/index');return n;}
function bytes32(x,label){requireThat(isHexString(x,32)&&lower(x)!==ZeroHash,'Invalid '+label);return lower(x);}
function domainFor(manifest,config){
  requireThat(['attempt-lifecycle-v1','attempt-lifecycle-v2'].includes(config.schema),'Unsupported lifecycle schema');
  requireThat(isAddress(config.source)&&lower(config.source)!==ZeroAddress,'Invalid lifecycle source');
  bytes32(config.sourceCodeHash,'source code hash');
  const instanceId=bytes32(config.instanceId,'instance id');
  const domain={schema:config.schema,chainId:BigInt(manifest.chainId).toString(),instanceId,
    registry:lower(manifest.registry),source:lower(config.source),sourceCodeHash:lower(config.sourceCodeHash),buyManifestHash:hash(manifest)};
  if(config.schema==='attempt-lifecycle-v2'){
    const g=config.shortRules;requireThat(g&&integer(g.noticeSeconds)>0,'Missing epoch genesis');
    bytes32(g.rulesHash,'genesis rules');integer(g.startedAt);integer(g.firstBlock);
    domain.shortRulesGenesisHash=hash({rulesHash:lower(g.rulesHash),noticeSeconds:String(integer(g.noticeSeconds)),
      startedAt:String(integer(g.startedAt)),firstBlock:String(integer(g.firstBlock))});
  }
  return domain;
}
function snapshotFor(domain,drawId,kind,cutoff,rulesHash,participants,rulesEpoch){
  const epoch=domain.schema==='attempt-lifecycle-v2'&&kind==='SHORT';
  if(epoch)requireThat(integer(rulesEpoch)>0,'Snapshot epoch required');
  return {schema:epoch?'attempt-snapshot-v2':'attempt-snapshot-v1',domain,drawId,kind,cutoff,rulesHash,participants,
    ...(epoch?{rulesEpoch:String(rulesEpoch)}:{})};
}
function emptyEpochHash(domain,epoch,cutoff,rulesHash){return hash({schema:'short-epoch-empty-v1',domain,epoch:String(epoch),cutoff,rulesHash,participants:[]});}
function reference(manifest,log){
  return {occurrenceId:[manifest.chainId,lower(log.blockHash),lower(log.transactionHash),integer(log.logIndex)].join(':'),
    blockNumber:integer(log.blockNumber),blockHash:lower(log.blockHash),transactionHash:lower(log.transactionHash),
    transactionIndex:integer(log.transactionIndex),logIndex:integer(log.logIndex)};
}
function freshKind(){return {open:0n,consumed:0n,frozen:null};}
function ordered(a,b){return a.blockNumber-b.blockNumber||a.transactionIndex-b.transactionIndex||a.logIndex-b.logIndex;}
function lex(a,b){return a<b?-1:a>b?1:0;}

function replayAttempts(manifest,config,deliveredBlocks){
  // Validate full chain/tx/receipt/log provenance and recompute BUYs ourselves.
  // No caller-supplied eligible/minted list is accepted.
  const buyLedger=replayBuys(manifest,deliveredBlocks);
  const domain=domainFor(manifest,config);
  const blocks=[...new Map(deliveredBlocks.map(b=>[integer(b.number),b])).values()].sort((a,b)=>integer(a.number)-integer(b.number));
  const headers=new Map([[integer(manifest.anchor.number),lower(manifest.anchor.hash)],...blocks.map(b=>[integer(b.number),lower(b.hash)])]);
  const times=new Map(blocks.map(b=>[integer(b.number),integer(b.timestamp)]));
  const epochMode=config.schema==='attempt-lifecycle-v2';
  const epochs=epochMode?[{epoch:1,firstBlock:integer(config.shortRules.firstBlock),rulesHash:lower(config.shortRules.rulesHash)}]:[];
  let currentEpoch=1,drainingEpoch=0,announced=null,lastShortTime=epochMode?integer(config.shortRules.startedAt):0;
  const policy=epoch=>epochs.find(e=>e.epoch===epoch);
  const epochAt=height=>epochs.filter(e=>e.firstBlock<=height).at(-1);
  const events=[],history=new Map();
  for(const d of buyLedger.decisions){
    if(d.status!=='ELIGIBLE')continue;
    const count=BigInt(d.entriesMinted),list=history.get(d.payer)||[];
    list.push({blockNumber:d.blockNumber,total:(list.at(-1)?.total||0n)+count});history.set(d.payer,list);
    events.push({type:'MINT',count,wallet:d.payer,occurrenceId:d.candidateId,blockNumber:d.blockNumber,blockHash:d.blockHash,
      transactionHash:d.transactionHash,transactionIndex:d.transactionIndex,logIndex:d.logIndex});
  }
  const seen=new Set(),known=new Set(ABI.fragments.map(f=>f.topicHash));
  for(const block of blocks)for(const {receipt} of block.transactions)for(const log of receipt.logs){
    if(lower(log.address)!==domain.source||!known.has(log.topics[0]?.toLowerCase()))continue;
    const ref=reference(manifest,log);
    if(seen.has(ref.occurrenceId))continue; // Identical duplicates already checked by BUY replay.
    seen.add(ref.occurrenceId);
    const parsed=ABI.parseLog(log),encoded=ABI.encodeEventLog(parsed.fragment,parsed.args);
    requireThat(canonical(encoded.topics.map(lower))===canonical(log.topics.map(lower))&&lower(encoded.data)===lower(log.data),'Non-canonical lifecycle event');
    if(parsed.name.startsWith('Short')){
      requireThat(epochMode,'Epoch events require lifecycle v2');
      events.push({type:parsed.name,args:parsed.args,...ref});continue;
    }
    const kind=KINDS[Number(parsed.args.kind)];requireThat(kind,'Invalid draw kind');
    events.push({type:parsed.name==='AttemptsFrozen'?'FREEZE':'TERMINAL',kind,drawId:bytes32(parsed.args.drawId,'draw id'),args:parsed.args,...ref});
  }
  const wallets=new Map(),draws=new Map(),transitions=[];
  const pending={SHORT:null,MONTHLY:null},lastTerminal={SHORT:null,MONTHLY:null};
  function walletFor(address){
    if(!wallets.has(address))wallets.set(address,{minted:0n,SHORT:freshKind(),MONTHLY:freshKind()});
    return wallets.get(address);
  }
  function mintedAt(address,height){
    const list=history.get(address)||[];
    let lo=0,hi=list.length;
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if(list[mid].blockNumber<=height)lo=mid+1;else hi=mid;}
    return lo===0?0n:list[lo-1].total;
  }
  function checkInvariants(){
    for(const w of wallets.values())for(const kind of KINDS){
      const s=w[kind],frozen=s.frozen?BigInt(s.frozen.count):0n;
      requireThat(s.open>=0n&&s.consumed>=0n&&w.minted===s.open+s.consumed+frozen,'Attempt conservation failed');
      if(s.frozen){
        requireThat(pending[kind]===s.frozen.drawId,'Frozen draw is not pending');
        requireThat(BigInt(s.frozen.firstAttempt)===s.consumed+1n&&BigInt(s.frozen.lastAttempt)===s.consumed+frozen,'Invalid cumulative range');
      }
    }
  }
  for(const event of events.sort(ordered)){
    const {type,args,kind,drawId,...ref}=event;
    if(type==='ShortRulesAnnounced'){
      requireThat(!announced&&!drainingEpoch&&integer(args.epoch)===currentEpoch+1,'Invalid announcement');
      requireThat(integer(args.eligibleAt)===times.get(event.blockNumber)+integer(config.shortRules.noticeSeconds),'Invalid notice');
      announced={epoch:integer(args.epoch),rulesHash:bytes32(args.rulesHash,'rules'),eligibleAt:integer(args.eligibleAt)};
      transitions.push({type,...announced,source:ref});
    }else if(type==='ShortRulesActivated'){
      requireThat(announced&&!pending.SHORT&&integer(args.oldEpoch)===currentEpoch&&integer(args.newEpoch)===announced.epoch,'Invalid activation');
      requireThat(times.get(event.blockNumber)>=announced.eligibleAt&&times.get(event.blockNumber)>=lastShortTime+21600,'Activation before notice/schedule');
      requireThat(integer(args.firstNewBlock)===event.blockNumber+1,'Retroactive activation');
      drainingEpoch=currentEpoch;currentEpoch=announced.epoch;
      epochs.push({epoch:currentEpoch,rulesHash:announced.rulesHash,firstBlock:integer(args.firstNewBlock)});announced=null;
      transitions.push({type,oldEpoch:drainingEpoch,newEpoch:currentEpoch,firstNewBlock:integer(args.firstNewBlock),source:ref});
    }else if(type==='ShortEpochEmpty'){
      requireThat(drainingEpoch&&integer(args.epoch)===drainingEpoch&&!pending.SHORT,'Invalid empty transition');
      const cutoff={blockNumber:integer(args.cutoffBlockNumber),blockHash:bytes32(args.cutoffBlockHash,'cutoff')};
      requireThat(cutoff.blockNumber>=policy(currentEpoch).firstBlock&&cutoff.blockNumber<event.blockNumber
        &&headers.get(cutoff.blockNumber)===cutoff.blockHash,'Invalid empty cutoff');
      for(const [address,w] of wallets)requireThat(mintedAt(address,policy(currentEpoch).firstBlock-1)===w.SHORT.consumed,'Old epoch is not empty');
      requireThat(emptyEpochHash(domain,drainingEpoch,cutoff,policy(drainingEpoch).rulesHash)===bytes32(args.snapshotHash,'snapshot'),'Empty snapshot mismatch');
      transitions.push({type,epoch:drainingEpoch,cutoff,snapshotHash:lower(args.snapshotHash),source:ref});
      drainingEpoch=0;
    }else if(type==='MINT'){
      if(epochMode)requireThat(epochAt(event.blockNumber),'Mint before genesis epoch');
      const w=walletFor(event.wallet);w.minted+=event.count;
      for(const k of KINDS)w[k].open+=event.count;
      // Zero-entry purchases remain fully visible in buyLedger including carry.
      if(event.count>0n){const {count,wallet,...source}=ref;transitions.push({type,wallet,count:String(count),source,
        ...(epochMode?{shortEpoch:String(epochAt(event.blockNumber).epoch)}:{})});}
    }else if(type==='FREEZE'){
      requireThat(!draws.has(drawId),'Draw id already used');
      requireThat(pending[kind]===null,'Draw kind already pending');
      const cutoff={blockNumber:integer(args.cutoffBlockNumber),blockHash:bytes32(args.cutoffBlockHash,'cutoff hash')};
      requireThat(cutoff.blockNumber>=integer(manifest.anchor.number)&&cutoff.blockNumber<event.blockNumber,'Cutoff must be a completed earlier block');
      requireThat(headers.get(cutoff.blockNumber)===cutoff.blockHash,'Cutoff is not a canonical ancestor');
      requireThat(lastTerminal[kind]===null||cutoff.blockNumber>=lastTerminal[kind],'Cutoff precedes previous terminal');
      const rulesHash=bytes32(args.rulesHash,'rules hash'),participants=[];
      const targetEpoch=epochMode&&kind==='SHORT'?(drainingEpoch||currentEpoch):null;
      let participantCutoff=cutoff.blockNumber;
      if(targetEpoch){
        requireThat(rulesHash===policy(targetEpoch).rulesHash,'Wrong epoch rules');
        requireThat(cutoff.blockNumber>=policy(currentEpoch).firstBlock&&times.get(event.blockNumber)>=lastShortTime+21600,'Epoch cutoff/schedule');
        if(drainingEpoch)participantCutoff=policy(currentEpoch).firstBlock-1;
      }
      for(const [address,w] of [...wallets].sort(([a],[b])=>lex(a,b))){
        const s=w[kind],last=mintedAt(address,participantCutoff),count=last-s.consumed;
        requireThat(count>=0n&&count<=s.open,'Cutoff conflicts with consumed attempts');
        if(count>0n)participants.push({wallet:address,count:String(count),firstAttempt:String(s.consumed+1n),lastAttempt:String(last)});
      }
      if(targetEpoch)requireThat(participants.length>0,'Empty Short must not freeze');
      const snapshot=snapshotFor(domain,drawId,kind,cutoff,rulesHash,participants,targetEpoch),snapshotHash=hash(snapshot);
      requireThat(snapshotHash===bytes32(args.snapshotHash,'snapshot hash'),'Frozen snapshot does not match replay');
      pending[kind]=drawId;
      for(const p of participants){const s=walletFor(p.wallet)[kind];s.open-=BigInt(p.count);s.frozen={drawId,...p};}
      const total=participants.reduce((sum,p)=>sum+BigInt(p.count),0n);
      draws.set(drawId,{drawId,kind,status:'FROZEN',snapshotHash,snapshot,totalAttempts:String(total),freeze:ref,terminal:null});
      transitions.push({type,drawId,kind,snapshotHash,totalAttempts:String(total),source:ref});
    }else{
      const draw=draws.get(drawId);
      requireThat(draw&&draw.kind===kind&&draw.status==='FROZEN'&&pending[kind]===drawId,'Terminal has no matching pending freeze');
      requireThat(bytes32(args.snapshotHash,'snapshot hash')===draw.snapshotHash,'Terminal snapshot mismatch');
      const outcome=Number(args.outcome);requireThat(outcome===0||outcome===1,'Invalid terminal outcome');
      const resultHash=bytes32(args.resultHash,'result hash');
      for(const p of draw.snapshot.participants){
        const s=walletFor(p.wallet)[kind];requireThat(s.frozen?.drawId===drawId,'Frozen ownership mismatch');
        s.consumed+=BigInt(p.count);s.frozen=null;
      }
      draw.status='CONSUMED';draw.terminal={outcome:outcome===0?'NO_WINNER':'WINNER',resultHash,source:ref};
      pending[kind]=null;lastTerminal[kind]=event.blockNumber;
      if(epochMode&&kind==='SHORT'){lastShortTime=times.get(event.blockNumber);if(drainingEpoch===Number(draw.snapshot.rulesEpoch))drainingEpoch=0;}
      transitions.push({type,drawId,kind,snapshotHash:draw.snapshotHash,outcome:draw.terminal.outcome,resultHash,totalAttempts:draw.totalAttempts,source:ref});
    }
    checkInvariants();
  }
  const balances=[...wallets].sort(([a],[b])=>lex(a,b)).map(([wallet,w])=>{
    const balance={wallet};
    for(const kind of KINDS){const s=w[kind];balance[kind]={mintedTotal:String(w.minted),open:String(s.open),
      frozenByDraw:s.frozen?{[s.frozen.drawId]:{count:s.frozen.count,firstAttempt:s.frozen.firstAttempt,lastAttempt:s.frozen.lastAttempt}}:{},consumedTotal:String(s.consumed)};}
    if(epochMode)balance.SHORT.byEpoch=epochs.map((e,i)=>{
      const first=mintedAt(wallet,e.firstBlock-1)+1n,last=mintedAt(wallet,(epochs[i+1]?.firstBlock??(buyLedger.head.number+1))-1);
      const total=last>=first?last-first+1n:0n;
      const consumed=w.SHORT.consumed<first?0n:(w.SHORT.consumed<last?w.SHORT.consumed:last)-first+1n;
      const frozen=w.SHORT.frozen&&draws.get(w.SHORT.frozen.drawId).snapshot.rulesEpoch===String(e.epoch)?BigInt(w.SHORT.frozen.count):0n;
      const open=total-consumed-frozen;
      requireThat(open>=0n&&consumed>=0n&&frozen>=0n&&total===open+consumed+frozen,'Epoch conservation failed');
      return {epoch:String(e.epoch),minted:String(total),consumed:String(consumed),frozen:String(frozen),open:String(open),
        firstOpenAttempt:open?String(last-open+1n):null,lastOpenAttempt:open?String(last):null};
    });
    if(epochMode)requireThat(balance.SHORT.byEpoch.reduce((sum,e)=>sum+BigInt(e.open),0n)===w.SHORT.open,'Open epoch total mismatch');
    return balance;
  });
  return {schema:epochMode?'attempt-ledger-v2':'attempt-ledger-v1',domain,buyLedger,head:buyLedger.head,finality:buyLedger.finality,
    trust:'Source terminal events are assertions; this replay does not verify RNG, prizes, budget or readiness.',
    pending,draws:[...draws.values()],wallets:balances,transitions,
    ...(epochMode?{shortRules:{currentEpoch,drainingEpoch,announced,epochs,lastTerminalAt:lastShortTime}}:{})};
}
module.exports={replayAttempts,domainFor,snapshotFor,emptyEpochHash,ABI};
