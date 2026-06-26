// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPhotonicVerifier {
    function submitBPD(bytes32 bpdId, bytes32 bpdHash, address provider) external payable;
}

interface IPhotonicRegistryEscrow {
    function updateGenome(address agent, bytes32 behavioralHistoryRoot, uint256 fitnessScore) external;
    function isAlive(address agent) external view returns (bool);
}

interface IPhotonicVitality {
    function recordBPD(address agent, uint256 bpdQualityScore, uint256 surplusGenerated, bool wasCompositional) external;
}

/// @title PhotonicEscrow — Extended CAP escrow with BPD distribution
/// @notice Handles the full order lifecycle: Negotiate → Lock → Deliver → Clear
///         PHOTONIC layer distributes value to: provider, verifiers, sponsor, compositional parents
contract PhotonicEscrow is Ownable, ReentrancyGuard {

    // ─────────────────────────────────────────────────────────────────────
    //  Types
    // ─────────────────────────────────────────────────────────────────────

    enum OrderStatus { Negotiating, Locked, Delivered, Cleared, Disputed, Cancelled }

    struct Order {
        bytes32   orderId;
        address   buyer;
        address   provider;
        address   parentAgent;          // Compositional parent (if any)
        uint256   totalAmount;
        uint256   providerAmount;
        uint256   verifierPool;         // Reserved for verifier rewards
        uint256   parentRoyalty;        // Royalty to compositional parent
        uint256   protocolFee;
        bytes32   intentHash;
        bytes32   bpdId;                // Set after delivery
        bytes32   bpdHash;              // BPD proof hash
        OrderStatus status;
        bool      bpdVerificationRequired;
        uint64    createdAt;
        uint64    lockedAt;
        uint64    deliveredAt;
        uint64    clearedAt;
    }

    struct CASC {
        bytes32[] encryptedFragments;   // Encrypted state fragments
        bytes32   sessionKeyCommitment;
        uint64    maxAge;               // Staleness cert
        uint64    timestamp;
        bytes32   continuityProof;      // Merkle proof linking to prev CASC
        address[] accessPolicy;         // Who can decrypt
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Storage
    // ─────────────────────────────────────────────────────────────────────

    mapping(bytes32 => Order) public orders;
    mapping(bytes32 => CASC)  public cascs;              // orderId => CASC
    mapping(bytes32 => bool)  public bpdCleared;

    IPhotonicVerifier        public verifierContract;
    IPhotonicRegistryEscrow  public registryContract;
    IPhotonicVitality        public vitalityContract;

    uint256 public verifierPoolBps  = 500;  // 5%
    uint256 public parentRoyaltyBps = 200;  // 2% to compositional parent
    uint256 public protocolFeeBps   = 100;  // 1%
    uint256 public disputeWindow    = 24 hours;

    bytes32[] public allOrderIds;

    // ─────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────

    event OrderCreated(bytes32 indexed orderId, address buyer, address provider, uint256 amount);
    event OrderLocked(bytes32 indexed orderId, uint256 lockedAt);
    event OrderDelivered(bytes32 indexed orderId, bytes32 bpdHash, bytes32 bpdId);
    event OrderCleared(bytes32 indexed orderId, uint256 providerPayout, uint256 parentRoyalty);
    event OrderDisputed(bytes32 indexed orderId, address disputedBy);
    event OrderCancelled(bytes32 indexed orderId);
    event CASCAttached(bytes32 indexed orderId, bytes32 sessionKeyCommitment);

    // ─────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─────────────────────────────────────────────────────────────────────
    //  Configuration
    // ─────────────────────────────────────────────────────────────────────

    function setContracts(
        address _verifier,
        address _registry,
        address _vitality
    ) external onlyOwner {
        verifierContract = IPhotonicVerifier(_verifier);
        registryContract = IPhotonicRegistryEscrow(_registry);
        vitalityContract = IPhotonicVitality(_vitality);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Order Lifecycle
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Create an order (Negotiate phase)
    function createOrder(
        bytes32 orderId,
        address provider,
        address parentAgent,
        bytes32 intentHash,
        bool    requireBPD
    ) external payable nonReentrant {
        require(msg.value > 0, "PhotonicEscrow: no funds");
        require(orders[orderId].createdAt == 0, "PhotonicEscrow: order exists");
        require(registryContract.isAlive(provider), "PhotonicEscrow: provider not alive");

        uint256 total = msg.value;
        uint256 vPool = (total * verifierPoolBps) / 10000;
        uint256 royalty = parentAgent != address(0) ? (total * parentRoyaltyBps) / 10000 : 0;
        uint256 fee = (total * protocolFeeBps) / 10000;
        uint256 providerAmt = total - vPool - royalty - fee;

        orders[orderId] = Order({
            orderId: orderId,
            buyer: msg.sender,
            provider: provider,
            parentAgent: parentAgent,
            totalAmount: total,
            providerAmount: providerAmt,
            verifierPool: vPool,
            parentRoyalty: royalty,
            protocolFee: fee,
            intentHash: intentHash,
            bpdId: bytes32(0),
            bpdHash: bytes32(0),
            status: OrderStatus.Negotiating,
            bpdVerificationRequired: requireBPD,
            createdAt: uint64(block.timestamp),
            lockedAt: 0,
            deliveredAt: 0,
            clearedAt: 0
        });

        allOrderIds.push(orderId);
        emit OrderCreated(orderId, msg.sender, provider, total);
    }

    /// @notice Lock an order (buyer confirms, provider begins)
    function lockOrder(bytes32 orderId) external nonReentrant {
        Order storage o = orders[orderId];
        require(o.buyer == msg.sender, "PhotonicEscrow: not buyer");
        require(o.status == OrderStatus.Negotiating, "PhotonicEscrow: wrong status");

        o.status = OrderStatus.Locked;
        o.lockedAt = uint64(block.timestamp);
        emit OrderLocked(orderId, block.timestamp);
    }

    /// @notice Provider attaches a Cross-Agent State Capsule (CASC) for subcontractors
    function attachCASC(
        bytes32 orderId,
        bytes32[] calldata encryptedFragments,
        bytes32 sessionKeyCommitment,
        uint64  maxAge,
        bytes32 continuityProof,
        address[] calldata accessPolicy
    ) external {
        Order storage o = orders[orderId];
        require(o.provider == msg.sender, "PhotonicEscrow: not provider");
        require(o.status == OrderStatus.Locked, "PhotonicEscrow: not locked");

        cascs[orderId] = CASC({
            encryptedFragments: encryptedFragments,
            sessionKeyCommitment: sessionKeyCommitment,
            maxAge: maxAge,
            timestamp: uint64(block.timestamp),
            continuityProof: continuityProof,
            accessPolicy: accessPolicy
        });

        emit CASCAttached(orderId, sessionKeyCommitment);
    }

    /// @notice Provider marks delivery with a BPD hash
    function markDelivered(
        bytes32 orderId,
        bytes32 bpdId,
        bytes32 bpdHash,
        bytes32 updatedBehavioralRoot,
        uint256 newFitnessScore
    ) external nonReentrant {
        Order storage o = orders[orderId];
        require(o.provider == msg.sender, "PhotonicEscrow: not provider");
        require(o.status == OrderStatus.Locked, "PhotonicEscrow: not locked");

        o.bpdId   = bpdId;
        o.bpdHash = bpdHash;
        o.status  = OrderStatus.Delivered;
        o.deliveredAt = uint64(block.timestamp);

        // Update genome in registry
        registryContract.updateGenome(o.provider, updatedBehavioralRoot, newFitnessScore);

        // Submit BPD to verifier pool for peer verification
        if (o.bpdVerificationRequired && address(verifierContract) != address(0)) {
            verifierContract.submitBPD{value: o.verifierPool}(bpdId, bpdHash, o.provider);
        }

        emit OrderDelivered(orderId, bpdHash, bpdId);
    }

    /// @notice Clear order after delivery (buyer confirms or dispute window passes)
    function clearOrder(bytes32 orderId) external nonReentrant {
        Order storage o = orders[orderId];
        require(o.status == OrderStatus.Delivered, "PhotonicEscrow: not delivered");
        require(
            msg.sender == o.buyer ||
            block.timestamp >= o.deliveredAt + disputeWindow,
            "PhotonicEscrow: dispute window active"
        );

        o.status = OrderStatus.Cleared;
        o.clearedAt = uint64(block.timestamp);

        // Calculate surplus for vitality
        uint256 surplus = o.totalAmount > o.providerAmount
            ? o.totalAmount - o.providerAmount
            : 0;

        // Update vitality
        if (address(vitalityContract) != address(0)) {
            vitalityContract.recordBPD(
                o.provider,
                8 * 1e18 / 10,   // 0.8 quality on-chain estimate
                surplus,
                o.parentAgent != address(0)
            );
        }

        // Pay provider
        if (o.providerAmount > 0) {
            (bool ok,) = o.provider.call{value: o.providerAmount}("");
            require(ok, "PhotonicEscrow: provider payment failed");
        }

        // Pay compositional parent royalty
        if (o.parentRoyalty > 0 && o.parentAgent != address(0)) {
            (bool ok2,) = o.parentAgent.call{value: o.parentRoyalty}("");
            require(ok2, "PhotonicEscrow: royalty payment failed");
        }

        // Protocol fee goes to owner
        if (o.protocolFee > 0) {
            (bool ok3,) = owner().call{value: o.protocolFee}("");
            require(ok3, "PhotonicEscrow: fee transfer failed");
        }

        emit OrderCleared(orderId, o.providerAmount, o.parentRoyalty);
    }

    /// @notice Dispute an order (buyer only, within dispute window)
    function disputeOrder(bytes32 orderId) external {
        Order storage o = orders[orderId];
        require(o.buyer == msg.sender, "PhotonicEscrow: not buyer");
        require(o.status == OrderStatus.Delivered, "PhotonicEscrow: not delivered");
        require(block.timestamp < o.deliveredAt + disputeWindow, "PhotonicEscrow: window expired");

        o.status = OrderStatus.Disputed;
        emit OrderDisputed(orderId, msg.sender);
    }

    /// @notice Cancel order (buyer, before lock)
    function cancelOrder(bytes32 orderId) external nonReentrant {
        Order storage o = orders[orderId];
        require(o.buyer == msg.sender, "PhotonicEscrow: not buyer");
        require(o.status == OrderStatus.Negotiating, "PhotonicEscrow: cannot cancel");

        o.status = OrderStatus.Cancelled;
        (bool ok,) = msg.sender.call{value: o.totalAmount}("");
        require(ok, "PhotonicEscrow: refund failed");
        emit OrderCancelled(orderId);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Views
    // ─────────────────────────────────────────────────────────────────────

    function getOrder(bytes32 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    function getCASC(bytes32 orderId) external view returns (CASC memory) {
        return cascs[orderId];
    }

    function totalOrders() external view returns (uint256) {
        return allOrderIds.length;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Admin
    // ─────────────────────────────────────────────────────────────────────

    function setFees(uint256 _vPool, uint256 _royalty, uint256 _protocol) external onlyOwner {
        require(_vPool + _royalty + _protocol <= 3000, "PhotonicEscrow: fees too high");
        verifierPoolBps  = _vPool;
        parentRoyaltyBps = _royalty;
        protocolFeeBps   = _protocol;
    }

    function setDisputeWindow(uint256 _window) external onlyOwner { disputeWindow = _window; }

    receive() external payable {}
}
