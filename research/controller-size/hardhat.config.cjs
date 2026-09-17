// Behavioral study ONLY: oversized models cannot be deployed on a normal EVM.
// The normal repository configuration remains unchanged and size rejection is
// checked in a separate process before this explicitly unrestricted local run.
module.exports={solidity:'0.8.37',networks:{hardhat:{chainId:31337,hardfork:'cancun',allowUnlimitedContractSize:true}}};
