// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PromoVault} from "./PromoVault.sol";
import {ShortOutcome} from "./ShortOutcome.sol";

interface IMonthlyControllerBinding { function monthlyController() external view returns(address); }

/// Internal monthly component. The integrating controller must authenticate the
/// publisher and one seed, and enforce finality/execution readiness before seal.
/// Parameters are immutable deployment inputs, not selected product defaults.
abstract contract MonthlySettlement is ReentrancyGuard {
    enum Phase { None, Publishing, Ready, WaitingSeed, Processing, Terminal, Superseded }
    struct Input {
        bytes32 drawId; bytes32 snapshotHash; bytes32 root; uint64 campaign;
        uint256 cutoff; bytes32 cutoffHash; uint256 count; uint256 attempts;
    }
    struct Month {
        Input input; Phase phase; bytes32 root; uint256 count; uint256 attempts; address lastWallet;
        bytes32 context; bytes32 seed; uint256 nextChunk; uint256 processed; uint256 admitted;
        address winner; uint256 bestRank; uint256 budget; bytes32 resultHash;
    }
    PromoVault public immutable monthlyVault;
    address public immutable monthlyRegistry;
    bytes32 public immutable monthlyInstance;
    uint256 public immutable monthlyInterval;
    uint256 public immutable monthlyStartedAt;
    bytes32 public immutable monthlyRulesHash;
    ShortOutcome.Rules private policy;
    bytes32 public constant EMPTY_MONTHLY_ROOT=keccak256("MONTHLY_DATASET_V1");
    uint256 public constant MAX_MONTHLY_CHUNK=64;
    mapping(bytes32=>Month) private months;
    mapping(bytes32=>bytes32[]) private chunks;
    bytes32 public activeMonth;
    bytes32 public pendingMonth;
    uint256 public lastMonthAt;
    uint256 public lastMonthBlock;
    event MonthProposed(Input input);
    event MonthChunk(bytes32 indexed drawId,uint256 index,bytes32 hash);
    event MonthSuperseded(bytes32 indexed drawId);
    event MonthFrozen(bytes32 indexed drawId,bytes32 context,uint256 budget);
    event MonthSeedAccepted(bytes32 indexed drawId,bytes32 seed);
    event MonthProgress(bytes32 indexed drawId,uint256 processed,uint256 admitted);
    event AttemptsFrozen(bytes32 indexed drawId,uint8 indexed kind,uint256 cutoffBlockNumber,bytes32 cutoffBlockHash,bytes32 rulesHash,bytes32 snapshotHash);
    event AttemptsConsumed(bytes32 indexed drawId,uint8 indexed kind,bytes32 snapshotHash,uint8 outcome,bytes32 resultHash);
    constructor(address vault,address registry,bytes32 instance,uint256 interval,ShortOutcome.Rules memory rules){
        require(vault!=address(0) && registry.code.length>0 && instance!=bytes32(0) && interval>0,"binding");
        monthlyVault=PromoVault(vault);monthlyRegistry=registry;monthlyInstance=instance;monthlyInterval=interval;
        monthlyRulesHash=ShortOutcome.rulesHash(rules);policy=rules;lastMonthAt=block.timestamp;monthlyStartedAt=block.timestamp;
    }
    function month(bytes32 id) public view returns(Month memory){return months[id];}
    function monthRules() public view returns(ShortOutcome.Rules memory){return policy;}
    function monthChunkCount(bytes32 id) external view returns(uint256){return chunks[id].length;}
    function monthChunkHash(bytes32 id,uint256 index) external view returns(bytes32){return chunks[id][index];}
    function _beginMonth(Input calldata input) internal nonReentrant {
        require(activeMonth==bytes32(0) && pendingMonth==bytes32(0) && block.timestamp>=lastMonthAt+monthlyInterval,"month busy/time");
        require(address(monthlyVault).code.length>0 && IMonthlyControllerBinding(address(monthlyVault)).monthlyController()==address(this),"vault");
        monthlyVault.validateDrawId(input.drawId,1);
        require(input.drawId!=bytes32(0) && months[input.drawId].phase==Phase.None && input.snapshotHash!=bytes32(0)
            && input.root!=bytes32(0) && input.campaign>0 && input.count>0 && input.attempts>=input.count,"month input");
        require(input.cutoff>=lastMonthBlock && input.cutoff<block.number && block.number-input.cutoff<=256
            && input.cutoffHash!=bytes32(0) && blockhash(input.cutoff)==input.cutoffHash,"month cutoff");
        Month storage m=months[input.drawId];m.input=input;m.phase=Phase.Publishing;
        m.root=EMPTY_MONTHLY_ROOT;activeMonth=input.drawId;emit MonthProposed(input);
    }
    function _publishMonth(bytes32 id,ShortOutcome.Participant[] calldata chunk) internal nonReentrant {
        Month storage m=months[id];require(activeMonth==id && m.phase==Phase.Publishing,"month phase");
        require(chunk.length>0 && chunk.length<=MAX_MONTHLY_CHUNK && m.count+chunk.length<=m.input.count,"month chunk");
        for(uint256 i;i<chunk.length;++i){
            ShortOutcome.Participant calldata p=chunk[i];
            require(p.wallet>m.lastWallet && p.wallet!=address(monthlyVault) && p.firstAttempt>0 && p.lastAttempt>=p.firstAttempt,"month participant");
            m.root=keccak256(abi.encode(m.root,p.wallet,p.firstAttempt,p.lastAttempt));m.lastWallet=p.wallet;
            m.attempts+=uint256(p.lastAttempt)-p.firstAttempt+1;
        }
        m.count+=chunk.length;require(m.attempts<=m.input.attempts,"month attempts");
        bytes32 digest=keccak256(abi.encode(chunk));emit MonthChunk(id,chunks[id].length,digest);chunks[id].push(digest);
        if(m.count==m.input.count){require(m.root==m.input.root && m.attempts==m.input.attempts,"month commitment");m.phase=Phase.Ready;}
    }
    function _supersedeMonth(bytes32 id) internal nonReentrant {
        Month storage m=months[id];require(activeMonth==id && (m.phase==Phase.Publishing || m.phase==Phase.Ready),"month phase");
        m.phase=Phase.Superseded;activeMonth=bytes32(0);emit MonthSuperseded(id);
    }
    function _sealMonth(bytes32 id) internal nonReentrant {
        Month storage m=months[id];require(activeMonth==id && pendingMonth==bytes32(0) && m.phase==Phase.Ready,"month ready");
        monthlyVault.startMonthly(id,m.input.campaign);(,,,m.budget,,)=monthlyVault.draws(id);
        m.context=keccak256(abi.encode(keccak256("MONTHLY_DATASET_CONTEXT_V1"),block.chainid,address(this),monthlyInstance,
            monthlyRegistry,address(monthlyVault),monthlyVault.quoteToken(),m.input,monthlyRulesHash,m.budget));
        m.phase=Phase.WaitingSeed;pendingMonth=id;activeMonth=bytes32(0);
        emit AttemptsFrozen(id,1,m.input.cutoff,m.input.cutoffHash,monthlyRulesHash,m.input.snapshotHash);
        emit MonthFrozen(id,m.context,m.budget);
    }
    /// Authenticated RNG wrapper only. Zero seed valid, repeat delivery forbidden.
    function _acceptMonthlySeed(bytes32 id,bytes32 seed) internal nonReentrant {
        Month storage m=months[id];require(pendingMonth==id && m.phase==Phase.WaitingSeed,"month seed");
        m.seed=seed;m.phase=Phase.Processing;emit MonthSeedAccepted(id,seed);
    }
    function processMonth(bytes32 id,uint256 index,ShortOutcome.Participant[] calldata chunk) external nonReentrant {
        Month storage m=months[id];require(m.phase==Phase.Processing && pendingMonth==id && index==m.nextChunk
            && index<chunks[id].length && keccak256(abi.encode(chunk))==chunks[id][index],"month progress");
        (ShortOutcome.Candidate[] memory selected,uint256 admitted)=ShortOutcome.selectTopK(m.context,m.seed,chunk,policy,1);
        if(admitted>0 && (m.winner==address(0) || selected[0].rank<m.bestRank || (selected[0].rank==m.bestRank && selected[0].wallet<m.winner))){
            m.winner=selected[0].wallet;m.bestRank=selected[0].rank;
        }
        m.processed+=chunk.length;m.admitted+=admitted;++m.nextChunk;emit MonthProgress(id,m.processed,m.admitted);
    }
    function finishMonth(bytes32 id) external nonReentrant {
        Month storage m=months[id];require(pendingMonth==id && m.phase==Phase.Processing
            && m.processed==m.count && m.nextChunk==chunks[id].length,"month unfinished");
        monthlyVault.settleMonthly(id,m.winner);
        m.resultHash=keccak256(abi.encode(keccak256("MONTHLY_RESULT_V1"),m.context,m.seed,m.root,m.winner,m.admitted,m.budget));
        m.phase=Phase.Terminal;pendingMonth=bytes32(0);lastMonthAt=block.timestamp;lastMonthBlock=block.number;
        emit AttemptsConsumed(id,1,m.input.snapshotHash,m.winner==address(0)?0:1,m.resultHash);
    }
}
