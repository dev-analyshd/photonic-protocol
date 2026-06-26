import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying PHOTONIC contracts with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "chainId:", network.chainId.toString());

  // 1. Deploy PhotonicRegistry
  console.log("\n[1/5] Deploying PhotonicRegistry...");
  const Registry = await ethers.getContractFactory("PhotonicRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("PhotonicRegistry:", registryAddr);

  // 2. Deploy PhotonicVitality
  console.log("\n[2/5] Deploying PhotonicVitality...");
  const Vitality = await ethers.getContractFactory("PhotonicVitality");
  const vitality = await Vitality.deploy(registryAddr);
  await vitality.waitForDeployment();
  const vitalityAddr = await vitality.getAddress();
  console.log("PhotonicVitality:", vitalityAddr);

  // 3. Deploy PhotonicVerifier
  console.log("\n[3/5] Deploying PhotonicVerifier...");
  const Verifier = await ethers.getContractFactory("PhotonicVerifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  console.log("PhotonicVerifier:", verifierAddr);

  // 4. Deploy PhotonicAuction
  console.log("\n[4/5] Deploying PhotonicAuction...");
  const Auction = await ethers.getContractFactory("PhotonicAuction");
  const auction = await Auction.deploy();
  await auction.waitForDeployment();
  const auctionAddr = await auction.getAddress();
  console.log("PhotonicAuction:", auctionAddr);

  // 5. Deploy PhotonicEscrow
  console.log("\n[5/5] Deploying PhotonicEscrow...");
  const Escrow = await ethers.getContractFactory("PhotonicEscrow");
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log("PhotonicEscrow:", escrowAddr);

  // Wire up contracts
  console.log("\n[Wire-up] Linking contracts...");
  await registry.setVitalityContract(vitalityAddr);
  await registry.setEscrowContract(escrowAddr);
  await escrow.setContracts(verifierAddr, registryAddr, vitalityAddr);
  console.log("Contracts linked.");

  const deployment = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      PhotonicRegistry: registryAddr,
      PhotonicVitality: vitalityAddr,
      PhotonicVerifier: verifierAddr,
      PhotonicAuction: auctionAddr,
      PhotonicEscrow: escrowAddr,
    },
  };

  const outDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network.chainId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`\nDeployment saved to ${outFile}`);
  console.log("\n=== PHOTONIC DEPLOYMENT COMPLETE ===");
  console.log(JSON.stringify(deployment.contracts, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
