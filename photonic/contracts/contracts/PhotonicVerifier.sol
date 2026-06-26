// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PhotonicVerifier — BPD staking and peer verification
/// @notice Verifiers stake ETH to participate in BPD verification and earn/lose based on accuracy.
contract PhotonicVerifier is Ownable, ReentrancyGuard {

    // ─────────────────────────────────────────────────────────────────────
    //  Types
    // ─────────────────────────────────────────────────────────────────────

    enum VerificationStatus { Pending, Consensus, Disputed, Slashed }

    struct BPDRecord {
        bytes32 bpdHash;             // Hash(intent || output || trace || timestamp || nonce)
        address provider;
        uint256 deliveryFee;
        uint256 stakedTotal;
        uint256 verifierCount;
        uint256 consensusCount;      // verifiers who matched
        VerificationStatus status;
        uint64  createdAt;
        uint64  resolvedAt;
        bool    settled;
    }

    struct VerifierStake {
        uint256 amount;
        bytes32 submittedHash;       // The hash the verifier claims matches
        bool    matched;             // Set after resolution
        bool    claimed;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Storage
    // ─────────────────────────────────────────────────────────────────────

    mapping(bytes32 => BPDRecord) public bpdRecords;             // bpdId => record
    mapping(bytes32 => mapping(address => VerifierStake)) public stakes; // bpdId => verifier => stake
    mapping(bytes32 => address[]) public verifierList;           // bpdId => verifier addresses
    mapping(address => uint256) public verifierReputation;       // lifetime correct verifications
    mapping(address => uint256) public totalSlashed;

    uint256 public minStake = 0.001 ether;
    uint256 public verificationWindow = 30 minutes;
    uint256 public consensusThreshold = 67;    // 67% agreement = consensus
    uint256 public verifierRewardBps = 500;    // 5% of delivery fee split among verifiers

    bytes32[] public allBpdIds;

    // ─────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────

    event BPDSubmitted(bytes32 indexed bpdId, address indexed provider, bytes32 bpdHash, uint256 deliveryFee);
    event VerifierStaked(bytes32 indexed bpdId, address indexed verifier, uint256 amount, bytes32 submittedHash);
    event BPDResolved(bytes32 indexed bpdId, VerificationStatus status, uint256 consensusCount, uint256 totalVerifiers);
    event RewardClaimed(bytes32 indexed bpdId, address indexed verifier, uint256 reward);
    event SlashExecuted(bytes32 indexed bpdId, address indexed verifier, uint256 slashed);

    // ─────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─────────────────────────────────────────────────────────────────────
    //  BPD Lifecycle
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Provider submits a BPD after delivering a task
    function submitBPD(
        bytes32 bpdId,
        bytes32 bpdHash,
        address provider
    ) external payable nonReentrant {
        require(bpdRecords[bpdId].createdAt == 0, "PhotonicVerifier: BPD already exists");
        require(msg.value > 0, "PhotonicVerifier: delivery fee required");

        bpdRecords[bpdId] = BPDRecord({
            bpdHash: bpdHash,
            provider: provider,
            deliveryFee: msg.value,
            stakedTotal: 0,
            verifierCount: 0,
            consensusCount: 0,
            status: VerificationStatus.Pending,
            createdAt: uint64(block.timestamp),
            resolvedAt: 0,
            settled: false
        });

        allBpdIds.push(bpdId);
        emit BPDSubmitted(bpdId, provider, bpdHash, msg.value);
    }

    /// @notice Verifier stakes and submits their re-execution result
    function stakeAndVerify(
        bytes32 bpdId,
        bytes32 submittedHash
    ) external payable nonReentrant {
        BPDRecord storage record = bpdRecords[bpdId];
        require(record.createdAt > 0, "PhotonicVerifier: BPD not found");
        require(record.status == VerificationStatus.Pending, "PhotonicVerifier: already resolved");
        require(block.timestamp < record.createdAt + verificationWindow, "PhotonicVerifier: window closed");
        require(msg.value >= minStake, "PhotonicVerifier: below min stake");
        require(stakes[bpdId][msg.sender].amount == 0, "PhotonicVerifier: already staked");
        require(msg.sender != record.provider, "PhotonicVerifier: provider cannot self-verify");

        stakes[bpdId][msg.sender] = VerifierStake({
            amount: msg.value,
            submittedHash: submittedHash,
            matched: false,
            claimed: false
        });

        verifierList[bpdId].push(msg.sender);
        record.stakedTotal += msg.value;
        record.verifierCount++;

        emit VerifierStaked(bpdId, msg.sender, msg.value, submittedHash);
    }

    /// @notice Resolve a BPD after the verification window closes
    function resolveBPD(bytes32 bpdId) external nonReentrant {
        BPDRecord storage record = bpdRecords[bpdId];
        require(record.createdAt > 0, "PhotonicVerifier: BPD not found");
        require(record.status == VerificationStatus.Pending, "PhotonicVerifier: already resolved");
        require(block.timestamp >= record.createdAt + verificationWindow, "PhotonicVerifier: window still open");

        if (record.verifierCount == 0) {
            record.status = VerificationStatus.Consensus;
            record.resolvedAt = uint64(block.timestamp);
            emit BPDResolved(bpdId, record.status, 0, 0);
            return;
        }

        // Count verifiers that match the provider's BPD hash
        uint256 matchCount = 0;
        address[] storage verifiers = verifierList[bpdId];
        for (uint256 i = 0; i < verifiers.length; i++) {
            VerifierStake storage s = stakes[bpdId][verifiers[i]];
            if (s.submittedHash == record.bpdHash) {
                s.matched = true;
                matchCount++;
            }
        }

        record.consensusCount = matchCount;
        uint256 matchPct = (matchCount * 100) / record.verifierCount;

        record.status = matchPct >= consensusThreshold
            ? VerificationStatus.Consensus
            : VerificationStatus.Disputed;
        record.resolvedAt = uint64(block.timestamp);

        emit BPDResolved(bpdId, record.status, matchCount, record.verifierCount);
    }

    /// @notice Claim rewards (matching verifiers) or settle slashes (mismatching verifiers)
    function claimReward(bytes32 bpdId) external nonReentrant {
        BPDRecord storage record = bpdRecords[bpdId];
        require(record.status != VerificationStatus.Pending, "PhotonicVerifier: not resolved");

        VerifierStake storage stake = stakes[bpdId][msg.sender];
        require(stake.amount > 0, "PhotonicVerifier: no stake");
        require(!stake.claimed, "PhotonicVerifier: already claimed");

        stake.claimed = true;

        if (record.status == VerificationStatus.Consensus && stake.matched) {
            // Matching verifiers get stake back + share of verifier reward pool
            uint256 rewardPool = (record.deliveryFee * verifierRewardBps) / 10000;
            uint256 share = rewardPool / record.consensusCount;
            uint256 payout = stake.amount + share;
            (bool ok,) = msg.sender.call{value: payout}("");
            require(ok, "PhotonicVerifier: transfer failed");
            verifierReputation[msg.sender]++;
            emit RewardClaimed(bpdId, msg.sender, payout);
        } else {
            // Non-matching verifiers are slashed — stake goes to provider
            totalSlashed[msg.sender] += stake.amount;
            (bool ok,) = record.provider.call{value: stake.amount}("");
            require(ok, "PhotonicVerifier: slash transfer failed");
            emit SlashExecuted(bpdId, msg.sender, stake.amount);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Admin
    // ─────────────────────────────────────────────────────────────────────

    function setMinStake(uint256 _min) external onlyOwner { minStake = _min; }
    function setVerificationWindow(uint256 _window) external onlyOwner { verificationWindow = _window; }
    function setConsensusThreshold(uint256 _pct) external onlyOwner {
        require(_pct <= 100, "invalid");
        consensusThreshold = _pct;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Views
    // ─────────────────────────────────────────────────────────────────────

    function getBPDRecord(bytes32 bpdId) external view returns (BPDRecord memory) {
        return bpdRecords[bpdId];
    }

    function getVerifiers(bytes32 bpdId) external view returns (address[] memory) {
        return verifierList[bpdId];
    }

    function getStake(bytes32 bpdId, address verifier) external view returns (VerifierStake memory) {
        return stakes[bpdId][verifier];
    }

    function totalBPDs() external view returns (uint256) {
        return allBpdIds.length;
    }
}
