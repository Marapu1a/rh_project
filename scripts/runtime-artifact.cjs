const fs=require('node:fs'),{createHash}=require('node:crypto');
function load(file,expected){
 const bytes=fs.readFileSync(file);
 if(!/^[a-f0-9]{64}$/.test(expected)||createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Runtime artifact digest mismatch');
 const result=JSON.parse(bytes);
 if(!result||Array.isArray(result)||!Object.keys(result).length||Object.values(result).some(a=>!Array.isArray(a?.abi)||typeof a?.evm?.bytecode?.object!=='string'||typeof a?.evm?.deployedBytecode?.object!=='string'))throw Error('Invalid runtime artifact');
 return result;
}
module.exports={load};
