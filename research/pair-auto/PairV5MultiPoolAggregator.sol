// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IPermit2Allowance, IUniversalRouterV4, IPairV5LaunchPoolSource} from "./interfaces/IPairV4.sol";
import {PairV4RoutePolicy as Policy} from "./PairV4RoutePolicy.sol";

interface ISwapRouter02Aggregator {
    struct ExactInputParams { bytes path; address recipient; uint256 amountIn; uint256 amountOutMinimum; }
    function exactInput(ExactInputParams calldata params) external returns (uint256 amountOut);
}

/// @notice Permissionless exact-input router for already-created canonical PAIR V5 launch pools.
/// @dev This deliberately does not wrap `launchTokenMulti`: a wrapper changes the launchpad's
/// `msg.sender` creator attribution and therefore cannot preserve launch-time protections.
contract PairV5MultiPoolAggregator is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    uint256 public constant MAX_LEGS = 5;
    uint256 public constant MAX_DEADLINE_WINDOW = 1 days;
    bytes1 private constant V4_SWAP_COMMAND = 0x10;

    struct RobinhoodExactInputSingleParams {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        uint256 minHopPriceX36;
        bytes hookData;
    }
    /// @dev `poolKey` is supplied for auditability, but is never trusted.
    struct Leg {
        uint8 poolIndex;
        PoolKey poolKey;
        uint128 amountIn;
        uint128 minAmountOut;
    }
    struct BalanceSet {
        address[] tokens;
        uint256[] opening;
        uint256 count;
    }

    address public immutable launchpad;
    address public immutable poolManager;
    address public immutable universalRouter;
    address public immutable permit2;
    address public immutable swapRouter02;
    address public immutable weth;
    address public immutable usdg;

    error InvalidAddress();
    error InvalidAmount();
    error ExpiredOrUnboundedDeadline();
    error DuplicatePool(uint8 index);
    error InvalidPoolKey(uint8 index);
    error UnsupportedRoute(address token);
    error Slippage(uint256 minimum, uint256 actual);
    error BalanceNotRestored(address token, uint256 opening, uint256 closing);

    event AggregatedBuy(address indexed payer, address indexed projectToken, address indexed recipient,
        address fundingToken, uint256 amountIn, uint256 amountOut);
    event AggregatedSell(address indexed payer, address indexed projectToken, address indexed recipient,
        address outputToken, uint256 amountIn, uint256 amountOut);

    constructor(address launchpad_, address poolManager_, address universalRouter_, address permit2_,
        address swapRouter02_, address weth_, address usdg_) {
        if (launchpad_ == address(0) || poolManager_ == address(0) || universalRouter_ == address(0)
            || permit2_ == address(0) || swapRouter02_ == address(0) || weth_ == address(0)
            || usdg_ == address(0) || weth_ == usdg_) revert InvalidAddress();
        IPairV5LaunchPoolSource source = IPairV5LaunchPoolSource(launchpad_);
        if (source.poolManager() != poolManager_ || source.universalRouter() != universalRouter_
            || source.permit2() != permit2_ || source.pairHook() == address(0)) revert InvalidAddress();
        launchpad = launchpad_;
        poolManager = poolManager_;
        universalRouter = universalRouter_;
        permit2 = permit2_;
        swapRouter02 = swapRouter02_;
        weth = weth_;
        usdg = usdg_;
    }

    /// @notice Lets deployment tooling verify every immutable dependency without state-changing calls.
    function dependenciesConsistent() external view returns (bool) {
        IPairV5LaunchPoolSource source = IPairV5LaunchPoolSource(launchpad);
        return source.poolManager() == poolManager && source.universalRouter() == universalRouter
            && source.permit2() == permit2 && source.pairHook() != address(0);
    }

    function buyExactInput(address projectToken, address fundingToken, address recipient, Leg[] calldata legs,
        uint256 aggregateMinOut, uint256 deadline) external nonReentrant returns (uint256 amountOut) {
        _deadline(deadline);
        if (recipient == address(0)) revert InvalidAddress();
        if (recipient == address(this)) revert InvalidAddress();
        if (!_approved(fundingToken)) revert UnsupportedRoute(fundingToken);
        uint256 totalIn = _validateLegs(projectToken, legs);
        BalanceSet memory balances = _openBalances(fundingToken, projectToken, legs, address(0));
        IERC20(fundingToken).safeTransferFrom(msg.sender, address(this), totalIn);
        for (uint256 i; i < legs.length; ++i) {
            IPairV5LaunchPoolSource.LaunchPool memory pool = _pool(projectToken, legs[i]);
            uint256 quoteIn = fundingToken == pool.quoteToken ? legs[i].amountIn
                : _v3(fundingToken, pool.quoteToken, legs[i].amountIn, 0, address(this));
            uint256 out = _v4(projectToken, pool.quoteToken, pool.quoteToken, projectToken, quoteIn,
                recipient, legs[i].minAmountOut, deadline);
            amountOut += out;
        }
        if (amountOut < aggregateMinOut) revert Slippage(aggregateMinOut, amountOut);
        _restoreBalances(balances);
        emit AggregatedBuy(msg.sender, projectToken, recipient, fundingToken, totalIn, amountOut);
    }

    function sellExactInput(address projectToken, address outputToken, address recipient, Leg[] calldata legs,
        uint256 aggregateMinOut, uint256 deadline) external nonReentrant returns (uint256 amountOut) {
        _deadline(deadline);
        if (recipient == address(0)) revert InvalidAddress();
        if (recipient == address(this)) revert InvalidAddress();
        if (!_approved(outputToken)) revert UnsupportedRoute(outputToken);
        uint256 totalIn = _validateLegs(projectToken, legs);
        BalanceSet memory balances = _openBalances(projectToken, projectToken, legs, outputToken);
        IERC20(projectToken).safeTransferFrom(msg.sender, address(this), totalIn);
        for (uint256 i; i < legs.length; ++i) {
            IPairV5LaunchPoolSource.LaunchPool memory pool = _pool(projectToken, legs[i]);
            // A V4 leg's minimum applies to its quote output.  Conversion legs use
            // zero router minimum and are protected by the aggregate final minimum.
            address v4Recipient = pool.quoteToken == outputToken ? recipient : address(this);
            uint256 quoteOut = _v4(projectToken, pool.quoteToken, projectToken, pool.quoteToken,
                legs[i].amountIn, v4Recipient, pool.quoteToken == outputToken ? legs[i].minAmountOut : 0, deadline);
            uint256 out = pool.quoteToken == outputToken ? quoteOut
                : _v3(pool.quoteToken, outputToken, quoteOut, legs[i].minAmountOut, recipient);
            amountOut += out;
        }
        if (amountOut < aggregateMinOut) revert Slippage(aggregateMinOut, amountOut);
        _restoreBalances(balances);
        emit AggregatedSell(msg.sender, projectToken, recipient, outputToken, totalIn, amountOut);
    }

    function _validateLegs(address project, Leg[] calldata legs) private view returns (uint256 total) {
        if (project == address(0) || legs.length == 0 || legs.length > MAX_LEGS) revert InvalidAmount();
        for (uint256 i; i < legs.length; ++i) {
            if (legs[i].amountIn == 0) revert InvalidAmount();
            for (uint256 j; j < i; ++j) if (legs[i].poolIndex == legs[j].poolIndex) revert DuplicatePool(legs[i].poolIndex);
            IPairV5LaunchPoolSource.LaunchPool memory pool = _pool(project, legs[i]);
            if (!_approved(pool.quoteToken)) revert UnsupportedRoute(pool.quoteToken);
            total += legs[i].amountIn;
        }
    }

    function _pool(address project, Leg calldata leg) private view returns (IPairV5LaunchPoolSource.LaunchPool memory pool) {
        IPairV5LaunchPoolSource source = IPairV5LaunchPoolSource(launchpad);
        if (leg.poolIndex >= source.getLaunchPoolCount(project)) revert InvalidPoolKey(leg.poolIndex);
        pool = source.getLaunchPool(project, leg.poolIndex);
        PoolKey memory expected = _key(project, pool.quoteToken);
        if (Currency.unwrap(leg.poolKey.currency0) != Currency.unwrap(expected.currency0)
            || Currency.unwrap(leg.poolKey.currency1) != Currency.unwrap(expected.currency1)
            || leg.poolKey.fee != expected.fee || leg.poolKey.tickSpacing != expected.tickSpacing
            || address(leg.poolKey.hooks) != address(expected.hooks)
            || PoolId.unwrap(PoolIdLibrary.toId(expected)) != pool.poolId) revert InvalidPoolKey(leg.poolIndex);
    }

    function _key(address project, address quote) private view returns (PoolKey memory) {
        bool projectIs0 = project < quote;
        return PoolKey(Currency.wrap(projectIs0 ? project : quote), Currency.wrap(projectIs0 ? quote : project),
            10_000, 200, IHooks(IPairV5LaunchPoolSource(launchpad).pairHook()));
    }

    function _v4(address project, address quote, address tokenIn, address tokenOut, uint256 input,
        address recipient, uint256 minimum, uint256 deadline) private returns (uint256 output) {
        if (input > type(uint128).max || minimum > type(uint128).max) revert InvalidAmount();
        PoolKey memory key = _key(project, quote);
        uint256 beforeBalance = IERC20(tokenOut).balanceOf(recipient);
        _approveV4(tokenIn, input, deadline);
        RobinhoodExactInputSingleParams memory swap = RobinhoodExactInputSingleParams(
            key, Currency.unwrap(key.currency0) == tokenIn, uint128(input), 0, 0, bytes("")
        );
        bytes memory actions = abi.encodePacked(uint8(Actions.SWAP_EXACT_IN_SINGLE), uint8(Actions.SETTLE), uint8(Actions.TAKE));
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(swap);
        params[1] = abi.encode(Currency.wrap(tokenIn), input, true);
        // Robinhood's proven exact-input settlement requires zero minima in
        // both router-level fields. Slippage is enforced atomically below from
        // the recipient's observed balance delta, exactly like the developer
        // buy adapter.
        params[2] = abi.encode(Currency.wrap(tokenOut), recipient, 0);
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);
        IUniversalRouterV4(universalRouter).execute(abi.encodePacked(V4_SWAP_COMMAND), inputs, deadline);
        _clearV4(tokenIn);
        output = IERC20(tokenOut).balanceOf(recipient) - beforeBalance;
        if (output < minimum) revert Slippage(minimum, output);
    }

    function _v3(address input, address output, uint256 amount, uint256 minimum, address recipient)
        private returns (uint256 result) {
        IERC20(input).forceApprove(swapRouter02, amount);
        result = ISwapRouter02Aggregator(swapRouter02).exactInput(
            ISwapRouter02Aggregator.ExactInputParams(_path(input, output), recipient, amount, minimum)
        );
        IERC20(input).forceApprove(swapRouter02, 0);
        if (result < minimum || result == 0) revert Slippage(minimum, result);
    }

    function _path(address input, address output) private view returns (bytes memory) {
        if (input == output) revert InvalidAmount();
        if (input == weth) return output == usdg ? abi.encodePacked(input, Policy.WETH_USDG_FEE, output)
            : abi.encodePacked(input, Policy.WETH_USDG_FEE, usdg, Policy.usdgFee(output), output);
        if (output == weth) return input == usdg ? abi.encodePacked(input, Policy.WETH_USDG_FEE, output)
            : abi.encodePacked(input, Policy.usdgFee(input), usdg, Policy.WETH_USDG_FEE, output);
        if (input == usdg) return abi.encodePacked(input, Policy.usdgFee(output), output);
        if (output == usdg) return abi.encodePacked(input, Policy.usdgFee(input), output);
        return abi.encodePacked(input, Policy.usdgFee(input), usdg, Policy.usdgFee(output), output);
    }

    function _approveV4(address token, uint256 amount, uint256 deadline) private {
        if (amount > type(uint160).max || deadline > type(uint48).max) revert InvalidAmount();
        IERC20(token).forceApprove(permit2, amount);
        IPermit2Allowance(permit2).approve(token, universalRouter, uint160(amount), uint48(deadline));
    }
    function _clearV4(address token) private {
        IPermit2Allowance(permit2).approve(token, universalRouter, 0, 0);
        IERC20(token).forceApprove(permit2, 0);
    }
    function _approved(address token) private view returns (bool) { return token == weth || token == usdg || Policy.usdgFee(token) != 0; }
    function _deadline(uint256 deadline) private view {
        if (deadline < block.timestamp || deadline > block.timestamp + MAX_DEADLINE_WINDOW) revert ExpiredOrUnboundedDeadline();
    }
    function _openBalances(address primary, address project, Leg[] calldata legs, address output)
        private view returns (BalanceSet memory balances) {
        balances.tokens = new address[](MAX_LEGS + 3);
        balances.opening = new uint256[](MAX_LEGS + 3);
        _addBalance(balances, primary);
        _addBalance(balances, project);
        if (output != address(0)) _addBalance(balances, output);
        for (uint256 i; i < legs.length; ++i) {
            _addBalance(balances, _pool(project, legs[i]).quoteToken);
        }
    }
    function _addBalance(BalanceSet memory balances, address token) private view {
        for (uint256 i; i < balances.count; ++i) if (balances.tokens[i] == token) return;
        balances.tokens[balances.count] = token;
        balances.opening[balances.count] = IERC20(token).balanceOf(address(this));
        ++balances.count;
    }
    function _restoreBalances(BalanceSet memory balances) private view {
        for (uint256 i; i < balances.count; ++i) {
            uint256 closing = IERC20(balances.tokens[i]).balanceOf(address(this));
            if (closing != balances.opening[i]) {
                revert BalanceNotRestored(balances.tokens[i], balances.opening[i], closing);
            }
        }
    }
}