const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
if(process.argv.length===2){
  for(const mode of ['--limits','--behavior','--fitting'])execFileSync(process.execPath,[__filename,mode],{stdio:'inherit'});
}else{
  const unlimited=process.argv.includes('--behavior');
  const fitting=process.argv.includes('--fitting');
  // Must be selected before Hardhat is loaded. Explicit config in BOTH modes.
  process.env.HARDHAT_CONFIG=path.resolve(unlimited?'research/controller-size/hardhat.config.cjs':'hardhat.config.cjs');
  const {ethers}=require('ethers'),hre=require('hardhat'),{compileVariant}=require('./controller-size-study.cjs');
  const model=require('./short-outcome.cjs'),shortModel=require('./short-settlement.cjs'),dataset=require('./short-dataset.cjs');
  const coder=ethers.AbiCoder.defaultAbiCoder(),id=ethers.id;
  const rpc=(m,p=[])=>hre.network.provider.send(m,p),sent=async p=>(await p).wait();
  const reject=async fn=>assert.rejects(async()=>sent(fn()));
  const checks=[];
  const done=name=>{checks.push(name);console.log('PASS',name);};
  const ps=Array.from({length:12},(_,i)=>({wallet:ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(100+i),20)),firstAttempt:1n,lastAttempt:1n}));
  const rules={version:1,pNumerator:2,pDenominator:5,hNumerator:1,hDenominator:1};
  const root=()=>ps.reduce((r,p)=>ethers.keccak256(coder.encode(['bytes32','address','uint128','uint128'],[r,p.wallet,p.firstAttempt,p.lastAttempt])),id('MONTH_DATASET_SIZE_STUDY_V1'));
  async function run(){
    const {artifacts:a,report}=compileVariant(fitting?{viaIR:true,helpers:true,runs:1}:{});await rpc('hardhat_reset');
    const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
    const admin=await provider.getSigner(),other=await provider.getSigner(1);
    const deploy=async(name,args=[])=>{const c=await new ethers.ContractFactory(a[name].abi,a[name].evm.bytecode.object,admin).deploy(...args);await c.waitForDeployment();return c;};
    const token=await deploy('MockToken'),quote=await deploy('MockToken'),registry=await deploy('ParticipantRegistry'),random=await deploy('SizeStudyRandom');
    const futureVault=ethers.getCreateAddress({from:await admin.getAddress(),nonce:await provider.getTransactionCount(await admin.getAddress())+1});
    const setup={vault:futureVault,registry:registry.target,instance:id('size study'),governor:await admin.getAddress(),publisher:await admin.getAddress(),provider:random.target,
      notice:3600,confirmations:2,maxBudget:1000,maxGasPrice:1000000000000n,nativeFloor:10};
    if(!unlimited && !fitting){
      // A constructor can bind a future vault. This specifically isolates the
      // runtime size failure, rather than a failing readiness/funding check.
      const fullFactory=new ethers.ContractFactory(a.FullControllerSizeStudy.abi,a.FullControllerSizeStudy.evm.bytecode.object,admin);
      const tx=await fullFactory.getDeployTransaction(setup,rules,[7,5,3]);
      await assert.rejects(()=>rpc('eth_estimateGas',[{from:setup.governor,data:tx.data}]),
        /code is too large|contract code.*large|exceeds.*code size/i);
      done('standard EVM rejects oversized full controller');
      const small=await deploy('ShortRngSizeStudy',[setup,rules,[7,5,3]]);
      assert.equal((await provider.getCode(small.target)).length/2-1,report.sizes.ShortRngSizeStudy.runtime);
      done('Short plus RNG roles readiness deploys with standard size enforcement');
    }else{
      const source=await deploy('FullControllerSizeStudy',[setup,rules,[7,5,3]]);
      if(fitting){
        assert.equal((await provider.getCode(source.target)).length/2-1,report.sizes.FullControllerSizeStudy.runtime);
        assert(report.sizes.FullControllerSizeStudy.runtime<=24576);
        done('viaIR plus fixed helper deploys with standard size enforcement');
      }
      const vault=await deploy('PromoVault',[token.target,quote.target,source.target,100]);
      assert.equal(vault.target,futureVault);assert.equal(await vault.drawController(),source.target);
      await sent(quote.mint(await admin.getAddress(),20000));await sent(quote.approve(vault.target,20000));
      await sent(vault.fundUSDG(10000,1));await sent(vault.fundUSDG(1000,2));
      await rpc('evm_increaseTime',[30*86400+1]);await rpc('evm_mine');
      const cutoff=async()=>{const b=await provider.getBlock('latest');await rpc('hardhat_mine',['0x2']);return b;};
      const b=await cutoff(),drawId=id('short'),pid=id('short proposal');
      const request={drawId,campaignId:1,rulesEpoch:1,cutoffBlockNumber:b.number,cutoffBlockHash:b.hash,
        snapshotHash:id('synthetic short'),expectedRoot:dataset.rootFor(ps),expectedCount:12,expectedAttempts:12,budget:101};
      await reject(()=>source.connect(other).begin(pid,request));
      await reject(()=>source.begin(pid,{...request,budget:1001}));
      await sent(source.begin(pid,request));await sent(source.publish(pid,ps));
      await reject(()=>source.seal(pid));assert.equal(await vault.reserved(quote.target),0n);
      await sent(admin.sendTransaction({to:source.target,value:1000}));
      await sent(random.setReady(false));await reject(()=>source.seal(pid));await sent(random.setReady(true));
      await reject(()=>source.seal(pid,{gasPrice:1000000000001n}));
      await sent(random.setFailure(true));await reject(()=>source.seal(pid));
      assert.equal(await vault.reserved(quote.target),0n);assert.equal(await source.pendingDatasetDraw(),ethers.ZeroHash);
      assert.equal((await source.datasetProposal(pid)).status,2n);assert.equal(await random.nextId(),0n);
      await sent(random.setFailure(false));await sent(source.connect(other).seal(pid));
      const shortKey=await source.drawRequest(drawId);assert.equal(shortKey,1n);
      assert.equal((await source.requests(shortKey)).context,(await source.datasetProposal(pid)).context);
      await reject(()=>source.fulfill(shortKey,ethers.ZeroHash));
      await reject(()=>source.seal(pid));
      done('publisher/budget/readiness checks and RNG request failure leave no frozen Short');

      const prepareMonth=async label=>{
        const b=await cutoff(),drawId=id(label);await sent(source.beginMonth({drawId,snapshotHash:id('synthetic '+label),root:root(),campaign:1,
          cutoff:b.number,cutoffHash:b.hash,count:ps.length,attempts:ps.length}));
        for(let i=0;i<ps.length;i+=4)await sent(source.publishMonth(drawId,ps.slice(i,i+4)));return drawId;
      };
      const monthId=await prepareMonth('month win');
      await reject(()=>source.sealMonth(monthId));assert.equal(await vault.freeCurrent(),1000n);
      await sent(vault.fundUSDG(100,3));await sent(source.connect(other).sealMonth(monthId));
      assert.equal(await source.pendingDatasetDraw(),drawId);assert.equal(await source.pendingMonth(),monthId);
      assert.equal(await vault.reserved(quote.target),1101n);
      const monthKey=await source.drawRequest(monthId);assert.equal(monthKey,2n);
      done('Monthly reserves actual Current only after Next is full; Short remains independent');
      const monthSeed=async(drawId,win)=>{
        const m=await source.month(drawId),r=await source.monthRules();
        for(let i=0;i<1000;i++){const seed=id('fixture seed '+i),out=model.compute(m.context,seed,ps,r,[m.budget]);
          if(Boolean(out.winners.length)===win)return {seed,out};}throw Error('Fixture seed search failed');
      };
      const expected=await monthSeed(monthId,true);await sent(random.deliver(monthKey,expected.seed));
      await reject(()=>random.deliver(monthKey,id('reroll')));
      await reject(()=>source.finishMonth(monthId));await reject(()=>source.processMonth(monthId,1,ps.slice(4,8)));
      for(let i=0;i<3;i++)await sent(source.connect(other).processMonth(monthId,i,ps.slice(i*4,i*4+4)));
      assert.equal((await source.month(monthId)).winner.toLowerCase(),expected.out.winners[0]);
      await sent(quote.blockRecipient('0x000000000000000000000000000000000000dEaD'));await sent(quote.burn(vault.target,1));
      await reject(()=>source.finishMonth(monthId));assert.equal(await source.pendingMonth(),monthId);
      assert.equal((await source.month(monthId)).seed,expected.seed);
      await sent(quote.mint(vault.target,1));await sent(source.connect(other).finishMonth(monthId));
      assert.equal(await vault.reward(monthId,expected.out.winners[0]),1000n);
      assert.equal(await vault.freeNext(),0n);assert.equal(await vault.freeCurrent(),100n);
      await reject(()=>source.finishMonth(monthId));done('Monthly winner matches independent selection; failed finalize retries without reroll');

      await sent(random.deliver(shortKey,ethers.ZeroHash));await reject(()=>random.deliver(shortKey,ethers.ZeroHash));
      await sent(source.connect(other).processShort(drawId,0,ps));
      const shortContext=(await source.datasetProposal(pid)).context;
      const shortExpected=shortModel.compute(shortContext,ethers.ZeroHash,ps,rules,Array.from(await source.datasetBasket(pid)));
      assert.equal((await source.shortResult(drawId)).resultHash,shortExpected.resultHash);
      await sent(source.connect(other).finishShort(drawId));
      assert.equal(await vault.reward(monthId,expected.out.winners[0]),1000n);
      done('same provider routes independent requests; zero Short seed and old monthly debt survive');

      await rpc('evm_increaseTime',[30*86400+1]);await rpc('evm_mine');await sent(vault.fundUSDG(100,3));
      const noWin=await prepareMonth('month no win');await sent(source.sealMonth(noWin));
      const noWinSeed=await monthSeed(noWin,false);await sent(random.deliver(await source.drawRequest(noWin),noWinSeed.seed));
      await sent(vault.fundUSDG(50,2));for(let i=0;i<3;i++)await sent(source.processMonth(noWin,i,ps.slice(i*4,i*4+4)));
      await sent(source.finishMonth(noWin));assert.equal(await vault.freeCurrent(),150n);assert.equal(await vault.freeNext(),100n);
      assert.equal(await vault.reserved(quote.target),0n);
      await sent(vault.claim(monthId,expected.out.winners[0]));assert.equal(await quote.balanceOf(expected.out.winners[0]),1000n);
      const terminal=await source.queryFilter(source.filters.AttemptsConsumed());assert.equal(terminal.length,3);
      done('Monthly no-win preserves jackpot/Next/new funding and old reward remains claimable');
      await sent(source.proposePublisher(await other.getAddress()));await reject(()=>source.acceptPublisher());
      await sent(source.connect(other).acceptPublisher());assert.equal(await source.publisher(),await other.getAddress());
      assert.equal(await source.randomProvider(),random.target);assert.equal(await vault.drawController(),source.target);
      done('two-step publisher rotation cannot replace fixed provider or vault controller');
    }
    const output={schema:'controller-size-check-v1',unlimitedContractSize:unlimited,solc:require('solc').version(),viaIR:report.viaIR,runs:report.runs,helpers:report.helpers,checks};
    fs.writeFileSync(`research/controller-size/${fitting?'fitting':unlimited?'behavior':'limits'}-check.json`,JSON.stringify(output,null,2)+'\n');
  }
  run().catch(e=>{console.error(e);process.exitCode=1;});
}
