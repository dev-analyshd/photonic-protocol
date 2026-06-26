import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RPC = "https://sepolia-rollup.arbitrum.io/rpc";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY not set");

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(
  PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`,
  provider
);

function loadArtifact(name) {
  const p = path.join(
    __dirname,
    `../artifacts/contracts/${name}.sol/${name}.json`
  );
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function deployContract(name, ...args) {
  console.log(`\nDeploying ${name}...`);
  const artifact = loadArtifact(name);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  try {
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice * 2n;

    const deployTx = await factory.getDeployTransaction(...args);
    const estimated = await provider.estimateGas({ ...deployTx, from: wallet.address });
    console.log(`  Estimated gas: ${estimated}`);

    const contract = await factory.deploy(...args, {
      gasPrice,
      gasLimit: (estimated * 130n) / 100n,
    });
    const receipt = await contract.waitForDeployment();
    const addr = await contract.getAddress();
    console.log(`  ${name} deployed to: ${addr}`);
    return { contract, addr };
  } catch (err) {
    console.error(`  DEPLOY ERROR for ${name}:`, err.message);
    if (err.data) {
      console.error("  Revert data:", err.data);
    }
    throw err;
  }
}

async function main() {
  const network = await provider.getNetwork();
  const balance = await provider.getBalance(wallet.address);
  console.log("Deployer:", wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
  console.log("Network:", network.name, "chainId:", network.chainId.toString());

  const { contract: registry, addr: registryAddr } = await deployContract("PhotonicRegistry");
  const { contract: vitality, addr: vitalityAddr } = await deployContract("PhotonicVitality", registryAddr);
  const { addr: verifierAddr } = await deployContract("PhotonicVerifier");
  const { addr: auctionAddr } = await deployContract("PhotonicAuction");
  const { contract: escrow, addr: escrowAddr } = await deployContract("PhotonicEscrow");

  console.log("\nWiring contracts...");
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice * 2n;

  await (await registry.setVitalityContract(vitalityAddr, { gasPrice })).wait();
  await (await registry.setEscrowContract(escrowAddr, { gasPrice })).wait();
  await (await escrow.setContracts(verifierAddr, registryAddr, vitalityAddr, { gasPrice })).wait();
  console.log("Contracts wired.");

  const deployment = {
    network: "arbitrumSepolia",
    chainId: network.chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer: wallet.address,
    contracts: {
      PhotonicRegistry: registryAddr,
      PhotonicVitality: vitalityAddr,
      PhotonicVerifier: verifierAddr,
      PhotonicAuction: auctionAddr,
      PhotonicEscrow: escrowAddr,
    },
  };

  const outDir = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network.chainId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`\nSaved to ${outFile}`);
  console.log("\n=== PHOTONIC DEPLOYMENT COMPLETE ===");
  console.log(JSON.stringify(deployment.contracts, null, 2));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
