// Local storage integrity only. Does not change any ledger/config/on-chain hash.
const {createHash}=require('node:crypto');
const {canonical,hash}=require('./direct-buy.cjs');
function indexerChecksum(payload){return 'sha256-v1:'+createHash('sha256').update(canonical(payload),'utf8').digest('hex');}
function validIndexerChecksum(payload,checksum){
 return typeof checksum==='string'&&(checksum.startsWith('sha256-v1:')?checksum===indexerChecksum(payload):checksum===hash(payload));
}
module.exports={indexerChecksum,validIndexerChecksum};
