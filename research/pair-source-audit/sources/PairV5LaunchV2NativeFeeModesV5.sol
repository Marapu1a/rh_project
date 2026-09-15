// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PairV5LaunchV2NativeFeeVaultFactoryV2} from "./PairV5LaunchV2NativeFeeVaultFactoryV2.sol";
import {PairV5LaunchV2NativeFeeVaultFactoryV3} from "./PairV5LaunchV2NativeFeeVaultFactoryV3.sol";

/// @notice Version-5 FeeSharing handler selecting the atomic-transition vault for future launches.
contract PairV5LaunchV2NativeFeeSharingModeV5 {
    error InvalidConfiguration();
    address public immutable coordinator;
    PairV5LaunchV2NativeFeeVaultFactoryV2 public immutable vaultFactory;
    constructor(address coordinator_) {
        if(coordinator_==address(0))revert InvalidConfiguration();
        coordinator=coordinator_;
        vaultFactory=new PairV5LaunchV2NativeFeeVaultFactoryV2(coordinator_,1);
    }
    function modeId() external pure returns(uint32){return 1;}
    function modeVersion() external pure virtual returns(uint256){return 5;}
    function supportsAtomicFeeTransition() external pure returns(bool){return true;}
    function resolve(address creator,bytes calldata configuration)
        external pure returns(address[] memory recipients,uint16[] memory shares,bool eligible) {
        eligible=true;
        if(configuration.length==0){recipients=new address[](1);shares=new uint16[](1);recipients[0]=creator;shares[0]=10_000;}
        else(recipients,shares)=abi.decode(configuration,(address[],uint16[]));
        if(recipients.length==0||recipients.length>5||recipients.length!=shares.length)revert InvalidConfiguration();
        uint256 total;
        for(uint256 i;i<recipients.length;++i){
            if(recipients[i]==address(0)||shares[i]==0)revert InvalidConfiguration();
            for(uint256 j;j<i;++j)if(recipients[j]==recipients[i])revert InvalidConfiguration();
            total+=shares[i];
        }
        if(total!=10_000)revert InvalidConfiguration();
    }
}

/// @notice Append-only recovery handler if V5 registration completes but later configuration evidence fails.
contract PairV5LaunchV2NativeFeeSharingRecoveryModeV6 is PairV5LaunchV2NativeFeeSharingModeV5 {
    constructor(address coordinator_) PairV5LaunchV2NativeFeeSharingModeV5(coordinator_) {}
    function modeVersion() external pure override returns(uint256){return 6;}
}

/// @notice Version-5 terminal buyback policy using the same standard-LP-fee
/// vault family. Project-token fees are delivered to the executor and quote
/// fees remain pullable by it for the canonical buyback route.
contract PairV5LaunchV2NativeBuybackBurnModeV5 {
    error InvalidConfiguration();
    address public immutable coordinator;
    PairV5LaunchV2NativeFeeVaultFactoryV2 public immutable vaultFactory;
    constructor(address coordinator_) {
        if(coordinator_==address(0))revert InvalidConfiguration();
        coordinator=coordinator_;
        vaultFactory=new PairV5LaunchV2NativeFeeVaultFactoryV2(coordinator_,2);
    }
    function modeId() external pure returns(uint32){return 2;}
    function modeVersion() external pure returns(uint256){return 5;}
    function resolve(address,bytes calldata configuration)
        external pure returns(address[] memory recipients,uint16[] memory shares,bool eligible) {
        if(configuration.length!=0)revert InvalidConfiguration();
        recipients=new address[](0); shares=new uint16[](0); eligible=false;
    }
}

/// @notice Append-only Mode-2 repair for the immutable V3 buyback executor.
/// @dev V5 keeps its original FactoryV2 binding for deployed and historical
/// handler semantics. Future reviewed releases may register V6 while launches
/// are disabled, then use its distinct FactoryV3 vault family.
contract PairV5LaunchV2NativeBuybackBurnModeV6 {
    error InvalidConfiguration();

    address public immutable coordinator;
    PairV5LaunchV2NativeFeeVaultFactoryV3 public immutable vaultFactory;

    constructor(address coordinator_) {
        if (coordinator_ == address(0)) revert InvalidConfiguration();
        coordinator = coordinator_;
        vaultFactory = new PairV5LaunchV2NativeFeeVaultFactoryV3(coordinator_, 2);
    }

    function modeId() external pure returns (uint32) { return 2; }
    function modeVersion() external pure returns (uint256) { return 6; }
    function supportsQuoteByPosition() external pure returns (bool) { return true; }

    function resolve(address, bytes calldata configuration)
        external pure returns (address[] memory recipients, uint16[] memory shares, bool eligible)
    {
        if (configuration.length != 0) revert InvalidConfiguration();
        recipients = new address[](0);
        shares = new uint16[](0);
        eligible = false;
    }
}
