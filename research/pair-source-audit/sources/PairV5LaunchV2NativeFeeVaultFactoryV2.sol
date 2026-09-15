// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPositionManagerV4} from "./interfaces/IPairV4.sol";
import {PairV5LaunchV2NativeFeeVaultV2} from "./PairV5LaunchV2NativeFeeVaultV2.sol";

/// @notice Immutable factory for atomic-transition native fee vaults.
contract PairV5LaunchV2NativeFeeVaultFactoryV2 {
    address public immutable coordinator;
    address public immutable modeRegistry;
    uint32 public immutable modeId;
    error OnlyCoordinator(); error OnlyRegistry(); error ImmutableImplementation();
    constructor(address coordinator_,uint32 mode_) {
        if(coordinator_==address(0)||(mode_!=1&&mode_!=2))revert OnlyCoordinator();
        coordinator=coordinator_; modeId=mode_;
        (bool ok,bytes memory result)=coordinator_.staticcall(abi.encodeWithSignature("modeRegistry()"));
        if(!ok||result.length!=32||abi.decode(result,(address))==address(0))revert OnlyCoordinator();
        modeRegistry=abi.decode(result,(address));
    }
    function vaultFactoryVersion() external pure returns(uint256){return 2;}
    function upgradeVaultImplementation(address) external view {
        if(msg.sender!=modeRegistry)revert OnlyRegistry();
        revert ImmutableImplementation();
    }
    function deploy(bytes32 salt,IPositionManagerV4 manager,address registrar,address treasury,address project,
        address launchpad,address controller,address executor,address[] calldata recipients,uint16[] calldata shares)
        external returns(address vault) {
        if(msg.sender!=coordinator)revert OnlyCoordinator();
        vault=address(new PairV5LaunchV2NativeFeeVaultV2{salt:salt}(
            manager,registrar,treasury,project,launchpad,controller,executor,modeId,recipients,shares));
    }
}