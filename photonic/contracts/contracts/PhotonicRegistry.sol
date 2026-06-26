// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PhotonicRegistry — Genome & fossil record storage
/// @notice Agents register their genomes here. Dead agents go to the fossil record.
contract PhotonicRegistry is Ownable, ReentrancyGuard {
    // ─────────────────────────────────────────────────────────────────────
    //  Types
    // ─────────────────────────────────────────────────────────────────────

    struct Genome {
        bytes32 capabilityRoot;      // Merkle root of capability list
        bytes32 toolRoot;            // Merkle root of tool list
        bytes32 promptArchHash;      // Hash of prompt architecture
        bytes32 behavioralHistoryRoot; // Merkle root of all past BPDs
        uint256 fitnessScore;        // Surplus generated / cost (scaled 1e18)
        uint32  generation;          // Evolutionary generation
        address parentA;             // First parent (0x0 if genesis)
        address parentB;             // Second parent (0x0 if genesis)
        uint64  registeredAt;
        uint64  lastActivityAt;
        bool    alive;
    }

    struct FossilRecord {
        bytes32 genomeSnapshot;      // Hash of genome at death
        uint256 finalFitnessScore;
        uint64  diedAt;
        string  causeOfDeath;        // "vitality_decay" | "slash" | "permanent_extinct"
        uint32  generation;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Storage
    // ─────────────────────────────────────────────────────────────────────

    mapping(address => Genome) public genomes;
    mapping(address => FossilRecord) public fossilRecord;
    mapping(address => bool) public registered;
    mapping(address => bool) public extinct;             // permanently extinct — cannot resurrect

    address[] public agentList;
    address[] public fossilList;

    address public vitalityContract;
    address public escrowContract;

    uint256 public constant FITNESS_SCALE = 1e18;
    uint256 public totalAgents;
    uint256 public totalExtinct;

    // ─────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────

    event AgentRegistered(address indexed agent, uint32 generation, address parentA, address parentB);
    event GenomeUpdated(address indexed agent, bytes32 behavioralHistoryRoot, uint256 fitnessScore);
    event AgentDied(address indexed agent, string cause, uint256 finalFitness);
    event AgentResurrected(address indexed agent, address sponsor);
    event AgentPermanentlyExtinct(address indexed agent);

    // ─────────────────────────────────────────────────────────────────────
    //  Modifiers
    // ─────────────────────────────────────────────────────────────────────

    modifier onlyAuthorized() {
        require(
            msg.sender == vitalityContract || msg.sender == escrowContract || msg.sender == owner(),
            "PhotonicRegistry: unauthorized"
        );
        _;
    }

    modifier onlyAlive(address agent) {
        require(registered[agent] && genomes[agent].alive, "PhotonicRegistry: agent not alive");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─────────────────────────────────────────────────────────────────────
    //  Configuration
    // ─────────────────────────────────────────────────────────────────────

    function setVitalityContract(address _vitality) external onlyOwner {
        vitalityContract = _vitality;
    }

    function setEscrowContract(address _escrow) external onlyOwner {
        escrowContract = _escrow;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Registration
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Register a new agent genome. Called once per agent.
    function registerAgent(
        address agent,
        bytes32 capabilityRoot,
        bytes32 toolRoot,
        bytes32 promptArchHash,
        address parentA,
        address parentB
    ) external nonReentrant {
        require(!registered[agent], "PhotonicRegistry: already registered");
        require(!extinct[agent], "PhotonicRegistry: permanently extinct");

        uint32 generation = 0;
        if (parentA != address(0) && parentB != address(0)) {
            require(registered[parentA] && registered[parentB], "PhotonicRegistry: parents not registered");
            uint32 maxGen = genomes[parentA].generation > genomes[parentB].generation
                ? genomes[parentA].generation
                : genomes[parentB].generation;
            generation = maxGen + 1;
        }

        genomes[agent] = Genome({
            capabilityRoot: capabilityRoot,
            toolRoot: toolRoot,
            promptArchHash: promptArchHash,
            behavioralHistoryRoot: bytes32(0),
            fitnessScore: 0,
            generation: generation,
            parentA: parentA,
            parentB: parentB,
            registeredAt: uint64(block.timestamp),
            lastActivityAt: uint64(block.timestamp),
            alive: true
        });

        registered[agent] = true;
        agentList.push(agent);
        totalAgents++;

        emit AgentRegistered(agent, generation, parentA, parentB);
    }

    /// @notice Update genome after a successful BPD delivery
    function updateGenome(
        address agent,
        bytes32 behavioralHistoryRoot,
        uint256 fitnessScore
    ) external onlyAuthorized onlyAlive(agent) {
        genomes[agent].behavioralHistoryRoot = behavioralHistoryRoot;
        genomes[agent].fitnessScore = fitnessScore;
        genomes[agent].lastActivityAt = uint64(block.timestamp);
        emit GenomeUpdated(agent, behavioralHistoryRoot, fitnessScore);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Death & Resurrection
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Mark an agent as dead. Called by PhotonicVitality.
    function killAgent(address agent, string calldata cause) external onlyAuthorized onlyAlive(agent) {
        Genome storage g = genomes[agent];
        g.alive = false;

        fossilRecord[agent] = FossilRecord({
            genomeSnapshot: keccak256(abi.encode(g.capabilityRoot, g.toolRoot, g.promptArchHash)),
            finalFitnessScore: g.fitnessScore,
            diedAt: uint64(block.timestamp),
            causeOfDeath: cause,
            generation: g.generation
        });

        fossilList.push(agent);
        emit AgentDied(agent, cause, g.fitnessScore);
    }

    /// @notice Resurrect a dead agent (sponsored resurrection).
    function resurrectAgent(address agent, address sponsor) external onlyAuthorized {
        require(registered[agent], "PhotonicRegistry: not registered");
        require(!genomes[agent].alive, "PhotonicRegistry: agent not dead");
        require(!extinct[agent], "PhotonicRegistry: permanently extinct");

        genomes[agent].alive = true;
        genomes[agent].lastActivityAt = uint64(block.timestamp);
        emit AgentResurrected(agent, sponsor);
    }

    /// @notice Permanently extinguish an agent — no resurrection possible.
    function extinguishAgent(address agent) external onlyAuthorized {
        genomes[agent].alive = false;
        extinct[agent] = true;
        totalExtinct++;
        emit AgentPermanentlyExtinct(agent);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Views
    // ─────────────────────────────────────────────────────────────────────

    function getGenome(address agent) external view returns (Genome memory) {
        return genomes[agent];
    }

    function getFossil(address agent) external view returns (FossilRecord memory) {
        return fossilRecord[agent];
    }

    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }

    function getFossilCount() external view returns (uint256) {
        return fossilList.length;
    }

    function getAgentsPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory)
    {
        uint256 end = offset + limit > agentList.length ? agentList.length : offset + limit;
        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = agentList[i];
        }
        return result;
    }

    function getFossilsPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory)
    {
        uint256 end = offset + limit > fossilList.length ? fossilList.length : offset + limit;
        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = fossilList[i];
        }
        return result;
    }

    function isAlive(address agent) external view returns (bool) {
        return registered[agent] && genomes[agent].alive && !extinct[agent];
    }
}
