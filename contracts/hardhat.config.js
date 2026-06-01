require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Base Sepolia (testnet) ONLY. No mainnet network is configured on purpose.
const BASE_SEPOLIA_RPC_URL =
  process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
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
  },
  etherscan: {
    // Optional: set BASESCAN_API_KEY in .env to enable `hardhat verify`.
    apiKey: {
      baseSepolia: process.env.BASESCAN_API_KEY || "",
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
    ],
  },
};
