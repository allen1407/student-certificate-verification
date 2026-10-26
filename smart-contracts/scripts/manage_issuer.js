// Admin task: onboard or deactivate an institutional issuer on the deployed
// registry (the address is read from deployments/<network>.json).
//
//   ACTION=add ISSUER_ADDRESS=0x... ISSUER_NAME="Some College" \
//     npx hardhat run scripts/manage_issuer.js --network localhost
//   ACTION=deactivate ISSUER_ADDRESS=0x... REVOKE_TRUST=true \
//     npx hardhat run scripts/manage_issuer.js --network localhost
//
// The first Hardhat signer must be the registry admin.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const { ACTION, ISSUER_ADDRESS, ISSUER_NAME, REVOKE_TRUST } = process.env;
  if (!ethers.isAddress(ISSUER_ADDRESS || "")) throw new Error("Set ISSUER_ADDRESS to a valid address");

  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`No deployment found at ${file}; run scripts/deploy.js first`);
  const { address } = JSON.parse(fs.readFileSync(file, "utf8"));
  const registry = await ethers.getContractAt("CertificateRegistry", address);

  let tx;
  if (ACTION === "add") {
    if (!ISSUER_NAME) throw new Error("Set ISSUER_NAME");
    tx = await registry.addIssuer(ISSUER_ADDRESS, ISSUER_NAME);
  } else if (ACTION === "deactivate") {
    tx = await registry.deactivateIssuer(ISSUER_ADDRESS, REVOKE_TRUST === "true");
  } else {
    throw new Error('Set ACTION to "add" or "deactivate"');
  }
  const receipt = await tx.wait();
  console.log(`${ACTION} ${ISSUER_ADDRESS}: tx ${receipt.hash} (block ${receipt.blockNumber})`);
  console.log(await registry.getIssuer(ISSUER_ADDRESS));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
