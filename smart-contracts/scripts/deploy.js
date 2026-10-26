// Deploys CertificateRegistry and writes the address, chain ID, deployment
// block and ABI to client/src/config/contract.json for the frontend.
//
//   npx hardhat run scripts/deploy.js --network localhost
//
// On the local chain (31337) the script also onboards Hardhat account #1 as a
// demo issuer, unless SEED_DEMO_ISSUER=false.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const CLIENT_CONFIG = path.join(__dirname, "..", "..", "client", "src", "config", "contract.json");
const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");

async function main() {
  const { ethers, network } = hre;
  const [deployer, demoIssuer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  console.log(`Network: ${network.name} (chainId ${chainId})`);
  console.log(`Deployer / admin: ${deployer.address}`);

  const Registry = await ethers.getContractFactory("CertificateRegistry");
  const registry = await Registry.deploy();
  const receipt = await registry.deploymentTransaction().wait();
  const address = await registry.getAddress();
  console.log(`CertificateRegistry: ${address} (block ${receipt.blockNumber}, gas ${receipt.gasUsed})`);

  // Guard against writing a config for code that is not what we compiled.
  const onChain = await ethers.provider.getCode(address);
  const artifact = await hre.artifacts.readArtifact("CertificateRegistry");
  if (onChain !== artifact.deployedBytecode) {
    throw new Error("Deployed bytecode does not match the compiled artifact");
  }

  if (chainId === 31337n && process.env.SEED_DEMO_ISSUER !== "false" && demoIssuer) {
    const name = process.env.DEMO_ISSUER_NAME || "Demo Institute of Technology";
    await (await registry.addIssuer(demoIssuer.address, name)).wait();
    console.log(`Demo issuer onboarded: ${demoIssuer.address} (${name})`);
  }

  const deployment = {
    network: network.name,
    chainId: Number(chainId),
    address,
    deployBlock: receipt.blockNumber,
    admin: deployer.address,
  };

  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(DEPLOYMENTS_DIR, `${network.name}.json`), JSON.stringify(deployment, null, 2) + "\n");

  fs.mkdirSync(path.dirname(CLIENT_CONFIG), { recursive: true });
  fs.writeFileSync(CLIENT_CONFIG, JSON.stringify({ ...deployment, abi: artifact.abi }, null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), CLIENT_CONFIG)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
