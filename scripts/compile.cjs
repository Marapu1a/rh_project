const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');
function compile() {
  const sources = {};
  for (const dir of ['contracts', 'test/contracts']) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.sol')) sources[`${dir}/${name}`] = {content: fs.readFileSync(`${dir}/${name}`, 'utf8')};
    }
  }
  const result = JSON.parse(solc.compile(JSON.stringify({language: 'Solidity', sources, settings: {
    optimizer: {enabled: true, runs: 200}, evmVersion: 'cancun',
    outputSelection: {'*': {'*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object']}}
  }}), {import: file => {
    try { return {contents: fs.readFileSync(path.join('node_modules', file), 'utf8')}; }
    catch { return {error: `Missing import ${file}`}; }
  }}));
  const errors = (result.errors || []).filter(e => e.severity === 'error');
  if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  fs.mkdirSync('artifacts', {recursive: true});
  const artifacts = {};
  for (const [file, contracts] of Object.entries(result.contracts)) {
    if (!sources[file]) continue;
    for (const [name, contract] of Object.entries(contracts)) artifacts[name] = contract;
  }
  fs.writeFileSync('artifacts/compiled.json', JSON.stringify(artifacts, null, 2));
  return artifacts;
}
module.exports = {compile};
if (require.main === module) { compile(); console.log('Solidity compilation passed'); }
