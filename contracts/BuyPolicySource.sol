// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ChainBlocks} from "./ChainBlocks.sol";

/// @notice Append-only public BUY policy commitments. No prize custody or reset.
/// @dev The immutable publisher must validate route semantics before publishing.
contract BuyPolicySource {
    bytes32 public immutable instanceId;
    bytes32 public immutable genesisHash;
    address public immutable publisher;
    uint256 public immutable noticeBlocks;
    bytes32 public currentHash;
    uint256 public lastFromBlock;
    uint256 public publishedCount;
    event BuyPolicyAnnounced(bytes32 indexed instanceId, bytes32 indexed previousHash,
        bytes32 indexed nextHash, uint256 fromBlock, string manifest);
    error InvalidPolicy();
    error Unauthorized();
    constructor(bytes32 instance, bytes32 genesis, address author, uint256 notice) {
        if(instance == bytes32(0) || genesis == bytes32(0) || author == address(0) || notice == 0) revert InvalidPolicy();
        instanceId=instance; genesisHash=genesis; currentHash=genesis;
        publisher=author; noticeBlocks=notice;
    }
    function announce(bytes32 previousHash, bytes32 nextHash, uint256 fromBlock, string calldata manifest) external {
        if(msg.sender != publisher) revert Unauthorized();
        if(previousHash != currentHash || nextHash == bytes32(0) || nextHash == previousHash ||
            bytes(manifest).length == 0 || keccak256(bytes(manifest)) != nextHash ||
            fromBlock < ChainBlocks.number() + noticeBlocks || fromBlock <= lastFromBlock ||
            ChainBlocks.number() < lastFromBlock) revert InvalidPolicy();
        currentHash=nextHash; lastFromBlock=fromBlock; ++publishedCount;
        emit BuyPolicyAnnounced(instanceId,previousHash,nextHash,fromBlock,manifest);
    }
}
