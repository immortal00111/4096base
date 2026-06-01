require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Base Sepolia (testnet) and Base mainnet are both valid deploy targets. These
// contracts hold no funds (no payment/fee/fund/custody), so deploying to mainnet
// is safe; it still costs real ETH for gas, so default to Sepolia and only use
// `--network base` deliberately.
const BASE_SEPOLIA_RPC_URL =
  process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const BASE_MAINNET_RPC_URL =
  process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Base (incl. Sepolia) is post-Dencun. Cancun is required because
      // OpenZeppelin v5.1 uses the `mcopy` opcode; without this, solc 0.8.24
      // defaults to "shanghai" and fails with "Function mcopy not found".
      evmVersion: "cancun",
    },
  },
  networks: {
    // Local in-memory network used for `npx hardhat test`. The game is free and
    // the contracts hold no funds, so there is nothing to fork or simulate
    // against mainnet — the unit tests run fully offline.
    hardhat: {},
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      chainId: 84532,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    // Base MAINNET. Same deployer key from .env; uses real ETH for gas. Deploy
    // here only on purpose with `--network base`.
    base: {
      url: BASE_MAINNET_RPC_URL,
      chainId: 8453,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    // Optional: set BASESCAN_API_KEY in .env to enable `hardhat verify`.
    apiKey: {
      baseSepolia: process.env.BASESCAN_API_KEY || "",
      base: process.env.BASESCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
};
