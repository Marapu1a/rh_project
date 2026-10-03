const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
async function setup(){
 let now=1000,tick;const elements={},events={},handlers={},calls=[];
 const account='0x098afA6731239a00CE0aff669aaefD16b7C72114';
 const element=id=>elements[id]??=( {value:'',disabled:false,textContent:'',append(o){this.value ||= o.value;}} );
 const provider={request:async({method})=>{calls.push(method);if(method==='eth_chainId')return '0x1237';if(['eth_accounts','eth_requestAccounts'].includes(method))return [account];throw Error('Unexpected wallet send');},on:(event,fn)=>{(handlers[event]??=[]).push(fn);}};
 const context={document:{getElementById:element,createElement:()=>({})},location:{hash:'#session',pathname:'/'},history:{replaceState(){}},localStorage:{getItem:()=>null,setItem(){}},Date:{now:()=>now},setInterval:fn=>{tick=fn;},Event:class{constructor(type){this.type=type;}},window:{addEventListener:(type,fn)=>{events[type]=fn;},dispatchEvent:()=>events['eip6963:announceProvider']({detail:{info:{uuid:'wallet',name:'MetaMask'},provider}})},fetch:async route=>{
  calls.push(route);const values={'/view':{allowSend:true,governor:account},'/prepare':{id:'review',expiresAt:now+60000,request:{data:'0x1234'}},'/refresh':{completed:0,pending:null}};
  assert(route in values,'Unexpected endpoint '+route);return {ok:true,json:async()=>values[route]};
 }};
 vm.runInNewContext(fs.readFileSync('scripts/deployment-console/app.js','utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));
 return {element,handlers,calls,expire:()=>{now+=61000;tick();}};
}
test('reconnect and refresh preserve a valid reviewed step without any wallet send',async()=>{
 const f=await setup();assert(f.element('review').disabled);
 await f.element('connect').onclick();await f.element('review').onclick();assert.equal(f.element('sign').disabled,false);
 await f.element('connect').onclick();assert.equal(f.element('sign').disabled,false);
 await f.element('refresh').onclick();assert.equal(f.element('sign').disabled,false);
 assert.equal(f.handlers.accountsChanged.length,1);assert.equal(f.calls.includes('/intent'),false);
});
test('account changes and expiry disable signing and provide recovery instructions',async()=>{
 const f=await setup();await f.element('connect').onclick();await f.element('review').onclick();
 f.handlers.accountsChanged[0]();assert(f.element('sign').disabled);assert(f.element('review').disabled);
 await f.element('connect').onclick();await f.element('review').onclick();f.expire();
 assert(f.element('sign').disabled);assert.match(f.element('status').textContent,/устарела/);
});
