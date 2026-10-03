// Local wallet-cycle clock: multiple transaction blocks may share a wall-clock second.
// Otherwise interval mining plus automined transactions adds fictitious seconds and
// eventually trips the real RNG clock-ahead guard. No production timing changes.
const base=require('./public-hardhat.config.cjs');
module.exports={...base,networks:{hardhat:{...base.networks.hardhat,allowBlocksWithSameTimestamp:true}}};
