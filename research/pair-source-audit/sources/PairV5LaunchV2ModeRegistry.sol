// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Append-only capability registry for canonical launch-token modes.
/// @dev This is deliberately outside the launchpad proxy: adding a reviewed
/// mode or version must not consume proxy runtime or repurpose proxy storage.
/// The launchpad binding is immutable and is available to coordinators as an
/// attestation when a registry is wired into a future canonical graph.
interface IPairV5ModeVersionHandler {
    function modeId() external view returns (uint32);
    function modeVersion() external view returns (uint256);
    function resolve(address creator,bytes calldata configuration)
        external view returns(address[] memory recipients,uint16[] memory sharesBps,bool ctoEligible);
    function coordinator() external view returns(address);
    function vaultFactory() external view returns(address);
}
interface IPairV5CanonicalVaultFactory {
    function modeId() external view returns(uint32);
    function upgradeVaultImplementation(address implementation) external;
}
interface IPairV5CanonicalPolicyVault {
    function projectToken() external view returns(address);
    function policyController() external view returns(address);
    function transitionFeeSharing(address[] calldata recipients,uint16[] calldata shares) external;
    function transitionFeeSharingAtomic(address[] calldata recipients,uint16[] calldata shares) external;
}
interface IPairV5AtomicPolicyHandler {
    function supportsAtomicFeeTransition() external view returns(bool);
}
interface IPairV5CanonicalCoordinator {
    function launchpad() external view returns(address);
    function modeRegistry() external view returns(address);
}
contract PairV5LaunchV2ModeRegistry {
    address public immutable launchpad;
    address public owner;
    address public pendingOwner;
    address public currentCoordinator;
    bool public launchEnabled;
    mapping(uint32 => bool) public modeVaultUpgradesFrozen;

    mapping(uint32 => bool) public modeRegistered;
    mapping(uint32 => bool) public enabled;
    mapping(uint32 => uint256) public currentVersion;
    mapping(uint32 => mapping(uint256 => address)) public handlerByModeVersion;
    mapping(address => address) public vaultOf;
    mapping(address => bool) public communityTakeoverEligible;
    mapping(address => uint32) public projectModeId;
    mapping(address => address) public projectHandler;
    mapping(address => uint256) public projectHandlerVersion;
    mapping(address => bool) public projectUsesAtomicFeeTransition;

    error OnlyOwner();
    error OnlyPendingOwner();
    error InvalidConfiguration();
    error ModeVersionNotIncreasing();
    error UnknownMode();
    error OnlyCoordinator();

    event ModeVersionRegistered(uint32 indexed modeId,uint256 indexed version,address indexed handler);
    event ModeEnabledSet(uint32 indexed modeId,bool enabled);
    event CoordinatorBound(address indexed coordinator);
    event LaunchEnabledSet(bool enabled);
    event CanonicalProjectRegistered(address indexed project,address indexed vault,uint32 indexed modeId,
        address handler,uint256 version,bool ctoEligible);
    event CanonicalPolicyEpochReplaced(address indexed project,address indexed vault,uint64 indexed epoch,
        address[] recipients,uint16[] shares);
    event ModeVaultImplementationUpgraded(uint32 indexed modeId,uint256 indexed version,address indexed implementation);
    event ModeVaultUpgradesFrozen(uint32 indexed modeId);
    event OwnershipTransferStarted(address indexed previousOwner,address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner,address indexed newOwner);

    constructor(address launchpad_,address initialOwner) {
        if (launchpad_ == address(0) || initialOwner == address(0) || launchpad_.code.length == 0) {
            revert InvalidConfiguration();
        }
        launchpad = launchpad_;
        owner=initialOwner;
        emit OwnershipTransferred(address(0),initialOwner);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    function modeRegistryVersion() external pure returns(uint256) { return 1; }

    /// @notice Starts a two-step registry authority rotation.
    /// @dev Keep launches disabled throughout coordinated controller/release
    /// registry/registry authority rotations; only the accepted owner can
    /// re-enable future launches after all authorities are aligned.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0) || newOwner == owner) revert InvalidConfiguration();
        pendingOwner=newOwner;
        emit OwnershipTransferStarted(owner,newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert OnlyPendingOwner();
        address previous=owner;
        owner=msg.sender;
        pendingOwner=address(0);
        emit OwnershipTransferred(previous,msg.sender);
    }

    function bindCoordinator(address coordinator_) external onlyOwner {
        if (currentCoordinator != address(0)) revert InvalidConfiguration();
        _setCoordinator(coordinator_);
    }

    /// @notice Rotates only future launches while the graph is disabled.
    function rotateCoordinator(address coordinator_) external onlyOwner {
        if (launchEnabled || currentCoordinator == address(0)) revert InvalidConfiguration();
        _setCoordinator(coordinator_);
    }

    function _setCoordinator(address coordinator_) private {
        if (coordinator_.code.length == 0
            || IPairV5CanonicalCoordinator(coordinator_).launchpad() != launchpad
            || IPairV5CanonicalCoordinator(coordinator_).modeRegistry() != address(this)) {
            revert InvalidConfiguration();
        }
        currentCoordinator = coordinator_;
        emit CoordinatorBound(coordinator_);
    }

    function setLaunchEnabled(bool enabled_) external onlyOwner {
        if (currentCoordinator == address(0)) revert InvalidConfiguration();
        launchEnabled=enabled_;
        emit LaunchEnabledSet(enabled_);
    }

    /// @notice Atomically freezes one mode's beacon upgrades before enabling launches.
    /// @dev The freeze is irreversible so deployed holder assets cannot later be
    /// redirected by the registry owner to an unreviewed implementation.
    function enableLaunchAndFreezeModeVaultUpgrades(uint32 modeId) external onlyOwner {
        if (currentCoordinator == address(0) || !modeRegistered[modeId]
            || modeVaultUpgradesFrozen[modeId]) revert InvalidConfiguration();
        modeVaultUpgradesFrozen[modeId]=true;
        launchEnabled=true;
        emit ModeVaultUpgradesFrozen(modeId);
        emit LaunchEnabledSet(true);
    }

    /// @notice Adds a handler version; no registered handler can be replaced.
    function register(address handler) external onlyOwner {
        if (handler == address(0) || handler.code.length == 0) revert InvalidConfiguration();
        _register(IPairV5ModeVersionHandler(handler).modeId(),handler);
    }

    /// @notice Explicit semantic ID form used by deployment manifests.
    function register(uint32 modeId,address handler) external onlyOwner {
        _register(modeId,handler);
    }

    function _register(uint32 expectedModeId,address handler) private {
        if (handler == address(0) || handler.code.length == 0) revert InvalidConfiguration();
        IPairV5ModeVersionHandler candidate = IPairV5ModeVersionHandler(handler);
        uint32 modeId = candidate.modeId();
        uint256 version = candidate.modeVersion();
        if (modeId == 0 || modeId != expectedModeId || version == 0
            || currentCoordinator == address(0) || candidate.coordinator() != currentCoordinator) {
            revert InvalidConfiguration();
        }
        uint256 previous = currentVersion[modeId];
        if (version <= previous) revert ModeVersionNotIncreasing();
        if (modeId == 1 && version >= 5
            && !IPairV5AtomicPolicyHandler(handler).supportsAtomicFeeTransition()) revert InvalidConfiguration();
        // Calling a handler's declared identity prevents accidentally filing a
        // reviewed version under a different permanent semantic mode ID.
        if (handlerByModeVersion[modeId][version] != address(0)) revert ModeVersionNotIncreasing();
        modeRegistered[modeId] = true;
        handlerByModeVersion[modeId][version] = handler;
        currentVersion[modeId] = version;
        enabled[modeId] = true;
        emit ModeVersionRegistered(modeId,version,handler);
    }

    /// @notice Disabling applies only to new resolution; deployed vaults have
    /// already captured their family and policy and never consult this state.
    function setEnabled(uint32 modeId,bool value) external onlyOwner {
        if (!modeRegistered[modeId]) revert UnknownMode();
        enabled[modeId] = value;
        emit ModeEnabledSet(modeId,value);
    }

    function upgradeModeVault(uint32 modeId,uint256 version,address newImplementation) external onlyOwner {
        if(modeVaultUpgradesFrozen[modeId]) revert InvalidConfiguration();
        address handler=handlerByModeVersion[modeId][version];
        if(handler==address(0)) revert UnknownMode();
        address factory=IPairV5ModeVersionHandler(handler).vaultFactory();
        if(factory.code.length==0||IPairV5CanonicalVaultFactory(factory).modeId()!=modeId) {
            revert InvalidConfiguration();
        }
        IPairV5CanonicalVaultFactory(factory).upgradeVaultImplementation(newImplementation);
        emit ModeVaultImplementationUpgraded(modeId,version,newImplementation);
    }

    function currentHandler(uint32 modeId) external view returns(address handler,uint256 version,bool isEnabled) {
        version = currentVersion[modeId];
        handler = handlerByModeVersion[modeId][version];
        isEnabled = enabled[modeId];
    }

    function resolveCurrent(uint32 modeId,address creator,bytes calldata configuration)
        external view returns(address handler,uint256 version,address[] memory recipients,
            uint16[] memory sharesBps,bool ctoEligible) {
        if (msg.sender != currentCoordinator || !launchEnabled) revert OnlyCoordinator();
        version = currentVersion[modeId];
        handler = handlerByModeVersion[modeId][version];
        if (!enabled[modeId] || handler == address(0)) revert UnknownMode();
        (recipients,sharesBps,ctoEligible) =
            IPairV5ModeVersionHandler(handler).resolve(creator,configuration);
    }

    function registerProject(address project,address vault,uint32 modeId,address handler,uint256 version,bool ctoEligible)
        external {
        if (msg.sender != currentCoordinator || project == address(0) || vault.code.length == 0
            || vaultOf[project] != address(0) || handler == address(0)
            || handlerByModeVersion[modeId][version] != handler
            || ctoEligible != (modeId == 1)
            || IPairV5CanonicalPolicyVault(vault).projectToken() != project
            || IPairV5CanonicalPolicyVault(vault).policyController() != address(this)) {
            revert InvalidConfiguration();
        }
        vaultOf[project]=vault;
        communityTakeoverEligible[project]=ctoEligible;
        projectModeId[project]=modeId;
        projectHandler[project]=handler;
        projectHandlerVersion[project]=version;
        projectUsesAtomicFeeTransition[project]=(modeId==1&&version>=5);
        emit CanonicalProjectRegistered(project,vault,modeId,handler,version,ctoEligible);
    }

    function communityTakeover(address project,address[] calldata recipients,uint16[] calldata shares)
        external onlyOwner {
        address vault=vaultOf[project];
        if (!communityTakeoverEligible[project] || vault == address(0)
            || IPairV5CanonicalPolicyVault(vault).projectToken() != project
            || IPairV5CanonicalPolicyVault(vault).policyController() != address(this)) {
            revert InvalidConfiguration();
        }
        if(projectUsesAtomicFeeTransition[project]) {
            IPairV5CanonicalPolicyVault(vault).transitionFeeSharingAtomic(recipients,shares);
        } else {
            IPairV5CanonicalPolicyVault(vault).transitionFeeSharing(recipients,shares);
        }
        (bool ok,bytes memory result)=vault.staticcall(abi.encodeWithSignature("epoch()"));
        if (!ok || result.length != 32) revert InvalidConfiguration();
        emit CanonicalPolicyEpochReplaced(project,vault,abi.decode(result,(uint64)),recipients,shares);
    }
}