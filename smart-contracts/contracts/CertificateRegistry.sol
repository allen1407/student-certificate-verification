// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CertificateRegistry
/// @notice Tamper-evident registry of academic certificate document hashes.
/// @dev The registry proves that an authorised issuer registered a given
///      SHA-256 document hash under a given certificate ID, and whether that
///      certificate has since been revoked. It does not prove that the content
///      of the certificate is true. No personal data is stored on-chain.
///
///      Issuer deactivation policy:
///        - Retired (trustRevoked = false): the address can no longer issue or
///          revoke. Certificates it issued while active still verify as VALID.
///          Used for planned key rotation or an institution leaving.
///        - Trust revoked (trustRevoked = true): as above, and every certificate
///          the address ever issued verifies as ISSUER_UNTRUSTED. Used when the
///          key is compromised or the institution is found to be illegitimate.
///        A deactivated address can never be re-added; the institution must
///        be onboarded with a new address.
contract CertificateRegistry {
    enum VerificationStatus {
        NOT_FOUND,
        HASH_MISMATCH,
        REVOKED,
        ISSUER_UNTRUSTED,
        VALID
    }

    struct Issuer {
        string name;
        bool active;
        bool trustRevoked;
        uint64 addedAt;
        uint64 deactivatedAt;
    }

    struct Certificate {
        bytes32 documentHash;
        address issuer;
        uint64 issuedAt;
        uint64 revokedAt; // 0 while not revoked
        uint64 awardDate; // unix timestamp (UTC midnight of the award date)
        string certificateType;
    }

    uint256 public constant MAX_NAME_LENGTH = 100;
    uint256 public constant MAX_TYPE_LENGTH = 100;
    uint256 public constant MAX_REASON_LENGTH = 200;

    address public admin;
    address public pendingAdmin;

    mapping(address => Issuer) private _issuers;
    mapping(bytes32 => Certificate) private _certificates;
    mapping(bytes32 => bytes32) public certificateIdByHash;

    event AdminTransferStarted(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event IssuerAdded(address indexed issuer, string name, address indexed addedBy);
    event IssuerDeactivated(address indexed issuer, bool trustRevoked, address indexed deactivatedBy);
    event CertificateIssued(
        bytes32 indexed certificateId,
        address indexed issuer,
        bytes32 indexed documentHash,
        string certificateType,
        uint64 awardDate
    );
    event CertificateRevoked(bytes32 indexed certificateId, address indexed revokedBy, string reason);

    error NotAdmin();
    error NotPendingAdmin();
    error ZeroAddress();
    error InvalidName();
    error IssuerAlreadyRegistered(address issuer);
    error IssuerNotActive(address issuer);
    error InvalidCertificateId();
    error InvalidDocumentHash();
    error InvalidCertificateType();
    error InvalidAwardDate();
    error InvalidReason();
    error CertificateAlreadyExists(bytes32 certificateId);
    error DocumentAlreadyRegistered(bytes32 documentHash, bytes32 certificateId);
    error CertificateNotFound(bytes32 certificateId);
    error CertificateAlreadyRevoked(bytes32 certificateId);
    error NotAuthorizedToRevoke();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyActiveIssuer() {
        if (!_issuers[msg.sender].active) revert IssuerNotActive(msg.sender);
        _;
    }

    constructor() {
        admin = msg.sender;
        emit AdminTransferred(address(0), msg.sender);
    }

    // ---------------------------------------------------------------------
    // Administration
    // ---------------------------------------------------------------------

    /// @notice Step 1 of a two-step admin transfer. Passing address(0) cancels.
    function transferAdmin(address newAdmin) external onlyAdmin {
        pendingAdmin = newAdmin;
        emit AdminTransferStarted(msg.sender, newAdmin);
    }

    /// @notice Step 2: the nominated address accepts the admin role.
    function acceptAdmin() external {
        if (msg.sender != pendingAdmin || msg.sender == address(0)) revert NotPendingAdmin();
        address previous = admin;
        admin = msg.sender;
        pendingAdmin = address(0);
        emit AdminTransferred(previous, msg.sender);
    }

    function addIssuer(address issuer, string calldata name) external onlyAdmin {
        if (issuer == address(0)) revert ZeroAddress();
        uint256 nameLength = bytes(name).length;
        if (nameLength == 0 || nameLength > MAX_NAME_LENGTH) revert InvalidName();
        if (_issuers[issuer].addedAt != 0) revert IssuerAlreadyRegistered(issuer);

        _issuers[issuer] = Issuer({
            name: name,
            active: true,
            trustRevoked: false,
            addedAt: uint64(block.timestamp),
            deactivatedAt: 0
        });
        emit IssuerAdded(issuer, name, msg.sender);
    }

    /// @param trustRevoked true if certificates already issued by this address
    ///        must stop verifying (e.g. key compromise). See contract notes.
    function deactivateIssuer(address issuer, bool trustRevoked) external onlyAdmin {
        Issuer storage record = _issuers[issuer];
        if (!record.active) revert IssuerNotActive(issuer);

        record.active = false;
        record.trustRevoked = trustRevoked;
        record.deactivatedAt = uint64(block.timestamp);
        emit IssuerDeactivated(issuer, trustRevoked, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Issuance and revocation
    // ---------------------------------------------------------------------

    /// @param certificateId Random 32-byte identifier chosen by the issuer.
    /// @param documentHash  SHA-256 of the exact bytes of the final certificate file.
    /// @param certificateType Qualification name, e.g. "B.E. Computer Engineering".
    /// @param awardDate Unix timestamp of the award date; must not be in the future.
    function issueCertificate(
        bytes32 certificateId,
        bytes32 documentHash,
        string calldata certificateType,
        uint64 awardDate
    ) external onlyActiveIssuer {
        if (certificateId == bytes32(0)) revert InvalidCertificateId();
        if (documentHash == bytes32(0)) revert InvalidDocumentHash();
        uint256 typeLength = bytes(certificateType).length;
        if (typeLength == 0 || typeLength > MAX_TYPE_LENGTH) revert InvalidCertificateType();
        if (awardDate == 0 || awardDate > block.timestamp) revert InvalidAwardDate();
        if (_certificates[certificateId].issuedAt != 0) revert CertificateAlreadyExists(certificateId);
        bytes32 existing = certificateIdByHash[documentHash];
        if (existing != bytes32(0)) revert DocumentAlreadyRegistered(documentHash, existing);

        _certificates[certificateId] = Certificate({
            documentHash: documentHash,
            issuer: msg.sender,
            issuedAt: uint64(block.timestamp),
            revokedAt: 0,
            awardDate: awardDate,
            certificateType: certificateType
        });
        certificateIdByHash[documentHash] = certificateId;

        emit CertificateIssued(certificateId, msg.sender, documentHash, certificateType, awardDate);
    }

    /// @notice Revocation policy: the admin may revoke any certificate; an
    ///         active issuer may revoke only certificates it issued itself.
    ///         The original record is kept; only `revokedAt` is set.
    function revokeCertificate(bytes32 certificateId, string calldata reason) external {
        Certificate storage cert = _certificates[certificateId];
        if (cert.issuedAt == 0) revert CertificateNotFound(certificateId);
        if (cert.revokedAt != 0) revert CertificateAlreadyRevoked(certificateId);
        bool isOwnActiveIssuer = cert.issuer == msg.sender && _issuers[msg.sender].active;
        if (msg.sender != admin && !isOwnActiveIssuer) revert NotAuthorizedToRevoke();
        uint256 reasonLength = bytes(reason).length;
        if (reasonLength == 0 || reasonLength > MAX_REASON_LENGTH) revert InvalidReason();

        cert.revokedAt = uint64(block.timestamp);
        emit CertificateRevoked(certificateId, msg.sender, reason);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getIssuer(address issuer) external view returns (Issuer memory) {
        return _issuers[issuer];
    }

    function isActiveIssuer(address issuer) external view returns (bool) {
        return _issuers[issuer].active;
    }

    /// @notice Returns the stored record; `issuedAt == 0` means it does not exist.
    function getCertificate(bytes32 certificateId) external view returns (Certificate memory) {
        return _certificates[certificateId];
    }

    /// @notice Full verification of a document against a certificate ID.
    /// @dev Status precedence: NOT_FOUND, HASH_MISMATCH, REVOKED, ISSUER_UNTRUSTED, VALID.
    function verify(bytes32 certificateId, bytes32 documentHash)
        public
        view
        returns (VerificationStatus status, Certificate memory cert, Issuer memory issuer)
    {
        cert = _certificates[certificateId];
        if (cert.issuedAt == 0) {
            return (VerificationStatus.NOT_FOUND, cert, issuer);
        }
        issuer = _issuers[cert.issuer];
        if (cert.documentHash != documentHash) {
            status = VerificationStatus.HASH_MISMATCH;
        } else if (cert.revokedAt != 0) {
            status = VerificationStatus.REVOKED;
        } else if (issuer.trustRevoked) {
            status = VerificationStatus.ISSUER_UNTRUSTED;
        } else {
            status = VerificationStatus.VALID;
        }
    }

    /// @notice Verification when only the document is available (no ID).
    function verifyByHash(bytes32 documentHash)
        external
        view
        returns (VerificationStatus status, bytes32 certificateId, Certificate memory cert, Issuer memory issuer)
    {
        certificateId = certificateIdByHash[documentHash];
        (status, cert, issuer) = verify(certificateId, documentHash);
    }
}
