// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PhotonicAuction — Silent Auction Intent Pool (SAIP)
/// @notice Buyers submit intents; agents bid with genome proofs and BPD samples.
///         ZK_COMMITMENT mode: buyer submits only a hash; intent revealed on selection.
contract PhotonicAuction is Ownable, ReentrancyGuard {

    // ─────────────────────────────────────────────────────────────────────
    //  Types
    // ─────────────────────────────────────────────────────────────────────

    enum PrivacyMode { PUBLIC, ZK_COMMITMENT }
    enum CompositionMode { AUTO, SPECIFIC }
    enum IntentStatus { Open, Awarded, Cancelled, Expired }

    struct Intent {
        bytes32 intentId;
        address buyer;
        bytes32 intentHash;          // Always set (public: hash of description, zk: commitment)
        string  taskDescription;     // Empty in ZK_COMMITMENT until reveal
        uint256 maxCost;             // Max the buyer will pay (in wei)
        uint64  deadline;            // Unix timestamp
        uint256 qualityFloor;        // Minimum BPD quality score (scaled 1e18)
        PrivacyMode privacyMode;
        CompositionMode compositionMode;
        IntentStatus status;
        address winner;
        uint64  createdAt;
        uint64  awardedAt;
    }

    struct Bid {
        address agent;
        bytes32 genomeHash;          // Agent genome hash
        uint256 priceQuote;          // In wei
        bytes32 bpdSample;           // Sample BPD proving delivery history
        uint256 scoreCached;         // Computed score (set at resolution)
        uint64  submittedAt;
        bool    active;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Storage
    // ─────────────────────────────────────────────────────────────────────

    mapping(bytes32 => Intent) public intents;
    mapping(bytes32 => Bid[]) public bids;              // intentId => bids
    mapping(bytes32 => mapping(address => bool)) public hasBid;
    mapping(address => uint256) public agentDiversityScore; // Higher = more unique

    bytes32[] public openIntents;
    bytes32[] public allIntents;

    uint256 public biddingWindow = 1 hours;
    uint256 public protocolFeeBps = 100;                // 1% protocol fee

    // Score weights (sum = 100)
    uint256 public weightBpdQuality = 40;
    uint256 public weightPriceEfficiency = 30;
    uint256 public weightCompositionalFitness = 20;
    uint256 public weightDiversityBonus = 10;

    // ─────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────

    event IntentSubmitted(bytes32 indexed intentId, address indexed buyer, PrivacyMode mode, uint256 maxCost);
    event IntentRevealed(bytes32 indexed intentId, string taskDescription);
    event BidSubmitted(bytes32 indexed intentId, address indexed agent, uint256 priceQuote);
    event IntentAwarded(bytes32 indexed intentId, address indexed winner, uint256 price, uint256 score);
    event IntentCancelled(bytes32 indexed intentId, address indexed buyer);
    event IntentExpired(bytes32 indexed intentId);

    // ─────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─────────────────────────────────────────────────────────────────────
    //  Intent Submission
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Submit a PUBLIC intent (task description visible immediately)
    function submitPublicIntent(
        bytes32 intentId,
        string calldata taskDescription,
        uint256 qualityFloor,
        CompositionMode compositionMode
    ) external payable nonReentrant {
        require(msg.value > 0, "PhotonicAuction: must escrow funds");
        require(intents[intentId].createdAt == 0, "PhotonicAuction: intent exists");

        bytes32 intentHash = keccak256(abi.encodePacked(taskDescription, msg.sender, block.timestamp));

        intents[intentId] = Intent({
            intentId: intentId,
            buyer: msg.sender,
            intentHash: intentHash,
            taskDescription: taskDescription,
            maxCost: msg.value,
            deadline: uint64(block.timestamp + biddingWindow),
            qualityFloor: qualityFloor,
            privacyMode: PrivacyMode.PUBLIC,
            compositionMode: compositionMode,
            status: IntentStatus.Open,
            winner: address(0),
            createdAt: uint64(block.timestamp),
            awardedAt: 0
        });

        openIntents.push(intentId);
        allIntents.push(intentId);
        emit IntentSubmitted(intentId, msg.sender, PrivacyMode.PUBLIC, msg.value);
    }

    /// @notice Submit a ZK_COMMITMENT intent (only hash, task hidden from agents)
    function submitZKIntent(
        bytes32 intentId,
        bytes32 intentHash,       // keccak256(taskDescription || secret_nonce)
        uint256 qualityFloor,
        CompositionMode compositionMode
    ) external payable nonReentrant {
        require(msg.value > 0, "PhotonicAuction: must escrow funds");
        require(intents[intentId].createdAt == 0, "PhotonicAuction: intent exists");

        intents[intentId] = Intent({
            intentId: intentId,
            buyer: msg.sender,
            intentHash: intentHash,
            taskDescription: "",           // Hidden until reveal
            maxCost: msg.value,
            deadline: uint64(block.timestamp + biddingWindow),
            qualityFloor: qualityFloor,
            privacyMode: PrivacyMode.ZK_COMMITMENT,
            compositionMode: compositionMode,
            status: IntentStatus.Open,
            winner: address(0),
            createdAt: uint64(block.timestamp),
            awardedAt: 0
        });

        openIntents.push(intentId);
        allIntents.push(intentId);
        emit IntentSubmitted(intentId, msg.sender, PrivacyMode.ZK_COMMITMENT, msg.value);
    }

    /// @notice Reveal the task description for a ZK intent (after winner selected)
    function revealIntent(
        bytes32 intentId,
        string calldata taskDescription,
        bytes32 nonce
    ) external {
        Intent storage intent = intents[intentId];
        require(intent.buyer == msg.sender, "PhotonicAuction: not buyer");
        require(intent.privacyMode == PrivacyMode.ZK_COMMITMENT, "PhotonicAuction: not ZK mode");
        require(intent.status == IntentStatus.Awarded, "PhotonicAuction: must be awarded first");
        require(
            keccak256(abi.encodePacked(taskDescription, nonce)) == intent.intentHash,
            "PhotonicAuction: hash mismatch"
        );

        intent.taskDescription = taskDescription;
        emit IntentRevealed(intentId, taskDescription);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Bidding
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Agent submits a bid on an open intent
    function submitBid(
        bytes32 intentId,
        bytes32 genomeHash,
        uint256 priceQuote,
        bytes32 bpdSample
    ) external nonReentrant {
        Intent storage intent = intents[intentId];
        require(intent.status == IntentStatus.Open, "PhotonicAuction: intent not open");
        require(block.timestamp < intent.deadline, "PhotonicAuction: bidding closed");
        require(!hasBid[intentId][msg.sender], "PhotonicAuction: already bid");
        require(priceQuote <= intent.maxCost, "PhotonicAuction: above max cost");

        bids[intentId].push(Bid({
            agent: msg.sender,
            genomeHash: genomeHash,
            priceQuote: priceQuote,
            bpdSample: bpdSample,
            scoreCached: 0,
            submittedAt: uint64(block.timestamp),
            active: true
        }));

        hasBid[intentId][msg.sender] = true;
        emit BidSubmitted(intentId, msg.sender, priceQuote);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Award
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Buyer selects winner using PHOTONIC scoring function
    /// Score = (past_BPD_quality * 0.4) + (price_efficiency * 0.3)
    ///       + (compositional_fitness * 0.2) + (diversity_bonus * 0.1)
    function awardIntent(bytes32 intentId) external nonReentrant {
        Intent storage intent = intents[intentId];
        require(intent.buyer == msg.sender, "PhotonicAuction: not buyer");
        require(intent.status == IntentStatus.Open, "PhotonicAuction: not open");
        require(block.timestamp >= intent.deadline, "PhotonicAuction: bidding still open");

        Bid[] storage intentBids = bids[intentId];
        require(intentBids.length > 0, "PhotonicAuction: no bids");

        uint256 bestScore = 0;
        uint256 bestIdx = 0;

        for (uint256 i = 0; i < intentBids.length; i++) {
            if (!intentBids[i].active) continue;
            uint256 score = _computeScore(intentBids[i], intent);
            intentBids[i].scoreCached = score;
            if (score > bestScore) {
                bestScore = score;
                bestIdx = i;
            }
        }

        address winner = intentBids[bestIdx].agent;
        uint256 winnerPrice = intentBids[bestIdx].priceQuote;

        intent.winner = winner;
        intent.status = IntentStatus.Awarded;
        intent.awardedAt = uint64(block.timestamp);

        // Transfer payment to winner, refund remainder to buyer
        uint256 protocolFee = (winnerPrice * protocolFeeBps) / 10000;
        uint256 winnerAmount = winnerPrice - protocolFee;
        uint256 refund = intent.maxCost - winnerPrice;

        if (winnerAmount > 0) {
            (bool ok,) = winner.call{value: winnerAmount}("");
            require(ok, "PhotonicAuction: payment failed");
        }
        if (refund > 0) {
            (bool ok2,) = intent.buyer.call{value: refund}("");
            require(ok2, "PhotonicAuction: refund failed");
        }

        emit IntentAwarded(intentId, winner, winnerPrice, bestScore);
    }

    /// @notice Cancel an intent before it's awarded
    function cancelIntent(bytes32 intentId) external nonReentrant {
        Intent storage intent = intents[intentId];
        require(intent.buyer == msg.sender, "PhotonicAuction: not buyer");
        require(intent.status == IntentStatus.Open, "PhotonicAuction: not open");

        intent.status = IntentStatus.Cancelled;
        (bool ok,) = msg.sender.call{value: intent.maxCost}("");
        require(ok, "PhotonicAuction: refund failed");
        emit IntentCancelled(intentId, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Scoring
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Simplified on-chain scoring. Off-chain oracle can enrich further.
    function _computeScore(Bid memory bid, Intent memory intent) internal view returns (uint256) {
        uint256 scale = 1e18;

        // BPD quality proxy: non-zero BPD sample gets base score
        uint256 bpdQuality = bid.bpdSample != bytes32(0) ? 8 * scale / 10 : 3 * scale / 10;

        // Price efficiency: how far below max cost (inverted — lower is better)
        uint256 priceEfficiency = intent.maxCost > 0
            ? scale - (bid.priceQuote * scale / intent.maxCost)
            : 0;

        // Compositional fitness: diversity score of agent
        uint256 diversity = agentDiversityScore[bid.agent];
        uint256 diversityBonus = diversity > 0 ? (diversity * scale / 100) : scale / 10;
        if (diversityBonus > scale) diversityBonus = scale;

        // Compositional fitness: genome hash non-zero = registered
        uint256 compositionalFitness = bid.genomeHash != bytes32(0) ? 7 * scale / 10 : 4 * scale / 10;

        uint256 score = (bpdQuality * weightBpdQuality)
            + (priceEfficiency * weightPriceEfficiency)
            + (compositionalFitness * weightCompositionalFitness)
            + (diversityBonus * weightDiversityBonus);

        return score / 100;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Admin
    // ─────────────────────────────────────────────────────────────────────

    function setAgentDiversityScore(address agent, uint256 score) external onlyOwner {
        agentDiversityScore[agent] = score;
    }

    function setBiddingWindow(uint256 _window) external onlyOwner { biddingWindow = _window; }
    function setProtocolFee(uint256 _bps) external onlyOwner {
        require(_bps <= 1000, "max 10%");
        protocolFeeBps = _bps;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Views
    // ─────────────────────────────────────────────────────────────────────

    function getIntent(bytes32 intentId) external view returns (Intent memory) {
        return intents[intentId];
    }

    function getBids(bytes32 intentId) external view returns (Bid[] memory) {
        return bids[intentId];
    }

    function getOpenIntentCount() external view returns (uint256) {
        return openIntents.length;
    }

    function getAllIntentCount() external view returns (uint256) {
        return allIntents.length;
    }
}
