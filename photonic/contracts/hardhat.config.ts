import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const pk = DEPLOYER_PRIVATE_KEY.startsWith("0x")
  ? DEPLOYER_PRIVATE_KEY
  : `0x${DEPLOYER_PRIVATE_KEY}`;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {},
    arbitrumSepolia: {
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: pk ? [pk] : [],
      chainId: 421614,
    },
    sepolia: {
      url: "https://rpc.sepolia.org",
      accounts: pk ? [pk] : [],
      chainId: 11155111,
    },
    baseSepolia: {
      url: "https://sepolia.base.org",
      accounts: pk ? [pk] : [],
      chainId: 84532,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
