// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPhotonicRegistry {
    function killAgent(address agent, string calldata cause) external;
    function resurrectAgent(address agent, address sponsor) external;
    function extinguishAgent(address agent) external;
    function isAlive(address agent) external view returns (bool);
    function updateGenome(address agent, bytes32 behavioralHistoryRoot, uint256 fitnessScore) external;
}

/// @title PhotonicVitality — Death and Resurrection Protocol (DRP)
/// @notice Tracks agent vitality scores, executes death, manages resurrection bonds.
///
///  dV/dt = -λ*(1 - BPD_rate) + μ*surplus_generated
///
///  V(t) = α*BPD_quality + β*compositional_success + γ*surplus_rate
///         + δ*diversity_contribution + ε*resurrection_vouches
///  Weights: α=0.30, β=0.25, γ=0.25, δ=0.10, ε=0.10
contract PhotonicVitality is Ownable, ReentrancyGuard {

    // ─────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────

    uint256 public constant SCALE = 1e18;
    uint256 public constant ALPHA = 30;   // BPD quality weight (%)
    uint256 public constant BETA  = 25;   // compositional success weight
    uint256 public constant GAMMA = 25;   // surplus rate weight
    uint256 public constant DELTA = 10;   // diversity contribution weight
    uint256 public constant EPSILON = 10; // resurrection vouches weight

    uint256 public constant V_MIN_GENESIS = 20;   // Θ_min at genesis (%)
    uint256 public constant V_MAX_MATURE  = 85;   // Θ_max at maturity (%)

    // Resurrection window: agent must generate 3 BPDs in 48h after resurrection
    uint256 public constant RESURRECTION_WINDOW = 48 hours;
    uint256 public constant RESURRECTION_BPD_REQUIRED = 3;

    // ─────────────────────────────────────────────────────────────────────
    //  Types
    // ─────────────────────────────────────────────────────────────────────

    struct VitalityState {
        uint256 vitality;                // Current vitality (scaled SCALE, max SCALE)
        uint256 bpdQualityAccum;         // Accumulated BPD quality points
        uint256 compositionalSuccesses;  // # of successful compositional workflows
        uint256 surplusAccum;            // Total surplus generated (wei)
        uint256 diversityScore;          // Set externally by oracle
        uint256 resurrectionVouches;     // # of successful resurrection vouches given
        uint256 totalBPDs;               // Lifetime BPD count
        uint256 totalDeliveries;         // Lifetime delivery count
        uint64  lastDecayAt;             // Last time decay was applied
        bool    inResurrectionTrial;
        uint64  resurrectionTrialStart;
        uint256 resurrectionBPDCount;    // BPDs since resurrection started
        address resurrectionSponsor;
    }

    struct ResurrectionBond {
        address sponsor;
        address agent;
        uint256 bondAmount;
        uint64  bondedAt;
        bool    active;
        bool    slashed;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Storage
    // ─────────────────────────────────────────────────────────────────────

    mapping(address => VitalityState) public vitality;
    mapping(address => ResurrectionBond) public resurrectBonds;

    IPhotonicRegistry public registry;
    uint256 public marketplaceMaturity;   // 0–SCALE, set by oracle/governance
    uint256 public minResurrectionBond = 0.01 ether;
    uint256 public decayInterval = 1 days;
    uint256 public lambdaDecay = 5;       // 5% decay per interval if no BPDs
    uint256 public muSurplus  = 3;        // 3% vitality boost per unit surplus

    // ─────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────

    event VitalityUpdated(address indexed agent, uint256 newVitality, uint256 totalBPDs);
    event VitalityDecayed(address indexed agent, uint256 decayAmount, uint256 newVitality);
    event AgentKilled(address indexed agent, uint256 finalVitality, uint256 threshold);
    event ResurrectionBonded(address indexed agent, address indexed sponsor, uint256 bond);
    event ResurrectionSucceeded(address indexed agent, address indexed sponsor);
    event ResurrectionFailed(address indexed agent, address indexed sponsor, uint256 slashed);

    // ─────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────

    constructor(address _registry) Ownable(msg.sender) {
        registry = IPhotonicRegistry(_registry);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Vitality Updates (called by escrow after BPD delivery)
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Record a successful BPD delivery. Boosts vitality.
    function recordBPD(
        address agent,
        uint256 bpdQualityScore,   // 0–SCALE
        uint256 surplusGenerated,  // wei
        bool    wasCompositional
    ) external onlyOwner {
        VitalityState storage v = vitality[agent];
        _applyDecay(agent);

        v.bpdQualityAccum += bpdQualityScore;
        v.totalBPDs++;
        v.totalDeliveries++;
        if (surplusGenerated > 0) v.surplusAccum += surplusGenerated;
        if (wasCompositional) v.compositionalSuccesses++;

        if (v.inResurrectionTrial) {
            v.resurrectionBPDCount++;
            if (v.resurrectionBPDCount >= RESURRECTION_BPD_REQUIRED) {
                _completeResurrection(agent, true);
            }
        }

        uint256 newVitality = _computeVitality(agent);
        v.vitality = newVitality;

        emit VitalityUpdated(agent, newVitality, v.totalBPDs);
    }

    /// @notice Apply natural decay. Can be called by anyone (keeper bots).
    function applyDecay(address agent) external {
        _applyDecay(agent);
        uint256 newVitality = _computeVitality(agent);
        vitality[agent].vitality = newVitality;

        uint256 threshold = _dynamicThreshold();
        if (newVitality < threshold && registry.isAlive(agent)) {
            registry.killAgent(agent, "vitality_decay");
            emit AgentKilled(agent, newVitality, threshold);
        }

        emit VitalityDecayed(agent, 0, newVitality);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Resurrection
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Sponsor puts up a bond to resurrect a dead agent
    function postResurrectionBond(address agent) external payable nonReentrant {
        require(msg.value >= minResurrectionBond, "PhotonicVitality: bond too low");
        require(!registry.isAlive(agent), "PhotonicVitality: agent not dead");
        require(!resurrectBonds[agent].active, "PhotonicVitality: bond already active");

        resurrectBonds[agent] = ResurrectionBond({
            sponsor: msg.sender,
            agent: agent,
            bondAmount: msg.value,
            bondedAt: uint64(block.timestamp),
            active: true,
            slashed: false
        });

        VitalityState storage v = vitality[agent];
        v.inResurrectionTrial = true;
        v.resurrectionTrialStart = uint64(block.timestamp);
        v.resurrectionBPDCount = 0;
        v.resurrectionSponsor = msg.sender;
        v.vitality = SCALE / 4; // Start at 25% vitality

        registry.resurrectAgent(agent, msg.sender);

        emit ResurrectionBonded(agent, msg.sender, msg.value);
    }

    /// @notice Check if resurrection trial has failed (48h passed, not enough BPDs)
    function checkResurrectionExpiry(address agent) external nonReentrant {
        VitalityState storage v = vitality[agent];
        require(v.inResurrectionTrial, "PhotonicVitality: not in trial");
        require(
            block.timestamp >= v.resurrectionTrialStart + RESURRECTION_WINDOW,
            "PhotonicVitality: trial still active"
        );
        require(v.resurrectionBPDCount < RESURRECTION_BPD_REQUIRED, "PhotonicVitality: already succeeded");

        _completeResurrection(agent, false);
    }

    function _completeResurrection(address agent, bool succeeded) internal {
        VitalityState storage v = vitality[agent];
        ResurrectionBond storage bond = resurrectBonds[agent];

        v.inResurrectionTrial = false;
        bond.active = false;

        if (succeeded) {
            v.resurrectionVouches++;
            vitality[bond.sponsor].resurrectionVouches++;
            (bool ok,) = bond.sponsor.call{value: bond.bondAmount}("");
            require(ok, "PhotonicVitality: bond return failed");
            emit ResurrectionSucceeded(agent, bond.sponsor);
        } else {
            bond.slashed = true;
            registry.extinguishAgent(agent);
            // Bond is slashed — stays in contract (protocol treasury)
            emit ResurrectionFailed(agent, bond.sponsor, bond.bondAmount);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal Math
    // ─────────────────────────────────────────────────────────────────────

    function _applyDecay(address agent) internal {
        VitalityState storage v = vitality[agent];
        uint64 lastDecay = v.lastDecayAt;
        if (lastDecay == 0) {
            v.lastDecayAt = uint64(block.timestamp);
            return;
        }

        uint256 intervals = (block.timestamp - lastDecay) / decayInterval;
        if (intervals == 0) return;

        v.lastDecayAt = uint64(lastDecay + intervals * decayInterval);

        // Decay proportional to inactive intervals
        uint256 decayRate = lambdaDecay * intervals;
        if (decayRate > 100) decayRate = 100;
        uint256 decay = (v.vitality * decayRate) / 100;
        v.vitality = v.vitality > decay ? v.vitality - decay : 0;
    }

    /// @dev V(t) = α*BPD_quality + β*compositional + γ*surplus + δ*diversity + ε*vouches
    function _computeVitality(address agent) internal view returns (uint256) {
        VitalityState storage v = vitality[agent];
        if (v.totalDeliveries == 0) return SCALE / 4; // New agents start at 25%

        uint256 avgBpdQuality = v.bpdQualityAccum / v.totalDeliveries;
        if (avgBpdQuality > SCALE) avgBpdQuality = SCALE;

        uint256 compositionalScore = v.totalDeliveries > 0
            ? (v.compositionalSuccesses * SCALE / v.totalDeliveries)
            : 0;

        // Surplus rate: normalize to SCALE (1 ETH surplus = max score)
        uint256 surplusScore = v.surplusAccum > 1 ether
            ? SCALE
            : (v.surplusAccum * SCALE / 1 ether);

        uint256 diversityScore = v.diversityScore > SCALE ? SCALE : v.diversityScore;

        uint256 voucheScore = v.resurrectionVouches > 10
            ? SCALE
            : (v.resurrectionVouches * SCALE / 10);

        uint256 vt = (avgBpdQuality * ALPHA)
            + (compositionalScore * BETA)
            + (surplusScore * GAMMA)
            + (diversityScore * DELTA)
            + (voucheScore * EPSILON);

        return vt / 100;
    }

    /// @dev Θ(t) = Θ_min + (Θ_max - Θ_min) * M(t)
    function _dynamicThreshold() internal view returns (uint256) {
        uint256 maturity = marketplaceMaturity; // 0–SCALE
        uint256 thetaMin = V_MIN_GENESIS * SCALE / 100;
        uint256 thetaMax = V_MAX_MATURE * SCALE / 100;
        return thetaMin + ((thetaMax - thetaMin) * maturity / SCALE);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Views
    // ─────────────────────────────────────────────────────────────────────

    function getCurrentVitality(address agent) external view returns (uint256) {
        return vitality[agent].vitality;
    }

    function getDynamicThreshold() external view returns (uint256) {
        return _dynamicThreshold();
    }

    function isAboveThreshold(address agent) external view returns (bool) {
        return vitality[agent].vitality >= _dynamicThreshold();
    }

    function getVitalityState(address agent) external view returns (VitalityState memory) {
        return vitality[agent];
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Admin
    // ─────────────────────────────────────────────────────────────────────

    function setMarketplaceMaturity(uint256 maturity) external onlyOwner {
        require(maturity <= SCALE, "max SCALE");
        marketplaceMaturity = maturity;
    }

    function setMinResurrectionBond(uint256 _min) external onlyOwner { minResurrectionBond = _min; }
    function setDecayInterval(uint256 _interval) external onlyOwner { decayInterval = _interval; }
    function setDecayParams(uint256 _lambda, uint256 _mu) external onlyOwner {
        require(_lambda <= 50 && _mu <= 50, "unreasonable params");
        lambdaDecay = _lambda;
        muSurplus   = _mu;
    }

    function setAgentDiversityScore(address agent, uint256 score) external onlyOwner {
        require(score <= SCALE, "max SCALE");
        vitality[agent].diversityScore = score;
    }

    function withdrawSlashedBonds() external onlyOwner {
        (bool ok,) = owner().call{value: address(this).balance}("");
        require(ok, "transfer failed");
    }

    receive() external payable {}
}
