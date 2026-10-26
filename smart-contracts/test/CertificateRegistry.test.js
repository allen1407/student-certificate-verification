const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const hre = require("hardhat");

const { ethers } = hre;

const Status = { NOT_FOUND: 0n, HASH_MISMATCH: 1n, REVOKED: 2n, ISSUER_UNTRUSTED: 3n, VALID: 4n };
const ZERO = ethers.ZeroHash;

const randomId = () => ethers.hexlify(ethers.randomBytes(32));
const docHash = (text) => ethers.sha256(ethers.toUtf8Bytes(text));

describe("CertificateRegistry", function () {
  async function deployFixture() {
    const [admin, issuer, otherIssuer, outsider, newAdmin] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("CertificateRegistry");
    const registry = await Registry.deploy();
    await registry.addIssuer(issuer.address, "Fr. Conceicao Rodrigues College of Engineering");
    await registry.addIssuer(otherIssuer.address, "Other University");
    const awardDate = BigInt(await time.latest()) - 86400n;
    // One certificate is pre-issued by `issuer` for the tests that need it.
    const id = randomId();
    const hash = docHash("certificate-pdf-bytes");
    await registry.connect(issuer).issueCertificate(id, hash, "B.E. Computer Engineering", awardDate);
    return { registry, admin, issuer, otherIssuer, outsider, newAdmin, awardDate, id, hash };
  }

  describe("Deployment and administration", function () {
    it("sets the deployer as admin and emits AdminTransferred", async function () {
      const { registry, admin } = await loadFixture(deployFixture);
      expect(await registry.admin()).to.equal(admin.address);
      const events = await registry.queryFilter(registry.filters.AdminTransferred());
      expect(events[0].args).to.deep.equal([ZERO.slice(0, 42), admin.address]);
    });

    it("lets the admin add an issuer and emits IssuerAdded", async function () {
      const { registry, admin, outsider } = await loadFixture(deployFixture);
      await expect(registry.addIssuer(outsider.address, "New Institute"))
        .to.emit(registry, "IssuerAdded")
        .withArgs(outsider.address, "New Institute", admin.address);
      const info = await registry.getIssuer(outsider.address);
      expect(info.name).to.equal("New Institute");
      expect(info.active).to.equal(true);
      expect(info.addedAt).to.be.greaterThan(0n);
      expect(await registry.isActiveIssuer(outsider.address)).to.equal(true);
    });

    it("rejects the zero address, empty or overlong names and duplicates", async function () {
      const { registry, issuer, outsider } = await loadFixture(deployFixture);
      await expect(registry.addIssuer(ethers.ZeroAddress, "X")).to.be.revertedWithCustomError(registry, "ZeroAddress");
      await expect(registry.addIssuer(outsider.address, "")).to.be.revertedWithCustomError(registry, "InvalidName");
      await expect(registry.addIssuer(outsider.address, "a".repeat(101))).to.be.revertedWithCustomError(
        registry,
        "InvalidName"
      );
      await expect(registry.addIssuer(issuer.address, "Again"))
        .to.be.revertedWithCustomError(registry, "IssuerAlreadyRegistered")
        .withArgs(issuer.address);
    });

    it("does not let non-admins add or deactivate issuers", async function () {
      const { registry, issuer, outsider } = await loadFixture(deployFixture);
      await expect(registry.connect(outsider).addIssuer(outsider.address, "Self")).to.be.revertedWithCustomError(
        registry,
        "NotAdmin"
      );
      // An active issuer is not an admin either.
      await expect(registry.connect(issuer).addIssuer(outsider.address, "Friend")).to.be.revertedWithCustomError(
        registry,
        "NotAdmin"
      );
      await expect(registry.connect(issuer).deactivateIssuer(issuer.address, false)).to.be.revertedWithCustomError(
        registry,
        "NotAdmin"
      );
    });

    it("transfers admin in two steps and only to the nominated address", async function () {
      const { registry, admin, outsider, newAdmin } = await loadFixture(deployFixture);
      await expect(registry.connect(outsider).transferAdmin(outsider.address)).to.be.revertedWithCustomError(
        registry,
        "NotAdmin"
      );
      await expect(registry.transferAdmin(newAdmin.address))
        .to.emit(registry, "AdminTransferStarted")
        .withArgs(admin.address, newAdmin.address);
      expect(await registry.admin()).to.equal(admin.address);

      await expect(registry.connect(outsider).acceptAdmin()).to.be.revertedWithCustomError(registry, "NotPendingAdmin");
      await expect(registry.connect(newAdmin).acceptAdmin())
        .to.emit(registry, "AdminTransferred")
        .withArgs(admin.address, newAdmin.address);
      expect(await registry.admin()).to.equal(newAdmin.address);
      expect(await registry.pendingAdmin()).to.equal(ethers.ZeroAddress);

      // The old admin has lost its powers.
      await expect(registry.connect(admin).addIssuer(outsider.address, "X")).to.be.revertedWithCustomError(
        registry,
        "NotAdmin"
      );
    });

    it("can cancel a pending admin transfer", async function () {
      const { registry, newAdmin } = await loadFixture(deployFixture);
      await registry.transferAdmin(newAdmin.address);
      await registry.transferAdmin(ethers.ZeroAddress);
      await expect(registry.connect(newAdmin).acceptAdmin()).to.be.revertedWithCustomError(registry, "NotPendingAdmin");
    });
  });

  describe("Issuance", function () {
    it("lets an authorised issuer issue a certificate and emits CertificateIssued", async function () {
      const { registry, issuer, awardDate } = await loadFixture(deployFixture);
      const id = randomId();
      const hash = docHash("pdf");
      await expect(registry.connect(issuer).issueCertificate(id, hash, "B.E. IT", awardDate))
        .to.emit(registry, "CertificateIssued")
        .withArgs(id, issuer.address, hash, "B.E. IT", awardDate);

      const cert = await registry.getCertificate(id);
      expect(cert.documentHash).to.equal(hash);
      expect(cert.issuer).to.equal(issuer.address);
      expect(cert.issuedAt).to.equal(BigInt(await time.latest()));
      expect(cert.revokedAt).to.equal(0n);
      expect(cert.awardDate).to.equal(awardDate);
      expect(cert.certificateType).to.equal("B.E. IT");
      expect(await registry.certificateIdByHash(hash)).to.equal(id);
    });

    it("rejects issuance by an unauthorised account, including the admin", async function () {
      const { registry, admin, outsider, awardDate } = await loadFixture(deployFixture);
      await expect(registry.connect(outsider).issueCertificate(randomId(), docHash("x"), "T", awardDate))
        .to.be.revertedWithCustomError(registry, "IssuerNotActive")
        .withArgs(outsider.address);
      await expect(
        registry.connect(admin).issueCertificate(randomId(), docHash("x"), "T", awardDate)
      ).to.be.revertedWithCustomError(registry, "IssuerNotActive");
    });

    it("rejects duplicate certificate IDs", async function () {
      const { registry, issuer, otherIssuer, id, awardDate } = await loadFixture(deployFixture);
      await expect(registry.connect(issuer).issueCertificate(id, docHash("other"), "T", awardDate))
        .to.be.revertedWithCustomError(registry, "CertificateAlreadyExists")
        .withArgs(id);
      // Another institution cannot overwrite it either.
      await expect(
        registry.connect(otherIssuer).issueCertificate(id, docHash("other"), "T", awardDate)
      ).to.be.revertedWithCustomError(registry, "CertificateAlreadyExists");
    });

    it("rejects registering the same document hash twice", async function () {
      const { registry, issuer, otherIssuer, id, hash, awardDate } = await loadFixture(deployFixture);
      await expect(registry.connect(issuer).issueCertificate(randomId(), hash, "T", awardDate))
        .to.be.revertedWithCustomError(registry, "DocumentAlreadyRegistered")
        .withArgs(hash, id);
      await expect(
        registry.connect(otherIssuer).issueCertificate(randomId(), hash, "T", awardDate)
      ).to.be.revertedWithCustomError(registry, "DocumentAlreadyRegistered");
    });

    it("rejects zero IDs, zero hashes, bad types and bad award dates", async function () {
      const { registry, issuer, awardDate } = await loadFixture(deployFixture);
      const r = registry.connect(issuer);
      await expect(r.issueCertificate(ZERO, docHash("a"), "T", awardDate)).to.be.revertedWithCustomError(
        registry,
        "InvalidCertificateId"
      );
      await expect(r.issueCertificate(randomId(), ZERO, "T", awardDate)).to.be.revertedWithCustomError(
        registry,
        "InvalidDocumentHash"
      );
      await expect(r.issueCertificate(randomId(), docHash("a"), "", awardDate)).to.be.revertedWithCustomError(
        registry,
        "InvalidCertificateType"
      );
      await expect(
        r.issueCertificate(randomId(), docHash("a"), "t".repeat(101), awardDate)
      ).to.be.revertedWithCustomError(registry, "InvalidCertificateType");
      await expect(r.issueCertificate(randomId(), docHash("a"), "T", 0)).to.be.revertedWithCustomError(
        registry,
        "InvalidAwardDate"
      );
      const future = BigInt(await time.latest()) + 7n * 86400n;
      await expect(r.issueCertificate(randomId(), docHash("a"), "T", future)).to.be.revertedWithCustomError(
        registry,
        "InvalidAwardDate"
      );
    });
  });

  describe("Retrieval and verification", function () {
    it("retrieves an existing certificate and returns an empty record for unknown IDs", async function () {
      const { registry, issuer, id, hash } = await loadFixture(deployFixture);
      const cert = await registry.getCertificate(id);
      expect(cert.issuer).to.equal(issuer.address);
      expect(cert.documentHash).to.equal(hash);
      const missing = await registry.getCertificate(randomId());
      expect(missing.issuedAt).to.equal(0n);
    });

    it("verifies the correct document hash as VALID with issuer details", async function () {
      const { registry, id, hash } = await loadFixture(deployFixture);
      const [status, cert, issuerInfo] = await registry.verify(id, hash);
      expect(status).to.equal(Status.VALID);
      expect(cert.certificateType).to.equal("B.E. Computer Engineering");
      expect(issuerInfo.name).to.equal("Fr. Conceicao Rodrigues College of Engineering");
      expect(issuerInfo.active).to.equal(true);
    });

    it("reports HASH_MISMATCH for a modified document", async function () {
      const { registry, id } = await loadFixture(deployFixture);
      const [status] = await registry.verify(id, docHash("certificate-pdf-bytes-tampered"));
      expect(status).to.equal(Status.HASH_MISMATCH);
    });

    it("reports NOT_FOUND for unknown IDs and unknown documents", async function () {
      const { registry } = await loadFixture(deployFixture);
      const [status] = await registry.verify(randomId(), docHash("x"));
      expect(status).to.equal(Status.NOT_FOUND);
      const [byHash, foundId] = await registry.verifyByHash(docHash("never registered"));
      expect(byHash).to.equal(Status.NOT_FOUND);
      expect(foundId).to.equal(ZERO);
    });

    it("finds a certificate from the document alone with verifyByHash", async function () {
      const { registry, id, hash } = await loadFixture(deployFixture);
      const [status, foundId, cert] = await registry.verifyByHash(hash);
      expect(status).to.equal(Status.VALID);
      expect(foundId).to.equal(id);
      expect(cert.documentHash).to.equal(hash);
    });
  });

  describe("Revocation", function () {
    it("rejects revocation by an outsider and by a different issuer", async function () {
      const { registry, outsider, otherIssuer, id } = await loadFixture(deployFixture);
      await expect(registry.connect(outsider).revokeCertificate(id, "fraud")).to.be.revertedWithCustomError(
        registry,
        "NotAuthorizedToRevoke"
      );
      await expect(registry.connect(otherIssuer).revokeCertificate(id, "fraud")).to.be.revertedWithCustomError(
        registry,
        "NotAuthorizedToRevoke"
      );
    });

    it("lets the issuing institution revoke, keeping the original record", async function () {
      const { registry, issuer, id, hash, awardDate } = await loadFixture(deployFixture);
      const before = await registry.getCertificate(id);
      await expect(registry.connect(issuer).revokeCertificate(id, "Issued in error"))
        .to.emit(registry, "CertificateRevoked")
        .withArgs(id, issuer.address, "Issued in error");
      const after = await registry.getCertificate(id);
      expect(after.revokedAt).to.equal(BigInt(await time.latest()));
      expect(after.documentHash).to.equal(hash);
      expect(after.issuer).to.equal(issuer.address);
      expect(after.issuedAt).to.equal(before.issuedAt);
      expect(after.awardDate).to.equal(awardDate);
      // Issuance event is still in the log.
      expect(await registry.queryFilter(registry.filters.CertificateIssued(id))).to.have.length(1);
    });

    it("lets the admin revoke any certificate", async function () {
      const { registry, admin, id } = await loadFixture(deployFixture);
      await expect(registry.connect(admin).revokeCertificate(id, "Court order"))
        .to.emit(registry, "CertificateRevoked")
        .withArgs(id, admin.address, "Court order");
    });

    it("reports a revoked certificate as REVOKED, never VALID", async function () {
      const { registry, issuer, id, hash } = await loadFixture(deployFixture);
      await registry.connect(issuer).revokeCertificate(id, "Withdrawn");
      const [status] = await registry.verify(id, hash);
      expect(status).to.equal(Status.REVOKED);
      const [byHash] = await registry.verifyByHash(hash);
      expect(byHash).to.equal(Status.REVOKED);
    });

    it("rejects repeated revocation", async function () {
      const { registry, admin, issuer, id } = await loadFixture(deployFixture);
      await registry.connect(issuer).revokeCertificate(id, "Withdrawn");
      await expect(registry.connect(issuer).revokeCertificate(id, "Again"))
        .to.be.revertedWithCustomError(registry, "CertificateAlreadyRevoked")
        .withArgs(id);
      await expect(registry.connect(admin).revokeCertificate(id, "Again")).to.be.revertedWithCustomError(
        registry,
        "CertificateAlreadyRevoked"
      );
    });

    it("rejects revoking unknown certificates and empty or overlong reasons", async function () {
      const { registry, issuer, id } = await loadFixture(deployFixture);
      await expect(registry.connect(issuer).revokeCertificate(randomId(), "x")).to.be.revertedWithCustomError(
        registry,
        "CertificateNotFound"
      );
      await expect(registry.connect(issuer).revokeCertificate(id, "")).to.be.revertedWithCustomError(
        registry,
        "InvalidReason"
      );
      await expect(registry.connect(issuer).revokeCertificate(id, "r".repeat(201))).to.be.revertedWithCustomError(
        registry,
        "InvalidReason"
      );
    });
  });

  describe("Issuer deactivation policy", function () {
    it("retired issuer: cannot issue or revoke, but earlier certificates stay VALID", async function () {
      const { registry, admin, issuer, id, hash, awardDate } = await loadFixture(deployFixture);
      await expect(registry.deactivateIssuer(issuer.address, false))
        .to.emit(registry, "IssuerDeactivated")
        .withArgs(issuer.address, false, admin.address);

      const info = await registry.getIssuer(issuer.address);
      expect(info.active).to.equal(false);
      expect(info.trustRevoked).to.equal(false);
      expect(info.deactivatedAt).to.be.greaterThan(0n);

      await expect(
        registry.connect(issuer).issueCertificate(randomId(), docHash("new"), "T", awardDate)
      ).to.be.revertedWithCustomError(registry, "IssuerNotActive");
      await expect(registry.connect(issuer).revokeCertificate(id, "x")).to.be.revertedWithCustomError(
        registry,
        "NotAuthorizedToRevoke"
      );

      const [status] = await registry.verify(id, hash);
      expect(status).to.equal(Status.VALID);
      // The admin can still revoke the retired issuer's certificates.
      await registry.revokeCertificate(id, "Superseded");
      expect((await registry.verify(id, hash))[0]).to.equal(Status.REVOKED);
    });

    it("trust revoked: earlier certificates verify as ISSUER_UNTRUSTED", async function () {
      const { registry, admin, issuer, id, hash } = await loadFixture(deployFixture);
      await expect(registry.deactivateIssuer(issuer.address, true))
        .to.emit(registry, "IssuerDeactivated")
        .withArgs(issuer.address, true, admin.address);
      const [status, , issuerInfo] = await registry.verify(id, hash);
      expect(status).to.equal(Status.ISSUER_UNTRUSTED);
      expect(issuerInfo.trustRevoked).to.equal(true);
    });

    it("cannot deactivate twice, deactivate unknown accounts, or re-add a deactivated issuer", async function () {
      const { registry, issuer, outsider } = await loadFixture(deployFixture);
      await registry.deactivateIssuer(issuer.address, true);
      await expect(registry.deactivateIssuer(issuer.address, false)).to.be.revertedWithCustomError(
        registry,
        "IssuerNotActive"
      );
      await expect(registry.deactivateIssuer(outsider.address, false)).to.be.revertedWithCustomError(
        registry,
        "IssuerNotActive"
      );
      // Re-adding would silently restore trust in compromised certificates.
      await expect(registry.addIssuer(issuer.address, "Back again")).to.be.revertedWithCustomError(
        registry,
        "IssuerAlreadyRegistered"
      );
    });

    it("hash mismatch takes precedence over revocation and issuer status", async function () {
      const { registry, issuer, id } = await loadFixture(deployFixture);
      await registry.connect(issuer).revokeCertificate(id, "Withdrawn");
      await registry.deactivateIssuer(issuer.address, true);
      const [status] = await registry.verify(id, docHash("tampered"));
      expect(status).to.equal(Status.HASH_MISMATCH);
    });
  });

  describe("Events for auditing", function () {
    it("records the full history of a certificate in the event log", async function () {
      const { registry, issuer, id, hash } = await loadFixture(deployFixture);
      await registry.connect(issuer).revokeCertificate(id, "Withdrawn");
      const issued = await registry.queryFilter(registry.filters.CertificateIssued(id));
      const revoked = await registry.queryFilter(registry.filters.CertificateRevoked(id));
      expect(issued[0].args.issuer).to.equal(issuer.address);
      expect(issued[0].args.documentHash).to.equal(hash);
      expect(revoked[0].args.reason).to.equal("Withdrawn");
      expect(revoked[0].blockNumber).to.be.greaterThan(issued[0].blockNumber);
    });

    it("indexes CertificateIssued by issuer so dashboards can list an issuer's certificates", async function () {
      const { registry, issuer, otherIssuer, awardDate } = await loadFixture(deployFixture);
      await registry.connect(otherIssuer).issueCertificate(randomId(), docHash("other"), "M.Sc.", awardDate);
      const mine = await registry.queryFilter(registry.filters.CertificateIssued(null, issuer.address));
      const theirs = await registry.queryFilter(registry.filters.CertificateIssued(null, otherIssuer.address));
      expect(mine).to.have.length(1);
      expect(theirs).to.have.length(1);
      expect(theirs[0].args.certificateType).to.equal("M.Sc.");
    });
  });
});
