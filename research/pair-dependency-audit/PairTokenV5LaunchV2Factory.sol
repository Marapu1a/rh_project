// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {PairTokenV5LaunchV2} from "./PairTokenV5LaunchV2.sol";

/// @notice Creator-bound deterministic factory for future V5 Launch V2 tokens.
/// @dev The clone init code depends solely on this immutable implementation,
/// never user metadata, making address mining and collision checks reliable.
contract PairTokenV5LaunchV2Factory {
    uint160 public constant VANITY_SUFFIX_MASK = 0xffff;
    uint160 public constant VANITY_SUFFIX = 0x5555;

    address public immutable implementation;
    address public immutable launchpad;
    address public immutable coordinator;
    mapping(address => bool) public isToken;

    event TokenCreated(address indexed token, address indexed creator, bytes32 indexed userSalt, string symbol);
    error InvalidAddress();
    error InvalidVanityAddress(address predicted);
    error OnlyLaunchpad();
    error TokenExists(address token);

    constructor(address launchpad_, address coordinator_, address implementation_) {
        if (launchpad_ == address(0) || coordinator_ == address(0)
            || implementation_ == address(0) || implementation_.code.length == 0
            || PairTokenV5LaunchV2(implementation_).factory() != address(this)) {
            revert InvalidAddress();
        }
        launchpad = launchpad_;
        coordinator = coordinator_;
        implementation = implementation_;
    }

    function tokenInitCodeHash() public view returns (bytes32) {
        return keccak256(abi.encodePacked(hex"3d602d80600a3d3981f3", hex"363d3d373d3d3d363d73", implementation,
            hex"5af43d82803e903d91602b57fd5bf3"));
    }
    function hasVanitySuffix(address token) public pure returns (bool) {
        return uint160(token) & VANITY_SUFFIX_MASK == VANITY_SUFFIX;
    }
    function saltFor(address creator, bytes32 userSalt) public pure returns (bytes32) {
        return keccak256(abi.encode(creator, userSalt));
    }
    function predictTokenAddress(address creator, bytes32 userSalt) public view returns (address) {
        return Clones.predictDeterministicAddress(implementation, saltFor(creator, userSalt), address(this));
    }

    function createToken(
        address creator, bytes32 userSalt, string calldata name_, string calldata symbol_, string calldata uri,
        bytes32 metadataHash, address poolManager, address positionManager, address locker,
        address initialBuyRecipient, address buybackExecutor, uint256 protectionBlocks, address supplyRecipient
    ) external returns (address token) {
        if (msg.sender != coordinator) revert OnlyLaunchpad();
        if (creator == address(0) || userSalt == bytes32(0)) revert InvalidAddress();
        address predicted = predictTokenAddress(creator, userSalt);
        if (!hasVanitySuffix(predicted)) revert InvalidVanityAddress(predicted);
        if (predicted.code.length != 0) revert TokenExists(predicted);
        token = Clones.cloneDeterministic(implementation, saltFor(creator, userSalt));
        PairTokenV5LaunchV2(token).initialize(name_, symbol_, uri, metadataHash, launchpad, creator, poolManager,
            positionManager, locker, initialBuyRecipient, buybackExecutor, protectionBlocks, supplyRecipient);
        isToken[token] = true;
        emit TokenCreated(token, creator, userSalt, symbol_);
    }
    /// @notice Isolated factory path binding custom coordinator inventory to its
    /// configured initializer. The canonical createToken ABI/path is unchanged.
    function createCustomQuoteToken(
        address creator, bytes32 userSalt, string calldata name_, string calldata symbol_, string calldata uri,
        bytes32 metadataHash, address poolManager, address positionManager, address locker,
        address initialBuyRecipient, address buybackExecutor, uint256 protectionBlocks, address supplyRecipient,
        address initializer
    ) external returns (address token) {
        if (msg.sender != coordinator) revert OnlyLaunchpad();
        if (initializer == address(0) || supplyRecipient != coordinator) revert InvalidAddress();
        if (creator == address(0) || userSalt == bytes32(0)) revert InvalidAddress();
        address predicted = predictTokenAddress(creator, userSalt);
        if (!hasVanitySuffix(predicted)) revert InvalidVanityAddress(predicted);
        if (predicted.code.length != 0) revert TokenExists(predicted);
        token = Clones.cloneDeterministic(implementation, saltFor(creator, userSalt));
        PairTokenV5LaunchV2(token).initializeCustomQuote(name_, symbol_, uri, metadataHash, launchpad, creator,
            poolManager, positionManager, locker, initialBuyRecipient, buybackExecutor, protectionBlocks,
            supplyRecipient, coordinator, initializer);
        isToken[token] = true;
        emit TokenCreated(token, creator, userSalt, symbol_);
    }
}