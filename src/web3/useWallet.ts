// All wallet/contract interaction for the two free collectible NFTs, behind one
// hook so App.tsx stays focused on the game. Exposes connection/network state,
// ownership of each NFT, and the free mint actions with pending/success/error
// status.
//
// The game itself is FREE — there is no payment or fee flow here. mintPremium()
// and mintBadge() are async, click-driven flows: submit the tx, wait for its
// receipt, then resolve. State updates stay inside the async handlers.

import { useCallback, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { premiumNftAbi, achievementBadgeAbi } from "./abis";
import {
  ACHIEVEMENT_BADGE_ADDRESS,
  PREMIUM_NFT_ADDRESS,
  TARGET_CHAIN_ID,
  badgeConfigured,
  premiumConfigured,
  wagmiConfig,
} from "./config";

export type TxPhase = "idle" | "pending" | "confirming" | "success" | "error";

export type WalletFlow = {
  isConnected: boolean;
  address?: `0x${string}`;
  chainId?: number;
  onCorrectNetwork: boolean;
  switchToTarget: () => void;

  // Premium / early-supporter NFT.
  premiumConfigured: boolean;
  hasPremium: boolean;
  /** Mint the free premium NFT and wait for confirmation. */
  mintPremium: () => Promise<void>;
  premiumPhase: TxPhase;
  premiumError?: string;

  // "Reached 4096" winner badge.
  badgeConfigured: boolean;
  hasBadge: boolean;
  /** Mint the free winner badge and wait for confirmation. */
  mintBadge: () => Promise<void>;
  badgePhase: TxPhase;
  badgeError?: string;
};

const shortError = (e: unknown): string => {
  if (!e) return "Unknown error";
  const msg =
    (e as { shortMessage?: string; message?: string }).shortMessage ??
    (e as Error).message ??
    String(e);
  // User-rejected requests are common and shouldn't read like a crash.
  if (/user rejected|denied|rejected the request/i.test(msg)) {
    return "Request rejected in wallet.";
  }
  return msg.length > 140 ? msg.slice(0, 140) + "…" : msg;
};

export const useWallet = (): WalletFlow => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const onCorrectNetwork = chainId === TARGET_CHAIN_ID;
  const canQuery = !!address && onCorrectNetwork;

  const [premiumPhase, setPremiumPhase] = useState<TxPhase>("idle");
  const [premiumError, setPremiumError] = useState<string | undefined>();
  const [badgePhase, setBadgePhase] = useState<TxPhase>("idle");
  const [badgeError, setBadgeError] = useState<string | undefined>();

  // Premium NFT ownership.
  const { data: premiumBalance, refetch: refetchPremium } = useReadContract({
    address: PREMIUM_NFT_ADDRESS,
    abi: premiumNftAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: premiumConfigured && canQuery },
  });
  const hasPremium = (premiumBalance ?? 0n) > 0n;

  // Winner badge ownership.
  const { data: badgeBalance, refetch: refetchBadge } = useReadContract({
    address: ACHIEVEMENT_BADGE_ADDRESS,
    abi: achievementBadgeAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: badgeConfigured && canQuery },
  });
  const hasBadge = (badgeBalance ?? 0n) > 0n;

  const mintPremium = useCallback(async (): Promise<void> => {
    setPremiumError(undefined);
    setPremiumPhase("pending");
    try {
      const hash = await writeContractAsync({
        address: PREMIUM_NFT_ADDRESS,
        abi: premiumNftAbi,
        functionName: "mint",
      });
      setPremiumPhase("confirming");
      await waitForTransactionReceipt(wagmiConfig, { hash });
      setPremiumPhase("success");
      await refetchPremium();
    } catch (e) {
      setPremiumError(shortError(e));
      setPremiumPhase("error");
    }
  }, [writeContractAsync, refetchPremium]);

  const mintBadge = useCallback(async (): Promise<void> => {
    setBadgeError(undefined);
    setBadgePhase("pending");
    try {
      const hash = await writeContractAsync({
        address: ACHIEVEMENT_BADGE_ADDRESS,
        abi: achievementBadgeAbi,
        functionName: "mint",
      });
      setBadgePhase("confirming");
      await waitForTransactionReceipt(wagmiConfig, { hash });
      setBadgePhase("success");
      await refetchBadge();
    } catch (e) {
      setBadgeError(shortError(e));
      setBadgePhase("error");
    }
  }, [writeContractAsync, refetchBadge]);

  return {
    isConnected,
    address,
    chainId,
    onCorrectNetwork,
    switchToTarget: () => switchChain({ chainId: TARGET_CHAIN_ID }),

    premiumConfigured,
    hasPremium,
    mintPremium,
    premiumPhase,
    premiumError,

    badgeConfigured,
    hasBadge,
    mintBadge,
    badgePhase,
    badgeError,
  };
};
