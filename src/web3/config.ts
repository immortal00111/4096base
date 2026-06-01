// wagmi + RainbowKit configuration for Base Sepolia (testnet only).
//
// 4096base is a FREE game. The only on-chain things are two free, one-per-wallet
// collectible NFTs (Premium / early-supporter, and the "Reached 4096" winner
// badge). There is no payment, fee, fund, or custody contract — the app never
// holds, moves, or custodies any funds.
//
// Contract addresses come from Vite env (set them after deploying — the deploy
// script prints the exact lines). Until then they default to the zero address,
// and the UI simply hides the mint actions.

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { baseSepolia } from "wagmi/chains";
import type { Address } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

const asAddress = (value: string | undefined): Address =>
  value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : ZERO;

export const PREMIUM_NFT_ADDRESS = asAddress(
  import.meta.env.VITE_PREMIUM_NFT_ADDRESS
);
export const ACHIEVEMENT_BADGE_ADDRESS = asAddress(
  import.meta.env.VITE_ACHIEVEMENT_BADGE_ADDRESS
);

export const TARGET_CHAIN_ID = baseSepolia.id; // 84532

// Each NFT is independent; its mint UI is shown only once its address is set.
export const premiumConfigured = PREMIUM_NFT_ADDRESS !== ZERO;
export const badgeConfigured = ACHIEVEMENT_BADGE_ADDRESS !== ZERO;

// WalletConnect projectId. Get a free one at https://cloud.reown.com and put it
// in .env as VITE_WC_PROJECT_ID. A placeholder lets injected wallets (MetaMask,
// Coinbase Wallet, Rabby) still work for local testing.
const WC_PROJECT_ID =
  import.meta.env.VITE_WC_PROJECT_ID || "4096base_local_dev_placeholder";

export const wagmiConfig = getDefaultConfig({
  appName: "4096 on Base",
  projectId: WC_PROJECT_ID,
  chains: [baseSepolia],
  ssr: false,
});
