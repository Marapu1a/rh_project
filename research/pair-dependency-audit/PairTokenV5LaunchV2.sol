// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ILaunchV2HolderDistributionCheckpoint {
    function holderDistributionVersion() external view returns (uint256);
    function checkpoint(address from,address to,uint256 amount) external;
}

/// @notice Factory-initialized V5 token used only by Launch V2.
/// @dev This deliberately retains V5's fixed supply and launch protection while
/// adding a conventional self-burn primitive for the buyback executor.
contract PairTokenV5LaunchV2 is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 private constant MAX_BUY_AMOUNT = 55_000_000 ether;
    uint256 private constant MAX_HOLD_AMOUNT = 50_000_000 ether;

    address public immutable factory;
    address public launchpad;
    address public creator;
    address public poolManager;
    address public positionManager;
    address public locker;
    address public initialBuyRecipient;
    address public buybackExecutor;
    // Set only by the isolated custom-quote factory path.  Canonical launches
    // leave both zero and retain their historical protection semantics.
    address public customQuoteLaunchSource;
    address public customQuoteInitializer;
    uint256 public launchBlock;
    uint256 public restrictionsEndBlock;
    string public immutableMetadataURI;
    bytes32 public immutableMetadataHash;
    bool public initialized;
    string private _launchName;
    string private _launchSymbol;

    error AlreadyInitialized();
    error BuyCapExceeded();
    error EmptyMetadata();
    error HoldCapExceeded();
    error LaunchBlockRestricted();
    error NotFactory();
    error OnlyBuybackExecutor();
    error ZeroAddress();

    constructor(address factory_) ERC20("", "") {
        if (factory_ == address(0)) revert ZeroAddress();
        factory = factory_;
    }

    function initialize(
        string calldata name_, string calldata symbol_, string calldata metadataURI_, bytes32 metadataHash_,
        address launchpad_, address creator_, address poolManager_, address positionManager_, address locker_,
        address initialBuyRecipient_, address buybackExecutor_, uint256 protectionBlocks_,
        address supplyRecipient_
    ) external {
        _initialize(name_,symbol_,metadataURI_,metadataHash_,launchpad_,creator_,poolManager_,positionManager_,
            locker_,initialBuyRecipient_,buybackExecutor_,protectionBlocks_,supplyRecipient_,address(0),address(0));
    }
    /// @dev Separate ABI used only by the custom-quote factory. The pair binds
    /// the one launch-time coordinator-to-initializer inventory transfer.
    function initializeCustomQuote(
        string calldata name_, string calldata symbol_, string calldata metadataURI_, bytes32 metadataHash_,
        address launchpad_, address creator_, address poolManager_, address positionManager_, address locker_,
        address initialBuyRecipient_, address buybackExecutor_, uint256 protectionBlocks_, address supplyRecipient_,
        address launchSource_,address initializer_
    ) external {
        _initialize(name_,symbol_,metadataURI_,metadataHash_,launchpad_,creator_,poolManager_,positionManager_,
            locker_,initialBuyRecipient_,buybackExecutor_,protectionBlocks_,supplyRecipient_,launchSource_,initializer_);
    }
    function _initialize(
        string calldata name_,string calldata symbol_,string calldata metadataURI_,bytes32 metadataHash_,
        address launchpad_,address creator_,address poolManager_,address positionManager_,address locker_,
        address initialBuyRecipient_,address buybackExecutor_,uint256 protectionBlocks_,address supplyRecipient_,
        address launchSource_,address initializer_
    ) private {
        if (msg.sender != factory) revert NotFactory();
        if (initialized) revert AlreadyInitialized();
        if (bytes(name_).length == 0 || bytes(symbol_).length == 0) revert EmptyMetadata();
        if (launchpad_ == address(0) || creator_ == address(0) || poolManager_ == address(0)
            || supplyRecipient_ == address(0) || buybackExecutor_ == address(0)) revert ZeroAddress();
        if ((launchSource_ == address(0)) != (initializer_ == address(0))
            || (launchSource_ != address(0) && launchSource_ != supplyRecipient_)) revert ZeroAddress();
        initialized = true;
        launchpad = launchpad_;
        creator = creator_;
        poolManager = poolManager_;
        positionManager = positionManager_;
        locker = locker_;
        initialBuyRecipient = initialBuyRecipient_ == address(0) ? creator_ : initialBuyRecipient_;
        buybackExecutor = buybackExecutor_;
        customQuoteLaunchSource=launchSource_;
        customQuoteInitializer=initializer_;
        launchBlock = block.number;
        restrictionsEndBlock = block.number + protectionBlocks_;
        immutableMetadataURI = metadataURI_;
        immutableMetadataHash = metadataHash_;
        _launchName = name_;
        _launchSymbol = symbol_;
        _mint(supplyRecipient_, TOTAL_SUPPLY);
    }

    function tokenURI() external view returns (string memory) { return immutableMetadataURI; }
    function name() public view override returns (string memory) { return _launchName; }
    function symbol() public view override returns (string memory) { return _launchSymbol; }

    /// @notice Atomically destroys project tokens acquired by the attested executor.
    function burnBuyback(uint256 amount) external {
        if (msg.sender != buybackExecutor) revert OnlyBuybackExecutor();
        _burn(msg.sender, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (initialized && block.number <= restrictionsEndBlock && from != address(0) && to != address(0)
            && to != poolManager && to != positionManager && to != locker && to != launchpad
            && !(from==customQuoteLaunchSource && to==customQuoteInitializer)
            && !(from==customQuoteInitializer && to==customQuoteLaunchSource)
            && !(from==customQuoteLaunchSource
                && to==address(0x000000000000000000000000000000000000dEaD))) {
            if (from == poolManager) {
                if (block.number == launchBlock && to != initialBuyRecipient) revert LaunchBlockRestricted();
                if (value > MAX_BUY_AMOUNT) revert BuyCapExceeded();
            }
            if (balanceOf(to) + value > MAX_HOLD_AMOUNT) revert HoldCapExceeded();
        }
        // Mode-3 vaults opt into mandatory pre-transfer checkpoints. Existing
        // V2 vaults do not expose this capability and retain their exact path.
        if (locker.code.length != 0) {
            (bool supported,bytes memory result) = locker.staticcall(
                abi.encodeWithSelector(ILaunchV2HolderDistributionCheckpoint.holderDistributionVersion.selector));
            if (supported && result.length == 32 && abi.decode(result,(uint256)) == 1) {
                ILaunchV2HolderDistributionCheckpoint(locker).checkpoint(from,to,value);
            }
        }
        super._update(from, to, value);
    }

}