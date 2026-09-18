// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ChainBlocks} from "../../contracts/ChainBlocks.sol";
import {ShortSettlement} from "../../contracts/ShortSettlement.sol";
import {ShortOutcome} from "../../contracts/ShortOutcome.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IStudyRandom {
    function ready() external view returns (bool);
    function fee() external view returns (uint256);
    function request(bytes32 context) external payable returns (uint256);
}

/// SIZE/BEHAVIOR EXPERIMENT ONLY. Not an approved provider, policy or deployment.
contract ShortRngSizeStudy is ShortSettlement, Ownable2Step {
    struct Setup {
        address vault; address registry; bytes32 instance; address governor; address publisher; address provider;
        uint256 notice; uint256 confirmations; uint256 maxBudget; uint256 maxGasPrice; uint256 nativeFloor;
    }
    struct Binding { bytes32 drawId; bytes32 context; uint8 kind; bool delivered; }
    IStudyRandom public immutable randomProvider;
    uint256 public immutable confirmations;
    uint256 public immutable maxBudget;
    uint256 public immutable maxGasPrice;
    uint256 public immutable nativeFloor;
    address public publisher;
    address public pendingPublisher;
    mapping(uint256 => Binding) public requests;
    mapping(bytes32 => uint256) public drawRequest;
    bool private requesting;
    event PublisherProposed(address candidate);
    event PublisherAccepted(address publisher);
    event RandomBound(uint256 indexed requestId, bytes32 indexed drawId, bytes32 context, uint8 kind);

    constructor(Setup memory s, ShortOutcome.Rules memory r, uint256[] memory w)
        ShortSettlement(s.vault,s.registry,s.instance,s.notice,r,w,1) Ownable(s.governor) {
        require(s.publisher != address(0) && s.provider.code.length > 0 && s.confirmations > 0
            && s.confirmations <= 256 && s.maxBudget > 0 && s.maxGasPrice > 0, "config");
        publisher=s.publisher; randomProvider=IStudyRandom(s.provider); confirmations=s.confirmations;
        maxBudget=s.maxBudget; maxGasPrice=s.maxGasPrice; nativeFloor=s.nativeFloor;
    }
    receive() external payable {}
    modifier onlyPublisher(){require(msg.sender==publisher,"publisher");_;}
    function proposePublisher(address next) external onlyOwner {
        require(next!=address(0),"publisher");pendingPublisher=next;emit PublisherProposed(next);
    }
    function acceptPublisher() external {
        require(msg.sender==pendingPublisher,"publisher");publisher=msg.sender;pendingPublisher=address(0);emit PublisherAccepted(msg.sender);
    }
    function announce(ShortOutcome.Rules calldata r,uint256[] calldata w,uint256 m) external onlyOwner {_announceShortRules(r,w,m);}
    function activate() external {_activateShortRules();}
    function begin(bytes32 id,Request calldata r) external onlyPublisher {
        require(ChainBlocks.number() >= r.cutoffBlockNumber+confirmations && r.budget<=maxBudget,"finality/budget");
        _beginEpochDataset(id,r);
    }
    function publish(bytes32 id,ShortOutcome.Participant[] calldata data) external onlyPublisher {_publishDataset(id,data);}
    function supersede(bytes32 id) external onlyPublisher {_supersedeDataset(id);}
    function closeEmpty(uint256 c,bytes32 h,bytes32 s) external onlyPublisher {
        require(ChainBlocks.number()>=c+confirmations,"finality");_closeEmptyShortEpoch(c,h,s);
    }
    function executionReady() public view returns(bool) {
        return !requesting && randomProvider.ready() && tx.gasprice<=maxGasPrice
            && address(this).balance>=randomProvider.fee()+nativeFloor;
    }
    function seal(bytes32 id) external {
        require(executionReady(),"not ready");
        _sealShortDraw(id);Proposal memory p=datasetProposal(id);
        _request(p.request.drawId,p.context,0);
    }
    function _request(bytes32 drawId,bytes32 context,uint8 kind) internal {
        require(!requesting && drawRequest[drawId]==0,"request");requesting=true;
        uint256 key=randomProvider.request{value:randomProvider.fee()}(context);
        require(key!=0 && requests[key].drawId==bytes32(0),"request id");
        requests[key]=Binding(drawId,context,kind,false);drawRequest[drawId]=key;requesting=false;
        emit RandomBound(key,drawId,context,kind);
    }
    function fulfill(uint256 key,bytes32 seed) external {
        require(msg.sender==address(randomProvider) && !requesting,"provider");
        Binding storage b=requests[key];require(b.drawId!=bytes32(0) && !b.delivered,"delivery");
        b.delivered=true;
        if(b.kind==0) _acceptShortSeed(b.drawId,seed);else _deliverMonth(b.drawId,seed);
    }
    function _deliverMonth(bytes32,bytes32) internal virtual { revert("kind"); }
}

/// Candidate month model: capped admission then minimum uniform rank, K=1.
/// 30 days and fixed q are MEASUREMENT ASSUMPTIONS, not adopted product parameters.
contract FullControllerSizeStudy is ShortRngSizeStudy {
    enum MonthPhase { None, Publishing, Ready, WaitingSeed, Processing, Terminal, Superseded }
    struct MonthInput {
        bytes32 drawId; bytes32 snapshotHash; bytes32 root; uint64 campaign;
        uint256 cutoff; bytes32 cutoffHash; uint256 count; uint256 attempts;
    }
    struct Month {
        MonthInput input; MonthPhase phase; bytes32 root; uint256 count; uint256 attempts; address lastWallet;
        bytes32 context; bytes32 seed; uint256 nextChunk; uint256 processed; uint256 admitted;
        address winner; uint256 bestRank; uint256 budget;
    }
    mapping(bytes32=>Month) private months;
    mapping(bytes32=>bytes32[]) private monthChunks;
    bytes32 public activeMonth;
    bytes32 public pendingMonth;
    uint256 public lastMonthAt;
    uint256 public lastMonthBlock;
    uint256 public constant MONTH_INTERVAL=30 days;
    event MonthProposed(MonthInput input);
    event MonthChunk(bytes32 indexed drawId,uint256 index,bytes32 hash);
    event MonthSuperseded(bytes32 indexed drawId);
    event MonthFrozen(bytes32 indexed drawId,bytes32 context,uint256 budget);
    event MonthProgress(bytes32 indexed drawId,uint256 processed,uint256 admitted);
    constructor(Setup memory s,ShortOutcome.Rules memory r,uint256[] memory w) ShortRngSizeStudy(s,r,w){lastMonthAt=block.timestamp;}
    function month(bytes32 drawId) external view returns(Month memory){return months[drawId];}
    function monthChunkCount(bytes32 id) external view returns(uint256){return monthChunks[id].length;}
    function monthChunkHash(bytes32 id,uint256 index) external view returns(bytes32){return monthChunks[id][index];}
    function monthRules() public pure returns(ShortOutcome.Rules memory){return ShortOutcome.Rules(1,1,5,3,1);}
    function beginMonth(MonthInput calldata input) external onlyPublisher nonReentrant {
        require(activeMonth==bytes32(0) && pendingMonth==bytes32(0) && block.timestamp>=lastMonthAt+MONTH_INTERVAL,"month busy/time");
        require(input.drawId!=bytes32(0) && months[input.drawId].phase==MonthPhase.None && input.snapshotHash!=bytes32(0)
            && input.root!=bytes32(0) && input.campaign>0 && input.count>0 && input.attempts>=input.count,"month input");
        require(input.cutoff>=lastMonthBlock && ChainBlocks.number()>=input.cutoff+confirmations && input.cutoff<ChainBlocks.number()
            && ChainBlocks.number()-input.cutoff<=256 && input.cutoffHash!=bytes32(0) && ChainBlocks.recentHash(input.cutoff)==input.cutoffHash,"month cutoff");
        Month storage m=months[input.drawId];m.input=input;m.phase=MonthPhase.Publishing;
        m.root=keccak256("MONTH_DATASET_SIZE_STUDY_V1");activeMonth=input.drawId;emit MonthProposed(input);
    }
    function publishMonth(bytes32 id,ShortOutcome.Participant[] calldata chunk) external onlyPublisher nonReentrant {
        Month storage m=months[id];require(activeMonth==id && m.phase==MonthPhase.Publishing,"month phase");
        require(chunk.length>0 && chunk.length<=MAX_DATASET_CHUNK && m.count+chunk.length<=m.input.count,"month chunk");
        for(uint256 i;i<chunk.length;++i){
            ShortOutcome.Participant calldata p=chunk[i];
            require(p.wallet>m.lastWallet && p.wallet!=address(datasetVault) && p.firstAttempt>0 && p.lastAttempt>=p.firstAttempt,"month participant");
            m.root=keccak256(abi.encode(m.root,p.wallet,p.firstAttempt,p.lastAttempt));m.lastWallet=p.wallet;
            m.attempts+=uint256(p.lastAttempt)-p.firstAttempt+1;
        }
        m.count+=chunk.length;require(m.attempts<=m.input.attempts,"month attempts");
        bytes32 digest=keccak256(abi.encode(chunk));emit MonthChunk(id,monthChunks[id].length,digest);monthChunks[id].push(digest);
        if(m.count==m.input.count){require(m.root==m.input.root && m.attempts==m.input.attempts,"month commitment");m.phase=MonthPhase.Ready;}
    }
    function supersedeMonth(bytes32 id) external onlyPublisher nonReentrant {
        Month storage m=months[id];require(activeMonth==id && (m.phase==MonthPhase.Publishing || m.phase==MonthPhase.Ready),"month phase");
        m.phase=MonthPhase.Superseded;activeMonth=bytes32(0);emit MonthSuperseded(id);
    }
    function sealMonth(bytes32 id) external nonReentrant {
        Month storage m=months[id];require(activeMonth==id && pendingMonth==bytes32(0) && m.phase==MonthPhase.Ready && executionReady(),"month ready");
        datasetVault.startMonthly(id,m.input.campaign);
        (,,,m.budget,,)=datasetVault.draws(id);
        m.context=keccak256(abi.encode(keccak256("MONTH_CONTEXT_SIZE_STUDY_V1"),block.chainid,address(this),datasetInstance,
            datasetRegistry,address(datasetVault),m.input,ShortOutcome.rulesHash(monthRules()),m.budget));
        m.phase=MonthPhase.WaitingSeed;pendingMonth=id;activeMonth=bytes32(0);
        _request(id,m.context,1);
        emit AttemptsFrozen(id,1,m.input.cutoff,m.input.cutoffHash,ShortOutcome.rulesHash(monthRules()),m.input.snapshotHash);
        emit MonthFrozen(id,m.context,m.budget);
    }
    function _deliverMonth(bytes32 id,bytes32 seed) internal override nonReentrant {
        Month storage m=months[id];require(pendingMonth==id && m.phase==MonthPhase.WaitingSeed,"month seed");
        m.seed=seed;m.phase=MonthPhase.Processing;
    }
    function processMonth(bytes32 id,uint256 index,ShortOutcome.Participant[] calldata chunk) external nonReentrant {
        Month storage m=months[id];require(m.phase==MonthPhase.Processing && pendingMonth==id && index==m.nextChunk
            && index<monthChunks[id].length && keccak256(abi.encode(chunk))==monthChunks[id][index],"month progress");
        (ShortOutcome.Candidate[] memory selected,uint256 admitted)=ShortOutcome.selectTopK(m.context,m.seed,chunk,monthRules(),1);
        if(admitted>0 && (m.winner==address(0) || selected[0].rank<m.bestRank || (selected[0].rank==m.bestRank && selected[0].wallet<m.winner))){
            m.winner=selected[0].wallet;m.bestRank=selected[0].rank;
        }
        m.processed+=chunk.length;m.admitted+=admitted;++m.nextChunk;emit MonthProgress(id,m.processed,m.admitted);
    }
    function finishMonth(bytes32 id) external nonReentrant {
        Month storage m=months[id];require(pendingMonth==id && m.phase==MonthPhase.Processing
            && m.processed==m.count && m.nextChunk==monthChunks[id].length,"month unfinished");
        datasetVault.settleMonthly(id,m.winner);
        bytes32 resultHash=keccak256(abi.encode(keccak256("MONTH_RESULT_SIZE_STUDY_V1"),m.context,m.seed,m.root,m.winner,m.admitted,m.budget));
        m.phase=MonthPhase.Terminal;pendingMonth=bytes32(0);lastMonthAt=block.timestamp;lastMonthBlock=ChainBlocks.number();
        emit AttemptsConsumed(id,1,m.input.snapshotHash,m.winner==address(0)?0:1,resultHash);
    }
}

/// Local stand-in for an asynchronous provider; zero randomness is valid.
contract SizeStudyRandom {
    bool public ready=true;
    uint256 public fee=1;
    uint256 public nextId;
    bool public fail;
    mapping(uint256=>address) public requesters;
    mapping(uint256=>bytes32) public contexts;
    function setReady(bool value) external {ready=value;}
    function setFailure(bool value) external {fail=value;}
    function request(bytes32 context) external payable returns(uint256 key){
        require(!fail && ready && msg.value==fee,"provider failure");key=++nextId;requesters[key]=msg.sender;contexts[key]=context;
    }
    function deliver(uint256 key,bytes32 seed) external {
        ShortRngSizeStudy(payable(requesters[key])).fulfill(key,seed);
    }
}
