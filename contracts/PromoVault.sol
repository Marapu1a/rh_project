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
    event DrawReserved(bytes32 indexed drawId, uint64 indexed campaignId, address indexed asset, uint256 budget);
    event RewardAssigned(bytes32 indexed drawId, address indexed winner, uint256 amount);
    event DrawFinalized(bytes32 indexed drawId, uint256 awarded, uint256 released);
    event RewardPaid(bytes32 indexed drawId, address indexed asset, address indexed winner, uint256 amount);

    constructor(address token, address quote, address controller) {
        // TOKEN may be a predicted PAIR address before launch; code is required when used.
        if (token == address(0) || quote == address(0) || token == quote || controller.code.length == 0)
            revert InvalidConfiguration();
        projectToken = token;
        quoteToken = quote;
        drawController = controller;
    }

    modifier onlyController() {
        if (msg.sender != drawController) revert OnlyController();
        _;
    }

    /// Direct ERC20 transfers, including FeeRouter.pay, need no deposit bookkeeping.
    function available(address asset) public view returns (uint256) {
        _asset(asset);
        uint256 balance = IERC20(asset).balanceOf(address(this));
        uint256 liabilities = reserved[asset] + claimable[asset];
        if (balance < liabilities) revert BalanceDeficit();
        return balance - liabilities;
    }

    function reserve(bytes32 drawId, uint64 campaignId, address asset, uint256 budget)
        external onlyController nonReentrant
    {
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
