// UI state machine for the isolated demo; no injected wallet or public sender.
(function(root){
  'use strict';
  const unresolved = new Set(['submitting','unknown','pending']);
  function amountRaw(value){
    if(!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value))throw Error('Enter USDG with up to 6 decimal places.');
    const [whole,fraction='']=value.split('.'), n=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
    if(n<=0n||n>=1n<<128n)throw Error('Enter a positive amount within the supported range.');
    return n.toString();
  }
  class Review {
    constructor({adapter,storage,onChange=()=>{},now=()=>Date.now(),timeout=20000}){
      Object.assign(this,{adapter,storage,onChange,now,timeout});this.revision=0;this.checking=false;
      try{const saved=JSON.parse(storage.getItem('qianqi.purchase-demo.v1'));this.state=saved||{status:'idle'};
        if(saved&&!['idle','loading','checking','review','error','rejected','confirmed','reverted','submitting','unknown','pending'].includes(saved.status))throw Error();
        if(saved&&unresolved.has(saved.status))this.state={...saved,status:saved.hash?'pending':'unknown'};
        else this.state={status:'idle'};
      }catch{this.state={status:'unknown',message:'Saved state cannot be read. Do not repeat the request.'};}
    }
    set(next){
      // Persist before a wallet request; storage failure prevents sending.
      this.storage.setItem('qianqi.purchase-demo.v1',JSON.stringify(next));this.state=next;this.onChange(next);
    }
    blocked(){return unresolved.has(this.state.status);}
    invalidate(){this.revision++;if(!this.blocked())this.set({status:'idle',message:'Details changed. Review a fresh quote.'});}
    async review(value){
      if(this.blocked()||this.state.status==='loading')return;
      const version=++this.revision;this.set({status:'loading'});
      try{
        const amount=amountRaw(value), identity=await this.adapter.identity();
        if(identity.chainId!=='0x1237')throw Error('Switch to Robinhood Chain before reviewing.');
        const plan=await this.adapter.prepare({amountRaw:amount,identity});
        if(version!==this.revision)return;
        if(plan.amountRaw!==amount||plan.expiresAt<=this.now()||!['reset-usdg-approval','approve-usdg','approve-router','buy'].includes(plan.kind))throw Error('Quote unavailable. Review again.');
        this.set({status:'review',identity,plan});
      }catch(e){if(version===this.revision)this.set({status:'error',message:e.message});}
    }
    async confirm(){
      if(this.state.status!=='review')return;
      const original=this.state, version=this.revision;
      // Lock synchronously: double clicks cannot start two requests.
      this.set({...original,status:'checking'});
      try{
        const current=await this.adapter.identity();
        if(version!==this.revision)return;
        if(current.account!==original.identity.account||current.chainId!==original.identity.chainId||original.plan.expiresAt<=this.now()){
          this.set({status:'error',message:'Wallet, network or quote changed. Review again.'});return;
        }
      }catch(e){if(version===this.revision)this.set({status:'error',message:'Cannot check wallet. Review again.'});return;}
      try{this.set({...original,status:'submitting'});}catch{this.state={status:'error',message:'Cannot save the request. Nothing sent.'};this.onChange(this.state);return;}
      let timer;
      // A late wallet response still resolves an unknown state; never resend on timeout.
      timer=setTimeout(()=>{if(this.state.status==='submitting')this.set({...this.state,status:'unknown',message:'Wallet response missing. Check the wallet before doing anything else.'});},this.timeout);
      try{
        const hash=await this.adapter.send(original.plan);
        if(!/^0x[0-9a-f]{64}$/i.test(hash))throw Error('Missing hash');
        this.set({...original,status:'pending',hash});
      }catch(e){
        if(Number(e.code)===4001)this.set({status:'rejected',message:'Request declined. You can review again.'});
        else this.set({...original,status:'unknown',message:'Submission is uncertain. Do not send it again.'});
      }finally{clearTimeout(timer);}
    }
    async check(){
      if(this.state.status!=='pending'||this.checking)return;this.checking=true;
      const pending=this.state;
      try{
        const receipt=await this.adapter.receipt(pending.hash);
        if(!receipt)return;
        if(receipt.hash!==pending.hash||!['success','reverted'].includes(receipt.status))throw Error();
        this.set({...pending,status:receipt.status==='success'?'confirmed':'reverted'});
      }catch{this.set({...pending,message:'Receipt unavailable. Keep this hash and check again.'});}
      finally{this.checking=false;}
    }
  }
  const api={Review,amountRaw};if(typeof module!=='undefined')module.exports=api;else root.PurchaseReview=api;
})(globalThis);
