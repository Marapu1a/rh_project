// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId,PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IPositionManagerV4} from "./interfaces/IPairV4.sol";

/// @notice Append-only successor vault which settles every LP position before a fee-sharing policy change.
contract PairV5LaunchV2NativeFeeVaultV2 is ReentrancyGuard,IERC721Receiver {
    using SafeERC20 for IERC20; using PoolIdLibrary for PoolKey;
    uint32 public constant FEE_SHARING_MODE=1;
    uint32 public constant BUYBACK_BURN_MODE=2;
    uint16 public constant MODE_SHARE_BPS=7_000;
    uint16 public constant BPS=10_000;
    uint256 public constant MAX_POSITIONS=5;
    IPositionManagerV4 public immutable positionManager;
    address public immutable registrar;
    address public immutable protocolTreasury;
    address public immutable projectToken;
    address public immutable launchpad;
    address public immutable policyController;
    address public immutable buybackExecutor;
    uint32 public immutable modeId;
    uint64 public epoch=1;
    struct Position { bool registered; address quote; bytes32 poolId; }
    mapping(uint256=>Position) public positions;
    uint256[] private _positionIds;
    mapping(uint64=>mapping(address=>mapping(address=>uint256))) public claimable;
    mapping(uint64=>mapping(address=>uint256)) public buybackBucket;
    mapping(uint64=>address[]) private _epochRecipients;
    mapping(uint64=>uint16[]) private _epochShares;
    error OnlyRegistrar(); error OnlyExecutor(); error OnlyPolicyController(); error InvalidPosition();
    error InvalidConfiguration(); error NothingToClaim(); error PermanentMode();
    event NativePositionRegistered(uint256 indexed positionId,bytes32 indexed poolId,address indexed quote);
    event NativeFeesCollected(uint256 indexed positionId,uint256 projectFees,uint256 quoteFees);
    event NativeFeesAllocated(uint256 indexed positionId,address indexed asset,uint256 modeAmount,uint256 protocolAmount);
    event PolicyEpochReplaced(address indexed projectToken,uint64 indexed previousEpoch,uint64 indexed newEpoch,address[] recipients,uint16[] shares);
    event Claimed(address indexed projectToken,uint64 indexed epoch,address indexed recipient,address asset,uint256 amount);
    event BuybackPulled(address indexed projectToken,uint64 indexed epoch,address indexed asset,address to,uint256 amount);

    constructor(IPositionManagerV4 manager,address registrar_,address treasury,address project,address launchpad_,
        address controller,address executor,uint32 mode,address[] memory recipients,uint16[] memory shares) {
        if(address(manager)==address(0)||registrar_==address(0)||treasury==address(0)||project==address(0)
            ||launchpad_==address(0)||controller==address(0)||executor==address(0)
            ||(mode!=FEE_SHARING_MODE&&mode!=BUYBACK_BURN_MODE)) revert InvalidConfiguration();
        positionManager=manager; registrar=registrar_; protocolTreasury=treasury; projectToken=project;
        launchpad=launchpad_; policyController=controller; buybackExecutor=executor; modeId=mode;
        if(mode==FEE_SHARING_MODE)_setPolicy(1,recipients,shares);
        else if(recipients.length!=0||shares.length!=0) revert InvalidConfiguration();
    }

    function nativeFeeVaultVersion() external pure returns(uint256){return 2;}
    function positionCount() external view returns(uint256){return _positionIds.length;}
    function positionIdAt(uint256 index) external view returns(uint256){return _positionIds[index];}

    function registerPosition(uint256 id,address quote,bytes32 poolId) external {
        if(msg.sender!=registrar) revert OnlyRegistrar();
        if(id==0||quote==address(0)||positions[id].registered||_positionIds.length>=MAX_POSITIONS
            ||positionManager.ownerOf(id)!=address(this)) revert InvalidPosition();
        (PoolKey memory key,)=positionManager.getPoolAndPositionInfo(id);
        if(key.fee!=10_000||key.tickSpacing!=200||PoolId.unwrap(key.toId())!=poolId
            ||!((Currency.unwrap(key.currency0)==projectToken&&Currency.unwrap(key.currency1)==quote)
            ||(Currency.unwrap(key.currency1)==projectToken&&Currency.unwrap(key.currency0)==quote))) revert InvalidPosition();
        positions[id]=Position(true,quote,poolId); _positionIds.push(id);
        emit NativePositionRegistered(id,poolId,quote);
    }

    function onERC721Received(address,address,uint256,bytes calldata) external view returns(bytes4) {
        if(msg.sender!=address(positionManager)) revert InvalidPosition();
        return IERC721Receiver.onERC721Received.selector;
    }

    function collectFees(uint256 id) external nonReentrant { _collectFees(id); }

    function _collectFees(uint256 id) private {
        Position memory p=positions[id]; if(!p.registered||positionManager.ownerOf(id)!=address(this)) revert InvalidPosition();
        (PoolKey memory key,)=positionManager.getPoolAndPositionInfo(id);
        if(PoolId.unwrap(key.toId())!=p.poolId||key.fee!=10_000||key.tickSpacing!=200
            ||!((Currency.unwrap(key.currency0)==projectToken&&Currency.unwrap(key.currency1)==p.quote)
            ||(Currency.unwrap(key.currency1)==projectToken&&Currency.unwrap(key.currency0)==p.quote))) revert InvalidPosition();
        address a=Currency.unwrap(key.currency0); address b=Currency.unwrap(key.currency1);
        uint256 beforeA=IERC20(a).balanceOf(address(this)); uint256 beforeB=IERC20(b).balanceOf(address(this));
        bytes[] memory params=new bytes[](2);
        params[0]=abi.encode(id,uint256(0),uint128(0),uint128(0),bytes(""));
        params[1]=abi.encode(key.currency0,key.currency1,address(this));
        positionManager.modifyLiquidities(abi.encode(abi.encodePacked(
            uint8(Actions.INCREASE_LIQUIDITY),uint8(Actions.TAKE_PAIR)),params),block.timestamp);
        uint256 amountA=IERC20(a).balanceOf(address(this))-beforeA;
        uint256 amountB=IERC20(b).balanceOf(address(this))-beforeB;
        uint256 projectFees=a==projectToken?amountA:amountB; uint256 quoteFees=a==p.quote?amountA:amountB;
        _allocate(id,projectToken,projectFees); _allocate(id,p.quote,quoteFees);
        emit NativeFeesCollected(id,projectFees,quoteFees);
    }

    function _allocate(uint256 id,address asset,uint256 amount) private {
        if(amount==0)return;
        uint256 modeAmount=amount*MODE_SHARE_BPS/BPS; uint256 protocolAmount=amount-modeAmount;
        if(protocolAmount!=0)IERC20(asset).safeTransfer(protocolTreasury,protocolAmount);
        uint64 current=epoch;
        if(modeId==FEE_SHARING_MODE) {
            address[] storage recipients=_epochRecipients[current]; uint16[] storage shares=_epochShares[current]; uint256 allocated;
            for(uint256 i;i<recipients.length;++i) {
                uint256 value=i+1==recipients.length?modeAmount-allocated:modeAmount*shares[i]/BPS;
                allocated+=value; claimable[current][recipients[i]][asset]+=value;
            }
        } else if(asset==projectToken) {
            if(modeAmount!=0)IERC20(asset).safeTransfer(buybackExecutor,modeAmount);
        } else buybackBucket[current][asset]+=modeAmount;
        emit NativeFeesAllocated(id,asset,modeAmount,protocolAmount);
    }

    /// @notice Atomically settles the complete registered set into the old epoch, then installs the new policy.
    function transitionFeeSharingAtomic(address[] calldata recipients,uint16[] calldata shares) external nonReentrant {
        if(msg.sender!=policyController) revert OnlyPolicyController();
        if(modeId!=FEE_SHARING_MODE) revert PermanentMode();
        _validatePolicy(recipients,shares);
        uint256 count=_positionIds.length;
        if(count==0||count>MAX_POSITIONS) revert InvalidPosition();
        for(uint256 i;i<count;++i) _collectFees(_positionIds[i]);
        uint64 old=epoch; uint64 next=old+1;
        _setPolicy(next,recipients,shares); epoch=next;
        emit PolicyEpochReplaced(projectToken,old,next,recipients,shares);
    }

    function _validatePolicy(address[] memory recipients,uint16[] memory shares) private pure {
        if(recipients.length==0||recipients.length>5||recipients.length!=shares.length) revert InvalidConfiguration();
        uint256 total;
        for(uint256 i;i<recipients.length;++i) {
            if(recipients[i]==address(0)||shares[i]==0) revert InvalidConfiguration();
            for(uint256 j;j<i;++j)if(recipients[j]==recipients[i])revert InvalidConfiguration();
            total+=shares[i];
        }
        if(total!=BPS)revert InvalidConfiguration();
    }

    function _setPolicy(uint64 which,address[] memory recipients,uint16[] memory shares) private {
        _validatePolicy(recipients,shares);
        for(uint256 i;i<recipients.length;++i) {
            _epochRecipients[which].push(recipients[i]); _epochShares[which].push(shares[i]);
        }
    }
    function epochRecipientCount(uint64 which) external view returns(uint256){return _epochRecipients[which].length;}
    function epochRecipient(uint64 which,uint256 index) external view returns(address,uint16){
        return(_epochRecipients[which][index],_epochShares[which][index]);
    }
    function claim(address asset,uint64 which) external nonReentrant returns(uint256 amount) {
        amount=claimable[which][msg.sender][asset]; if(amount==0)revert NothingToClaim();
        claimable[which][msg.sender][asset]=0; IERC20(asset).safeTransfer(msg.sender,amount);
        emit Claimed(projectToken,which,msg.sender,asset,amount);
    }
    function pullBuyback(address asset,uint64 which,address to) external nonReentrant returns(uint256 amount) {
        return _pull(asset,which,to,type(uint256).max);
    }
    function pullBuybackUpTo(address asset,uint64 which,address to,uint256 maximum) external nonReentrant returns(uint256 amount) {
        return _pull(asset,which,to,maximum);
    }
    function _pull(address asset,uint64 which,address to,uint256 maximum) private returns(uint256 amount) {
        if(msg.sender!=buybackExecutor)revert OnlyExecutor();
        uint256 available=buybackBucket[which][asset]; amount=available<maximum?available:maximum;
        if(amount==0||to==address(0))revert NothingToClaim();
        buybackBucket[which][asset]=available-amount; IERC20(asset).safeTransfer(to,amount);
        emit BuybackPulled(projectToken,which,asset,to,amount);
    }
}