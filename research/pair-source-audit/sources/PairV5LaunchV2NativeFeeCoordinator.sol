// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId,PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import {PairTokenV5LaunchV2Factory} from "./PairTokenV5LaunchV2Factory.sol";
import {PairV5LaunchV2NativeFeeVaultV2} from "./PairV5LaunchV2NativeFeeVaultV2.sol";
import {PairLaunchpadV5Storage} from "./PairLaunchpadV5Storage.sol";
import {IStockTokenRegistryV5,IAggregatorV3V5,IPermit2Allowance,IPositionManagerV4} from "./interfaces/IPairV4.sol";

interface INativeLaunchpad {
    function poolManager() external view returns(address); function positionManager() external view returns(address);
    function permit2() external view returns(address); function stockRegistry() external view returns(address);
    function protocolTreasury() external view returns(address); function protectionBlocks() external view returns(uint256);
    function launchFeeWei() external view returns(uint256); function ethPriceFeed() external view returns(address);
    function maxOracleAge() external view returns(uint256);
    function deriveLaunchEconomics(uint256) external pure returns(uint256,uint256,uint256);
    function calculateV4LaunchRange(address,address,uint8,uint256,uint256,uint256) external pure returns(int24,int24,uint160);
    function registerLaunchV2Vault(address,address) external;
}
interface INativeModeRegistry {
    function launchpad() external view returns(address);
    function resolveCurrent(uint32,address,bytes calldata) external view returns(address,uint256,address[] memory,uint16[] memory,bool);
    function registerProject(address,address,uint32,address,uint256,bool) external;
}
interface INativeModeHandler { function vaultFactory() external view returns(address); }
interface INativeModeVaultFactory {
    function coordinator() external view returns(address); function modeId() external view returns(uint32);
    function deploy(bytes32,IPositionManagerV4,address,address,address,address,address,address,address[] calldata,uint16[] calldata)
        external returns(address);
}
interface INativeHook { function registrar() external view returns(address); function registerPool(PoolKey calldata,address,address,address,uint256) external; }
interface INativeAggregator {
    function coordinator() external view returns(address);
    function executeCanonical(address,address,address,PairLaunchpadV5Storage.LaunchV2TokenDeveloperBuy calldata,uint256)
        external payable returns(uint256,uint256);
}
interface INativeExecutor {
    function coordinator() external view returns(address);
    function registerRoute(address,address,address,bytes32,address,uint8) external;
}
interface INativeExecutorV3 {
    function buybackExecutionPolicyVersion() external pure returns(uint256);
    function registerRoute(address project,address quote,address vault,uint256 positionId,bytes32 poolId,
        address quoteFeed,uint8 quoteDecimals,uint64 cooldown) external;
}

contract PairV5LaunchV2NativeFeePoolEngine {
    using SafeERC20 for IERC20; using PoolIdLibrary for PoolKey;
    address public immutable coordinator; address public immutable launchpad; address public immutable hook;
    address public immutable buybackExecutor;
    IPoolManager public immutable poolManager; IPositionManagerV4 public immutable positionManager; IPermit2Allowance public immutable permit2;
    error OnlyCoordinator(); error InvalidLaunch();
    struct PoolResult {uint256 positionId;bytes32 poolId;int24 lower;int24 upper;uint160 sqrtPrice;
        uint256 settledProjectAmount;address quoteFeed;uint8 quoteDecimals;}
    constructor(address launchpad_,address hook_,address executor_) {
        coordinator=msg.sender;launchpad=launchpad_;hook=hook_;buybackExecutor=executor_;
        poolManager=IPoolManager(INativeLaunchpad(launchpad_).poolManager());
        positionManager=IPositionManagerV4(INativeLaunchpad(launchpad_).positionManager());
        permit2=IPermit2Allowance(INativeLaunchpad(launchpad_).permit2());
    }
    function createPool(address project,PairLaunchpadV5Storage.PairAllocation calldata a,uint256 amount,address vault,uint256 deadline)
        external returns(PoolResult memory r) {
        if(msg.sender!=coordinator)revert OnlyCoordinator();
        IStockTokenRegistryV5.StockConfig memory c=IStockTokenRegistryV5(INativeLaunchpad(launchpad).stockRegistry()).getConfig(a.quoteToken);
        r.quoteFeed=c.priceFeed;r.quoteDecimals=c.decimals;
        (,uint256 floor,uint256 ceiling)=INativeLaunchpad(launchpad).deriveLaunchEconomics(_fresh(INativeLaunchpad(launchpad).ethPriceFeed()));
        (r.lower,r.upper,r.sqrtPrice)=INativeLaunchpad(launchpad).calculateV4LaunchRange(
            project,a.quoteToken,c.decimals,_fresh(c.priceFeed),floor,ceiling);
        bool projectIs0=project<a.quoteToken;
        PoolKey memory key=PoolKey(Currency.wrap(projectIs0?project:a.quoteToken),
            Currency.wrap(projectIs0?a.quoteToken:project),10_000,200,IHooks(hook));
        poolManager.initialize(key,r.sqrtPrice);r.positionId=positionManager.nextTokenId();
        uint160 lo=TickMath.getSqrtPriceAtTick(r.lower);uint160 hi=TickMath.getSqrtPriceAtTick(r.upper);
        uint128 liquidity=projectIs0?LiquidityAmounts.getLiquidityForAmount0(lo,hi,amount)
            :LiquidityAmounts.getLiquidityForAmount1(lo,hi,amount);
        IERC20(project).forceApprove(address(permit2),amount);
        permit2.approve(project,address(positionManager),uint160(amount),uint48(deadline));
        bytes[] memory params=new bytes[](2);
        params[0]=abi.encode(key,r.lower,r.upper,uint256(liquidity),uint128(projectIs0?amount:0),
            uint128(projectIs0?0:amount),vault,bytes(""));
        params[1]=abi.encode(key.currency0,key.currency1);
        uint256 beforeBalance=IERC20(project).balanceOf(address(this));
        positionManager.modifyLiquidities(abi.encode(
            abi.encodePacked(uint8(Actions.MINT_POSITION),uint8(Actions.SETTLE_PAIR)),params),deadline);
        r.settledProjectAmount=beforeBalance-IERC20(project).balanceOf(address(this));
        permit2.approve(project,address(positionManager),0,0);IERC20(project).forceApprove(address(permit2),0);
        r.poolId=PoolId.unwrap(key.toId());
        PairV5LaunchV2NativeFeeVaultV2(vault).registerPosition(r.positionId,a.quoteToken,r.poolId);
        INativeHook(hook).registerPool(key,project,a.quoteToken,vault,r.positionId);
    }
    function burnProjectTokenDust(address project,address destination) external returns(uint256 amount) {
        if(msg.sender!=coordinator)revert OnlyCoordinator();amount=IERC20(project).balanceOf(address(this));
        if(amount!=0)IERC20(project).safeTransfer(destination,amount);
    }
    function _fresh(address feed) private view returns(uint256 price) {
        (uint80 round,int256 answer,,uint256 updated,uint80 answered)=IAggregatorV3V5(feed).latestRoundData();
        if(answer<=0||updated==0||answered<round||updated>block.timestamp
            ||block.timestamp-updated>INativeLaunchpad(launchpad).maxOracleAge())revert InvalidLaunch();
        uint8 d=IAggregatorV3V5(feed).decimals();if(d>36)revert InvalidLaunch();
        price=d==8?uint256(answer):d<8?uint256(answer)*10**(8-d):uint256(answer)/10**(d-8);
        if(price==0)revert InvalidLaunch();
    }
}

/// @notice Canonical Launch V2 ABI backed by standard 1% V4 LP fees.
contract PairV5LaunchV2NativeFeeCoordinator {
    uint256 private constant SUPPLY=1_000_000_000 ether;
    uint64 public constant BUYBACK_EXECUTION_COOLDOWN=30 minutes;
    address public constant PROJECT_TOKEN_DUST_DESTINATION=0x000000000000000000000000000000000000dEaD;
    address public immutable launchpad;address public immutable tokenFactory;address public immutable hook;
    address public immutable buybackExecutor;address public immutable aggregator;address public immutable modeRegistry;
    PairV5LaunchV2NativeFeePoolEngine public immutable poolEngine;
    struct V2Pool {address quote;uint16 weightBps;bytes32 poolId;}
    mapping(address=>V2Pool[]) private _pools;
    error OnlyLaunchpad();error InvalidLaunch();error InvalidConfiguration();error FeeTransferFailed();error ResidualSupply();
    event LaunchV2TokenProjectLaunched(address indexed project,address indexed creator,address indexed vault,bytes32 salt);
    event CanonicalProjectLaunched(address indexed project,address indexed creator,address indexed vault,
        uint32 modeId,uint256 modeVersion,address handler,bytes32 salt);
    event CanonicalPoolLaunched(address indexed project,address indexed vault,address indexed quote,
        bytes32 poolId,uint16 weightBps,uint32 modeId,uint256 modeVersion,address handler);
    constructor(address launchpad_,address factory_,address hook_,address executor_,address aggregator_,address registry_) {
        if(launchpad_==address(0)||factory_==address(0)||hook_==address(0)||executor_==address(0)
            ||aggregator_==address(0)||registry_==address(0))revert InvalidConfiguration();
        launchpad=launchpad_;tokenFactory=factory_;hook=hook_;buybackExecutor=executor_;aggregator=aggregator_;modeRegistry=registry_;
        poolEngine=new PairV5LaunchV2NativeFeePoolEngine(launchpad_,hook_,executor_);
        if(PairTokenV5LaunchV2Factory(factory_).launchpad()!=launchpad_||PairTokenV5LaunchV2Factory(factory_).coordinator()!=address(this)
            ||INativeHook(hook_).registrar()!=address(poolEngine)||INativeExecutor(executor_).coordinator()!=address(this)
            ||INativeAggregator(aggregator_).coordinator()!=address(this)||INativeModeRegistry(registry_).launchpad()!=launchpad_)
            revert InvalidConfiguration();
    }
    function launchV2TokenVersion() external pure returns(uint256){return 2;}
    function nativeFeeLaunchV2Version() external pure returns(uint256){return 2;}
    function standardPoolFee() external pure returns(uint24){return 10_000;}
    function dependencies() external view returns(address,address,address,address,address){return(launchpad,tokenFactory,hook,buybackExecutor,aggregator);}
    function getV2PoolCount(address project) external view returns(uint256){return _pools[project].length;}
    function getV2Pool(address project,uint256 index) external view returns(V2Pool memory){return _pools[project][index];}
    function stockRegistry() external view returns(address){return INativeLaunchpad(launchpad).stockRegistry();}
    function launchV2Token(address creator,PairLaunchpadV5Storage.LaunchV2TokenParams calldata p)
        external payable returns(address project) {
        if(msg.sender!=launchpad)revert OnlyLaunchpad();
        uint256 count=p.allocations.length;
        if(creator==address(0)||p.userSalt==bytes32(0)||count==0||count>5||block.timestamp>p.deadline
            ||p.feeRecipients.length!=0||p.feeSharesBps.length!=0
            ||msg.value!=INativeLaunchpad(launchpad).launchFeeWei()+p.developerBuy.ethAmountIn)revert InvalidLaunch();
        (address handler,uint256 version,address[] memory recipients,uint16[] memory shares,bool eligible)=
            INativeModeRegistry(modeRegistry).resolveCurrent(p.modeId,creator,p.modeConfiguration);
        uint256 weights;IStockTokenRegistryV5 registry=IStockTokenRegistryV5(INativeLaunchpad(launchpad).stockRegistry());
        for(uint256 i;i<count;++i){if(p.allocations[i].weightBps==0||!registry.isEnabled(p.allocations[i].quoteToken))revert InvalidLaunch();
            for(uint256 j;j<i;++j)if(p.allocations[j].quoteToken==p.allocations[i].quoteToken)revert InvalidLaunch();
            weights+=p.allocations[i].weightBps;}
        if(weights!=10_000)revert InvalidLaunch();
        PairTokenV5LaunchV2Factory f=PairTokenV5LaunchV2Factory(tokenFactory);
        address predicted=f.predictTokenAddress(creator,p.userSalt);if(!f.hasVanitySuffix(predicted))revert InvalidLaunch();
        INativeModeVaultFactory vf=INativeModeVaultFactory(INativeModeHandler(handler).vaultFactory());
        if(vf.coordinator()!=address(this)||vf.modeId()!=p.modeId)revert InvalidConfiguration();
        bytes32 salt=keccak256(abi.encode(creator,p.userSalt,predicted));
        address vault=vf.deploy(salt,poolEngine.positionManager(),address(poolEngine),INativeLaunchpad(launchpad).protocolTreasury(),
            predicted,launchpad,modeRegistry,buybackExecutor,recipients,shares);
        project=f.createToken(creator,p.userSalt,p.name,p.symbol,p.metadataURI,p.metadataHash,address(poolEngine.poolManager()),
            address(poolEngine.positionManager()),vault,p.developerBuyRecipient==address(0)?creator:p.developerBuyRecipient,
            buybackExecutor,INativeLaunchpad(launchpad).protectionBlocks(),address(poolEngine));
        if(project!=predicted)revert InvalidConfiguration();
        INativeLaunchpad(launchpad).registerLaunchV2Vault(project,vault);
        INativeModeRegistry(modeRegistry).registerProject(project,vault,p.modeId,handler,version,eligible);
        uint256 allocated;
        for(uint256 i;i<count;++i){uint256 amount=i+1==count?SUPPLY-allocated:Math.mulDiv(SUPPLY,p.allocations[i].weightBps,10_000);
            allocated+=amount;PairV5LaunchV2NativeFeePoolEngine.PoolResult memory r=
                poolEngine.createPool(project,p.allocations[i],amount,vault,p.deadline);
            _pools[project].push(V2Pool(p.allocations[i].quoteToken,p.allocations[i].weightBps,r.poolId));
            // Append before V3 registration so the executor can authenticate
            // the coordinator's canonical pool record.
            _registerBuybackRoute(project,vault,p.allocations[i].quoteToken,r,p.modeId);
            emit CanonicalPoolLaunched(project,vault,p.allocations[i].quoteToken,r.poolId,p.allocations[i].weightBps,p.modeId,version,handler);}
        poolEngine.burnProjectTokenDust(project,PROJECT_TOKEN_DUST_DESTINATION);
        if(IERC20(project).balanceOf(address(poolEngine))!=0)revert ResidualSupply();
        if(p.developerBuy.ethAmountIn!=0)INativeAggregator(aggregator).executeCanonical{value:p.developerBuy.ethAmountIn}(
            project,creator,p.developerBuyRecipient==address(0)?creator:p.developerBuyRecipient,p.developerBuy,p.deadline);
        (bool ok,)=payable(INativeLaunchpad(launchpad).protocolTreasury()).call{value:INativeLaunchpad(launchpad).launchFeeWei()}("");
        if(!ok)revert FeeTransferFailed();
        emit LaunchV2TokenProjectLaunched(project,creator,vault,p.userSalt);
        emit CanonicalProjectLaunched(project,creator,vault,p.modeId,version,handler,p.userSalt);
    }
    function _registerBuybackRoute(address project,address vault,address quote,
        PairV5LaunchV2NativeFeePoolEngine.PoolResult memory r,uint32 modeId) private {
        // Select V3 only from its exact reviewed policy capability. V3 routes
        // belong exclusively to mode 2; modes 1 and 3 have no buyback bucket.
        (bool supported,bytes memory result)=buybackExecutor.call(
            abi.encodeWithSelector(INativeExecutorV3.buybackExecutionPolicyVersion.selector));
        bool isV3=supported&&result.length==32&&abi.decode(result,(uint256))==3;
        if(isV3) {
            if(modeId==2) INativeExecutorV3(buybackExecutor).registerRoute(
                project,quote,vault,r.positionId,r.poolId,r.quoteFeed,r.quoteDecimals,BUYBACK_EXECUTION_COOLDOWN);
            return;
        }
        INativeExecutor(buybackExecutor).registerRoute(project,vault,quote,r.poolId,r.quoteFeed,r.quoteDecimals);
    }
}