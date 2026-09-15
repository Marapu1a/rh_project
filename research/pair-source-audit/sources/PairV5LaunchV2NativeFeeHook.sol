// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId,PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {IStateView} from "@uniswap/v4-periphery/src/interfaces/IStateView.sol";
import {BeforeSwapDelta,BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

interface INativeFeeStateViewSource { function stateView() external view returns(IStateView); }
interface INativeFeeHookEngine {
    function coordinator() external view returns(address); function launchpad() external view returns(address);
    function hook() external view returns(address); function buybackExecutor() external view returns(address);
}
interface INativeFeeHookCoordinator {
    function hook() external view returns(address); function buybackExecutor() external view returns(address);
}
interface INativeFeeHookExecutor { function coordinator() external view returns(address); }

/// @notice Observation-only hook for standard V4 LP-fee Launch V2 pools.
/// @dev The mined address has beforeSwap/afterSwap bits only. It never requests
/// return deltas and never takes currency from PoolManager.
contract PairV5LaunchV2NativeFeeHook is BaseHook {
    using PoolIdLibrary for PoolKey;
    uint32 public constant TWAP_WINDOW=30 minutes;
    uint32 public constant MAX_OBSERVATION_AGE=5 minutes;
    uint32 public constant MIN_OBSERVATION_INTERVAL=60 seconds;
    uint8 public constant MAX_OBSERVATIONS=32;
    address public immutable launchpad;
    address public immutable registrar;
    IStateView public immutable stateView;
    struct PoolConfig { address token; address quote; address vault; uint256 positionId; bool registered; }
    struct Observation { uint32 timestamp; int24 tick; }
    mapping(bytes32=>PoolConfig) public pools;
    mapping(bytes32=>Observation[MAX_OBSERVATIONS]) private _observations;
    mapping(bytes32=>uint8) public observationCount;
    mapping(bytes32=>uint8) private _observationNext;
    mapping(bytes32=>uint256) public completedTwapUpdatedAt;
    mapping(bytes32=>uint256) public swapCount;
    mapping(bytes32=>uint160) public launchBoundarySqrtPriceX96;
    error OnlyRegistrar(); error InvalidPool(); error UnknownPool(); error InsufficientHistory();

    constructor(IPoolManager manager,address launchpad_,address registrar_) BaseHook(manager) {
        if(launchpad_==address(0)||registrar_==address(0)) revert InvalidPool();
        launchpad=launchpad_; registrar=registrar_;
        stateView=INativeFeeStateViewSource(launchpad_).stateView();
        if(address(stateView)==address(0)) revert InvalidPool();
    }
    function validateHookAddress(BaseHook) internal pure override {}
    function getHookPermissions() public pure override returns(Hooks.Permissions memory p) {
        p.beforeSwap=true; p.afterSwap=true;
    }
    function nativeFeeVersion() external pure returns(uint256){return 2;}
    function buybackProvisioningVersion() external pure returns(uint256){return 2;}
    function buybackRouteProvisioningVersion() external pure returns(uint256){return 2;}
    function buybackExecutor() external view returns(address value) {
        INativeFeeHookEngine engine=INativeFeeHookEngine(registrar);
        address coordinator=engine.coordinator();
        if(engine.hook()!=address(this)||engine.launchpad()!=launchpad)revert InvalidPool();
        value=engine.buybackExecutor();
        if(value==address(0)||INativeFeeHookCoordinator(coordinator).hook()!=address(this)
            ||INativeFeeHookCoordinator(coordinator).buybackExecutor()!=value
            ||INativeFeeHookExecutor(value).coordinator()!=coordinator)revert InvalidPool();
    }
    function registerPool(PoolKey calldata key,address token,address quote,address vault,uint256 positionId) external {
        if(msg.sender!=registrar) revert OnlyRegistrar();
        if(address(key.hooks)!=address(this)||key.fee!=10_000||key.tickSpacing!=200||token==address(0)
            ||quote==address(0)||vault==address(0)||positionId==0||token==quote) revert InvalidPool();
        address a=Currency.unwrap(key.currency0); address b=Currency.unwrap(key.currency1);
        if(!((a==token&&b==quote)||(a==quote&&b==token))) revert InvalidPool();
        bytes32 id=PoolId.unwrap(key.toId());
        if(pools[id].registered) revert InvalidPool();
        pools[id]=PoolConfig(token,quote,vault,positionId,true);
        (uint160 sqrt,int24 tick,,)=stateView.getSlot0(PoolId.wrap(id));
        launchBoundarySqrtPriceX96[id]=sqrt; _writeObservation(id,tick);
    }
    function _beforeSwap(address,PoolKey calldata key,SwapParams calldata,bytes calldata)
        internal override returns(bytes4,BeforeSwapDelta,uint24) {
        bytes32 id=PoolId.unwrap(key.toId()); _pool(key); ++swapCount[id];
        (,int24 tick,,)=stateView.getSlot0(key.toId()); _writeObservation(id,tick);
        return(IHooks.beforeSwap.selector,BeforeSwapDeltaLibrary.ZERO_DELTA,0);
    }
    function _afterSwap(address,PoolKey calldata key,SwapParams calldata,BalanceDelta,bytes calldata)
        internal view override returns(bytes4,int128) {
        _pool(key); return(IHooks.afterSwap.selector,0);
    }
    function consult(bytes32 id,uint32 window) public view returns(int24) {
        (int256 weighted,uint256 duration)=_consultAccumulator(id,window);
        return int24(weighted/int256(duration));
    }
    function getQuote(bytes32 id,uint256 amountIn,bool quoteIsInput) external view returns(uint256) {
        PoolConfig memory p=pools[id]; if(!p.registered||amountIn==0) revert UnknownPool();
        bool quoteIs0=p.quote<p.token; bool inputIs0=quoteIsInput==quoteIs0;
        int24 tick=_consultRounded(id,!inputIs0);
        uint160 sqrt=TickMath.getSqrtPriceAtTick(tick);
        if(sqrt<=type(uint128).max) {
            uint256 ratio=uint256(sqrt)*uint256(sqrt);
            return quoteIsInput==quoteIs0?FullMath.mulDiv(amountIn,ratio,1<<192):FullMath.mulDiv(amountIn,1<<192,ratio);
        }
        uint256 ratio128=FullMath.mulDiv(uint256(sqrt),uint256(sqrt),1<<64);
        return quoteIsInput==quoteIs0?FullMath.mulDiv(amountIn,ratio128,1<<128):FullMath.mulDiv(amountIn,1<<128,ratio128);
    }
    function _consultAccumulator(bytes32 id,uint32 window) private view returns(int256 weighted,uint256 duration) {
        if(!pools[id].registered||window!=TWAP_WINDOW) revert UnknownPool();
        uint8 count=observationCount[id]; if(count<2) revert InsufficientHistory();
        uint256 newest=(_observationNext[id]+MAX_OBSERVATIONS-1)%MAX_OBSERVATIONS;
        Observation memory end=_observations[id][newest];
        if(block.timestamp-end.timestamp>MAX_OBSERVATION_AGE||end.timestamp<window) revert InsufficientHistory();
        uint256 target=end.timestamp-window; uint256 cursor=end.timestamp; bool covered;
        for(uint256 i=1;i<count;++i) {
            Observation memory o=_observations[id][(newest+MAX_OBSERVATIONS-i)%MAX_OBSERVATIONS];
            uint256 from=o.timestamp>target?o.timestamp:target;
            if(cursor>from) weighted+=int256(o.tick)*int256(cursor-from);
            if(o.timestamp<=target){covered=true;break;} cursor=o.timestamp;
        }
        if(!covered) revert InsufficientHistory(); duration=window;
    }
    function _consultRounded(bytes32 id,bool up) private view returns(int24) {
        (int256 weighted,uint256 duration)=_consultAccumulator(id,TWAP_WINDOW);
        int256 d=int256(duration); int256 q=weighted/d;
        if(weighted%d!=0){if(up&&weighted>0)++q;else if(!up&&weighted<0)--q;}
        return int24(q);
    }
    function _writeObservation(bytes32 id,int24 tick) private {
        uint8 next=_observationNext[id];
        Observation storage last=_observations[id][(next+MAX_OBSERVATIONS-1)%MAX_OBSERVATIONS];
        if(observationCount[id]!=0&&block.timestamp-uint256(last.timestamp)<MIN_OBSERVATION_INTERVAL)return;
        _observations[id][next]=Observation(uint32(block.timestamp),tick);
        _observationNext[id]=(next+1)%MAX_OBSERVATIONS;
        if(observationCount[id]<MAX_OBSERVATIONS)++observationCount[id];
        uint8 count=observationCount[id];
        if(block.timestamp>=TWAP_WINDOW) {
            uint256 target=block.timestamp-TWAP_WINDOW;
            for(uint256 i=1;i<count;++i) {
                Observation memory prior=_observations[id][(next+MAX_OBSERVATIONS-i)%MAX_OBSERVATIONS];
                if(prior.timestamp<=target){completedTwapUpdatedAt[id]=block.timestamp;break;}
            }
        }
    }
    function observationAt(bytes32 id,uint8 index) external view returns(uint32,int24) {
        if(index>=observationCount[id]) revert UnknownPool();
        Observation memory o=_observations[id][index]; return(o.timestamp,o.tick);
    }
    function _pool(PoolKey calldata key) private view returns(PoolConfig storage p) {
        p=pools[PoolId.unwrap(key.toId())];
        if(!p.registered||address(key.hooks)!=address(this)||key.fee!=10_000||key.tickSpacing!=200) revert UnknownPool();
    }
}