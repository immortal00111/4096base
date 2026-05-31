// wagmi + RainbowKit configuration for Base Sepolia (testnet only).
//
// Contract addresses come from Vite env (set them after deploying — the deploy
// script prints the exact lines). Until then they default to the zero address,
// and the UI shows a "not configured" state instead of trying to transact.

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia } from "wagmi/chains";
import type { Address } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

const asAddress = (value: string | undefined): Address =>
  value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : ZERO;

export const GAME_PAYMENT_ADDRESS = asAddress(
  import.meta.env.VITE_GAME_PAYMENT_ADDRESS
);
export const DISCOUNT_NFT_ADDRESS = asAddress(
  import.meta.env.VITE_DISCOUNT_NFT_ADDRESS
);
export const ACHIEVEMENT_BADGE_ADDRESS = asAddress(
  import.meta.env.VITE_ACHIEVEMENT_BADGE_ADDRESS
);

// "4096 Fund" — the address of an EXISTING, audited ERC-4626 vault (the
// Moonwell Flagship USDC MetaMorpho vault on Base mainnet, mwUSDC). This app is
// NON-CUSTODIAL: the user's wallet interacts with this vault directly; we never
// hold, pool, route, or control funds, and never pay/promise yield (all yield
// is the vault's, variable, from Morpho). Set per-network via the env var.
export const MORPHO_USDC_VAULT_ADDRESS = asAddress(
  import.meta.env.VITE_MORPHO_USDC_VAULT
);

export const TARGET_CHAIN = baseSepolia;
export const TARGET_CHAIN_ID = baseSepolia.id; // 84532 — game / pay-to-play

// The Fund's vault lives on Base MAINNET, so the Fund has its own target chain
// independent of the (testnet) game. Users switch chains in their wallet.
export const FUND_CHAIN = base;
export const FUND_CHAIN_ID = base.id; // 8453

export const contractsConfigured =
  GAME_PAYMENT_ADDRESS !== ZERO && DISCOUNT_NFT_ADDRESS !== ZERO;

// The achievement badge is independent of pay-to-play: it may be configured
// (and offered on win) even if the rest is not, and vice versa.
export const badgeConfigured = ACHIEVEMENT_BADGE_ADDRESS !== ZERO;

// The Fund feature is independent too; hidden entirely when the vault is unset.
export const fundConfigured = MORPHO_USDC_VAULT_ADDRESS !== ZERO;

// Public Morpho resources for this vault's live (variable) APY — read-only.
export const MORPHO_API_URL = "https://blue-api.morpho.org/graphql";
export const MORPHO_VAULT_URL =
  "https://app.morpho.org/base/vault/0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca/moonwell-flagship-usdc";

// WalletConnect projectId. Get a free one at https://cloud.reown.com and put it
// in .env as VITE_WC_PROJECT_ID. A placeholder lets injected wallets (MetaMask,
// Coinbase Wallet, Rabby) still work for local testing.
const WC_PROJECT_ID =
  import.meta.env.VITE_WC_PROJECT_ID || "4096base_local_dev_placeholder";

// Base Sepolia for the game; Base mainnet so the (non-custodial) Fund can reach
// the real Morpho vault.
export const wagmiConfig = getDefaultConfig({
  appName: "4096 on Base",
  projectId: WC_PROJECT_ID,
  chains: [baseSepolia, base],
  ssr: false,
});
