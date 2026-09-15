// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PromoVault} from "./PromoVault.sol";
import {ShortPrizeBasket} from "./ShortPrizeBasket.sol";

/// @notice Internal commitment component, NOT a deployable draw controller.
/// The complete controller must enforce admission, schedule, budget policy and
/// snapshot authorization before calling _freezeShort, and implement settlement.
abstract contract ShortDrawCommitment is ReentrancyGuard {
    error InvalidShortConfiguration();
    error InvalidShortRequest();
    error InvalidShortCutoff();
    error ShortAlreadyPending();
    error InvalidVaultBinding();

    // Technical bound on work, not the product's chosen number of prize places.
    uint256 public constant MAX_SHORT_PLACES = 64;
    PromoVault public immutable promoVault;
    address public immutable participantRegistry;
    bytes32 public immutable instanceId;
    uint256 public immutable minimumUnit;
    bytes32 public immutable shortRulesHash;
    uint256[] private _weights;
    bytes32 public pendingShortDrawId;

    struct FreezeRequest {
        bytes32 drawId;
        uint64 campaignId;
        uint256 cutoffBlockNumber;
        bytes32 cutoffBlockHash;
        bytes32 attemptSnapshotHash;
        bytes32 expectedRulesHash;
        uint256 budget;
    }

    struct Commitment {
        FreezeRequest request;
        bytes32 basketHash;
        uint256 basketTotal;
        uint256 remainder;
        uint256 freezeBlock;
    }

    mapping(bytes32 => Commitment) private _shortCommitments;
    mapping(bytes32 => bytes32) public shortCommitmentHash;

    // ABI shared with the public attempt ledger. This does not consume attempts.
    event AttemptsFrozen(bytes32 indexed drawId, uint8 indexed kind,
        uint256 cutoffBlockNumber, bytes32 cutoffBlockHash,
        bytes32 rulesHash, bytes32 snapshotHash);
    event ShortDrawFrozen(bytes32 indexed drawId, bytes32 commitmentHash,
        bytes32 basketHash, uint256 budget, uint256 basketTotal, uint256 remainder);

    /// Vault may be a predicted address: PromoVault requires existing controller
    /// code at deployment. Its immutable reverse binding is checked at freeze.
    constructor(address vault, address registry, bytes32 instance,
        uint256[] memory weights, uint256 minUnit, bytes32 remainingRulesHash)
    {
        if (vault == address(0) || registry.code.length == 0 || instance == bytes32(0)
            || remainingRulesHash == bytes32(0) || weights.length > MAX_SHORT_PLACES)
            revert InvalidShortConfiguration();
        ShortPrizeBasket.build(type(uint256).max, weights, minUnit);
        promoVault = PromoVault(vault);
        participantRegistry = registry;
        instanceId = instance;
        minimumUnit = minUnit;
        _weights = weights;
        shortRulesHash = keccak256(abi.encode(
            keccak256("SHORT_RULES_V1"), weights, minUnit, remainingRulesHash));
    }

    function shortWeights() external view returns (uint256[] memory) { return _weights; }

    function shortCommitment(bytes32 drawId) external view returns (Commitment memory) {
        return _shortCommitments[drawId];
    }

    function shortBasket(bytes32 drawId) external view
        returns (uint256[] memory prizes, uint256 total, uint256 remainder)
    {
        if (_shortCommitments[drawId].request.drawId == bytes32(0)) revert InvalidShortRequest();
        return ShortPrizeBasket.build(_shortCommitments[drawId].request.budget, _weights, minimumUnit);
    }

    /// Uses recent completed block identity, NOT a chain finality oracle.
    /// Complete controller entrypoints must share this guard for state mutations.
    function _freezeShort(FreezeRequest memory request) internal nonReentrant {
        if (pendingShortDrawId != bytes32(0)) revert ShortAlreadyPending();
        if (request.drawId == bytes32(0) || request.campaignId == 0
            || request.attemptSnapshotHash == bytes32(0) || request.budget == 0
            || request.expectedRulesHash != shortRulesHash
            || _shortCommitments[request.drawId].request.drawId != bytes32(0))
            revert InvalidShortRequest();
        if (request.cutoffBlockNumber >= block.number
            || block.number - request.cutoffBlockNumber > 256
            || request.cutoffBlockHash == bytes32(0)
            || blockhash(request.cutoffBlockNumber) != request.cutoffBlockHash)
            revert InvalidShortCutoff();
        if (address(promoVault).code.length == 0 || promoVault.drawController() != address(this))
            revert InvalidVaultBinding();

        (uint256[] memory prizes, uint256 total, uint256 dust) =
            ShortPrizeBasket.build(request.budget, _weights, minimumUnit);
        // Includes direct-transfer recognition; any failure rolls it all back.
        promoVault.reserveUSDG(request.drawId, request.campaignId, PromoVault.ReserveSource.SHORT, request.budget);
        Commitment memory commitment = Commitment(request, keccak256(abi.encode(prizes)), total, dust, block.number);
        bytes32 commitmentHash = keccak256(abi.encode(
            keccak256("SHORT_COMMITMENT_V1"), block.chainid, address(this), instanceId,
            participantRegistry, address(promoVault), address(promoVault.quoteToken()), commitment));
        _shortCommitments[request.drawId] = commitment;
        shortCommitmentHash[request.drawId] = commitmentHash;
        pendingShortDrawId = request.drawId;
        emit AttemptsFrozen(request.drawId, 0, request.cutoffBlockNumber,
            request.cutoffBlockHash, shortRulesHash, request.attemptSnapshotHash);
        emit ShortDrawFrozen(request.drawId, commitmentHash, commitment.basketHash, request.budget, total, dust);
    }
}
