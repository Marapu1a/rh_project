// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPositionManagerV4} from "./interfaces/IPairV4.sol";

/// @notice Permanent custody and pull-payment fee splitter for PAIR V4 positions.
/// @dev There is intentionally no position transfer, decrease, burn, approval or
/// arbitrary PositionManager execution function. Fees in both pool assets are
/// collected without reducing liquidity and split independently 70/30. Project
/// fees are NOT automatically swapped, avoiding an unsafe keeper-controlled
/// conversion; creators therefore claim project and quote assets separately.
contract PairV4Locker is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    uint16 public constant CREATOR_SHARE_BPS = 7_000;
    uint16 public constant PROTOCOL_SHARE_BPS = 3_000;

    IPositionManagerV4 public immutable positionManager;
    address public immutable protocolTreasury;
    address public immutable launchpad;

    struct PositionConfig {
        bool registered;
        address projectToken;
        address quoteToken;
        bytes32 poolId;
        address creator;
    }

    mapping(uint256 => PositionConfig) public positions;
    mapping(address => mapping(address => uint256)) public claimable;

    event PositionRegistered(
        uint256 indexed tokenId,
        bytes32 indexed poolId,
        address indexed projectToken,
        address quoteToken,
        address creator
    );
    event FeesCollected(uint256 indexed tokenId, uint256 projectFees, uint256 quoteFees);
    event FeesAllocated(
        uint256 indexed tokenId,
        address indexed asset,
        uint256 creatorAmount,
        uint256 protocolAmount
    );
    event FeesClaimed(address indexed recipient, address indexed asset, uint256 amount);

    error OnlyLaunchpad();
    error InvalidPosition();
    error AlreadyRegistered();
    error NothingToClaim();

    constructor(IPositionManagerV4 positionManager_, address protocolTreasury_, address launchpad_) {
        require(
            address(positionManager_) != address(0) && protocolTreasury_ != address(0) && launchpad_ != address(0),
            "ZERO_ADDRESS"
        );
        positionManager = positionManager_;
        protocolTreasury = protocolTreasury_;
        launchpad = launchpad_;
    }

    function registerPosition(
        uint256 tokenId,
        address projectToken,
        address quoteToken,
        bytes32 poolId,
        address creator
    ) external {
        if (msg.sender != launchpad) revert OnlyLaunchpad();
        if (positions[tokenId].registered) revert AlreadyRegistered();
        if (
            projectToken == address(0) || quoteToken == address(0) || creator == address(0)
                || positionManager.ownerOf(tokenId) != address(this)
        ) revert InvalidPosition();
        (PoolKey memory key,) = positionManager.getPoolAndPositionInfo(tokenId);
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        if (
            PoolId.unwrap(key.toId()) != poolId
                || !((c0 == projectToken && c1 == quoteToken) || (c1 == projectToken && c0 == quoteToken))
        ) revert InvalidPosition();
        positions[tokenId] = PositionConfig(true, projectToken, quoteToken, poolId, creator);
        emit PositionRegistered(tokenId, poolId, projectToken, quoteToken, creator);
    }

    /// @notice Permissionlessly realizes fees with zero liquidity change.
    function collectFees(uint256 tokenId) external nonReentrant {
        PositionConfig memory c = positions[tokenId];
        if (!c.registered) revert InvalidPosition();
        (PoolKey memory key,) = positionManager.getPoolAndPositionInfo(tokenId);
        address token0 = Currency.unwrap(key.currency0);
        address token1 = Currency.unwrap(key.currency1);
        uint256 before0 = IERC20(token0).balanceOf(address(this));
        uint256 before1 = IERC20(token1).balanceOf(address(this));

        bytes memory actions = abi.encodePacked(
            uint8(Actions.INCREASE_LIQUIDITY),
            uint8(Actions.TAKE_PAIR)
        );
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1, address(this));
        positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp);

        uint256 amount0 = IERC20(token0).balanceOf(address(this)) - before0;
        uint256 amount1 = IERC20(token1).balanceOf(address(this)) - before1;
        uint256 projectFees = token0 == c.projectToken ? amount0 : amount1;
        uint256 quoteFees = token0 == c.quoteToken ? amount0 : amount1;
        _allocate(tokenId, c.creator, c.projectToken, projectFees);
        _allocate(tokenId, c.creator, c.quoteToken, quoteFees);
        emit FeesCollected(tokenId, projectFees, quoteFees);
    }

    function _allocate(uint256 tokenId, address creator, address asset, uint256 amount) private {
        if (amount == 0) return;
        uint256 creatorAmount = amount * CREATOR_SHARE_BPS / 10_000;
        uint256 protocolAmount = amount - creatorAmount;
        claimable[creator][asset] += creatorAmount;
        claimable[protocolTreasury][asset] += protocolAmount;
        emit FeesAllocated(tokenId, asset, creatorAmount, protocolAmount);
    }

    function claim(address asset) external nonReentrant returns (uint256 amount) {
        amount = claimable[msg.sender][asset];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender][asset] = 0;
        IERC20(asset).safeTransfer(msg.sender, amount);
        emit FeesClaimed(msg.sender, asset, amount);
    }
}