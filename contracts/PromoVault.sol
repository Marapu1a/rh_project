// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Funded prize custody only. The immutable controller must enforce draw rules
/// and authenticate winners; this vault neither selects nor verifies random outcomes.
contract PromoVault is ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum Status { None, Reserved, Finalized }
    enum FundingDestination { GENERAL, SHORT, CURRENT, NEXT }
    enum ReserveSource { SHORT, CURRENT }
    struct Draw {
        address asset;
        uint64 campaignId;
        Status status;
        uint256 budget;
        uint256 awarded;
        uint256 paid;
    }

    address public immutable projectToken;
    address public immutable quoteToken;
    address public immutable drawController;
    uint256 public immutable nextStartTarget;
    uint256 public freeShort;
    uint256 public freeCurrent;
    uint256 public freeNext;
    // Next position in SHORT, CURRENT, SHORT, CURRENT, SHORT, NEXT.
    uint8 public generalFundingPhase;
    mapping(bytes32 => ReserveSource) public usdgDrawSource;
    mapping(bytes32 => Draw) public draws;
    mapping(address => uint256) public reserved;
    mapping(address => uint256) public claimable;
    mapping(bytes32 => mapping(address => uint256)) public reward;

    error InvalidConfiguration();
    error OnlyController();
    error UnsupportedAsset();
    error InvalidDraw();
    error InvalidAwards();
    error InsufficientAvailable();
    error BalanceDeficit();
    error NothingToClaim();
    error InvalidFunding();
    error UnexpectedReceivedAmount();
    error UseUSDGReserve();
    event DrawReserved(bytes32 indexed drawId, uint64 indexed campaignId, address indexed asset, uint256 budget);
    event RewardAssigned(bytes32 indexed drawId, address indexed winner, uint256 amount);
    event DrawFinalized(bytes32 indexed drawId, uint256 awarded, uint256 released);
    event RewardPaid(bytes32 indexed drawId, address indexed asset, address indexed winner, uint256 amount);
    // payer=zero for unrecognized direct transfers: the sender cannot be inferred.
    event USDGAllocated(address indexed payer, FundingDestination indexed destination, uint256 received,
        uint256 shortAmount, uint256 currentAmount, uint256 nextAmount);
    event USDGReserveDebited(bytes32 indexed drawId, ReserveSource indexed source, uint256 amount);

    constructor(address token, address quote, address controller, uint256 target) {
        // TOKEN may be a predicted PAIR address before launch; code is required when used.
        if (token == address(0) || quote == address(0) || token == quote || controller.code.length == 0 || target == 0)
            revert InvalidConfiguration();
        projectToken = token;
        quoteToken = quote;
        drawController = controller;
        nextStartTarget = target;
    }

    modifier onlyController() {
        if (msg.sender != drawController) revert OnlyController();
        _;
    }

    /// Total uncommitted balance, NOT the amount available from an individual USDG reserve.
    /// USDG includes unrecognized direct funding; reserveUSDG synchronizes it as GENERAL.
    function available(address asset) public view returns (uint256) {
        _asset(asset);
        uint256 balance = IERC20(asset).balanceOf(address(this));
        uint256 liabilities = reserved[asset] + claimable[asset];
        if (balance < liabilities) revert BalanceDeficit();
        if (asset == quoteToken && balance - liabilities < freeShort + freeCurrent + freeNext)
            revert BalanceDeficit();
        return balance - liabilities;
    }

    function unrecognizedUSDG() public view returns (uint256) {
        return available(quoteToken) - freeShort - freeCurrent - freeNext;
    }

    /// Explicit destination applies only to this transferFrom, never to earlier donations.
    function fundUSDG(uint256 amount, FundingDestination destination) external nonReentrant {
        if (amount == 0) revert InvalidFunding();
        _syncUSDG();
        IERC20 quote = IERC20(quoteToken);
        uint256 beforeBalance = quote.balanceOf(address(this));
        quote.safeTransferFrom(msg.sender, address(this), amount);
        uint256 afterBalance = quote.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount)
            revert UnexpectedReceivedAmount();
        _allocateUSDG(afterBalance - beforeBalance, destination, msg.sender);
    }

    /// Permissionless recognition under the published GENERAL default; zero is a no-op.
    function syncUSDG() external nonReentrant { _syncUSDG(); }

    function _syncUSDG() private {
        uint256 amount = unrecognizedUSDG();
        if (amount != 0) _allocateUSDG(amount, FundingDestination.GENERAL, address(0));
    }

    function _allocateUSDG(uint256 amount, FundingDestination destination, address payer) private {
        uint256 shortAmount;
        uint256 nextAmount;
        if (destination == FundingDestination.GENERAL) {
            // Whole six-unit groups have the same allocation from every phase.
            // Only the tail is walked: at most five iterations, regardless of amount.
            shortAmount = (amount / 6) * 3;
            nextAmount = amount / 6;
            uint8 phase = generalFundingPhase;
            uint256 tail = amount % 6;
            for (uint256 i; i < tail; ++i) {
                if (phase % 2 == 0) ++shortAmount;
                else if (phase == 5) ++nextAmount;
                phase = (phase + 1) % 6;
            }
            generalFundingPhase = phase;
        } else if (destination == FundingDestination.SHORT) {
            shortAmount = amount;
        } else if (destination == FundingDestination.NEXT) {
            nextAmount = amount;
        }
        uint256 room = nextStartTarget - freeNext;
        if (nextAmount > room) nextAmount = room;
        uint256 currentAmount = amount - shortAmount - nextAmount;
        freeShort += shortAmount;
        freeCurrent += currentAmount;
        freeNext += nextAmount;
        emit USDGAllocated(payer, destination, amount, shortAmount, currentAmount, nextAmount);
    }

    function reserve(bytes32 drawId, uint64 campaignId, address asset, uint256 budget)
        external onlyController nonReentrant
    {
        if (asset == quoteToken) revert UseUSDGReserve();
        _reserve(drawId, campaignId, asset, budget);
    }

    function reserveUSDG(bytes32 drawId, uint64 campaignId, ReserveSource source, uint256 budget)
        external onlyController nonReentrant
    {
        _syncUSDG();
        if (source == ReserveSource.SHORT) {
            if (budget > freeShort) revert InsufficientAvailable();
            freeShort -= budget;
        } else {
            if (budget > freeCurrent) revert InsufficientAvailable();
            freeCurrent -= budget;
        }
        _reserve(drawId, campaignId, quoteToken, budget);
        usdgDrawSource[drawId] = source;
        emit USDGReserveDebited(drawId, source, budget);
    }

    function _reserve(bytes32 drawId, uint64 campaignId, address asset, uint256 budget) private {
        if (drawId == bytes32(0) || campaignId == 0 || budget == 0 || draws[drawId].status != Status.None)
            revert InvalidDraw();
        if (budget > available(asset)) revert InsufficientAvailable();
        reserved[asset] += budget;
        draws[drawId] = Draw(asset, campaignId, Status.Reserved, budget, 0, 0);
        emit DrawReserved(drawId, campaignId, asset, budget);
    }

    /// Atomically record a complete winner list. Controller aggregates duplicate wallets.
    /// Empty awards release the full budget; only the future controller's rules may permit this.
    function finalize(bytes32 drawId, address[] calldata winners, uint256[] calldata amounts)
        external onlyController nonReentrant
    {
        Draw storage d = draws[drawId];
        if (d.status != Status.Reserved) revert InvalidDraw();
        if (winners.length != amounts.length) revert InvalidAwards();
        available(d.asset); // fail closed on an unsupported balance reduction
        uint256 total;
        for (uint256 i; i < winners.length; ++i) {
            address winner = winners[i];
            uint256 amount = amounts[i];
            if (winner == address(0) || winner == address(this) || amount == 0 || reward[drawId][winner] != 0)
                revert InvalidAwards();
            total += amount;
            if (total > d.budget) revert InvalidAwards();
            reward[drawId][winner] = amount;
            emit RewardAssigned(drawId, winner, amount);
        }
        reserved[d.asset] -= d.budget;
        claimable[d.asset] += total;
        if (d.asset == quoteToken) {
            uint256 released = d.budget - total;
            if (usdgDrawSource[drawId] == ReserveSource.SHORT) freeShort += released;
            else freeCurrent += released;
        }
        d.status = Status.Finalized;
        d.awarded = total;
        emit DrawFinalized(drawId, total, d.budget - total);
    }

    /// Anyone can pay an existing reward to its fixed winner, never to a caller-supplied substitute.
    function claim(bytes32 drawId, address winner) external nonReentrant {
        Draw storage d = draws[drawId];
        if (d.status != Status.Finalized) revert InvalidDraw();
        uint256 amount = reward[drawId][winner];
        if (amount == 0) revert NothingToClaim();
        available(d.asset);
        reward[drawId][winner] = 0;
        claimable[d.asset] -= amount;
        d.paid += amount;
        IERC20(d.asset).safeTransfer(winner, amount);
        emit RewardPaid(drawId, d.asset, winner, amount);
    }

    function _asset(address asset) private view {
        if (asset != projectToken && asset != quoteToken) revert UnsupportedAsset();
    }
}
