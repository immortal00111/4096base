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
    // Local in-memory network used for `npx hardhat test`.
    //
    // When FORK_BASE=1, the local network forks Base *mainnet* into an
    // in-memory sandbox so we can SIMULATE deposits/withdrawals against the
    // real, already-deployed Moonwell/Morpho vault. This is read/simulate only
    // — nothing is broadcast or deployed to mainnet. Normal runs skip forking
    // so the unit tests stay fast and offline.
    //
    // NOTE: the default https://mainnet.base.org node reverts the vault's
    // gas-heavy view calls (totalAssets/convertToAssets iterate Morpho
    // markets), so we default the fork to a fuller node. Override with
    // BASE_MAINNET_RPC_URL if you have your own.
    hardhat: process.env.FORK_BASE
      ? {
          // Forking Base needs ALL THREE of these together (each was necessary;
          // dropping any one reproduced a distinct failure):
          //  1. A custom hardfork history for chain 8453 — this Hardhat/EDR
          //     build has no built-in Base schedule, so without it every forked
          //     call throws "not configured with a hardfork activation history".
          //     Base has run cancun-class rules across the range we fork, so map
          //     the whole history to cancun from block 0.
          //  2. A PINNED, not-too-recent block. The chain tip (~46M, 2026) is
          //     beyond what executes cleanly → "No known hardfork for execution
          //     on historical block". An earlier block (22M) runs fine, and
          //     pinning also lets Hardhat cache fetched state on disk.
          //  3. An ARCHIVE RPC. Pruning nodes fail mid-run with "state at block
          //     N is pruned"; base.drpc.org serves archive state for free.
          // Override via BASE_MAINNET_RPC_URL / BASE_MAINNET_FORK_BLOCK.
          chains: {
            8453: {
              hardforkHistory: { cancun: 0 },
            },
          },
          forking: {
            url: process.env.BASE_MAINNET_RPC_URL || "https://base.drpc.org",
            blockNumber: process.env.BASE_MAINNET_FORK_BLOCK
              ? Number(process.env.BASE_MAINNET_FORK_BLOCK)
              : 22000000,
          },
        }
      : {},
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
