// All wallet/contract interaction for pay-to-play, behind one hook so App.tsx
// stays focused on the game. Exposes connection/network state, the live fee,
// NFT ownership, and pay()/mint() actions with pending/success/error status.
//
// pay() and mint() are async event-driven flows (driven by a user click):
// submit the tx, wait for its receipt, then resolve. This keeps all state
// updates inside async event handlers rather than effects.

import { useCallback, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { formatEther } from "viem";
import { gamePaymentAbi, discountNftAbi, achievementBadgeAbi } from "./abis";
import {
  ACHIEVEMENT_BADGE_ADDRESS,
  DISCOUNT_NFT_ADDRESS,
  GAME_PAYMENT_ADDRESS,
  TARGET_CHAIN_ID,
  badgeConfigured,
  contractsConfigured,
  wagmiConfig,
} from "./config";

export type TxPhase = "idle" | "pending" | "confirming" | "success" | "error";

export type PlayFlow = {
  isConnected: boolean;
  address?: `0x${string}`;
  chainId?: number;
  onCorrectNetwork: boolean;
  switchToTarget: () => void;
  contractsConfigured: boolean;

  fee?: bigint;
  feeLabel: string;
  hasNFT: boolean;

  /** Submit payment and wait for confirmation. Resolves true once paid. */
  pay: () => Promise<boolean>;
  payPhase: TxPhase;
  payError?: string;

  /** Mint the free discount NFT and wait for confirmation. */
  mint: () => Promise<void>;
  mintPhase: TxPhase;
  mintError?: string;

  // "Reached 4096" achievement badge (independent of pay-to-play).
  badgeConfigured: boolean;
  hasBadge: boolean;
  /** Mint the free champion badge and wait for confirmation. */
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

export const usePlayFlow = (): PlayFlow => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const onCorrectNetwork = chainId === TARGET_CHAIN_ID;
  const queryEnabled = contractsConfigured && !!address && onCorrectNetwork;

  const [payPhase, setPayPhase] = useState<TxPhase>("idle");
  const [payError, setPayError] = useState<string | undefined>();
  const [mintPhase, setMintPhase] = useState<TxPhase>("idle");
  const [mintError, setMintError] = useState<string | undefined>();
  const [badgePhase, setBadgePhase] = useState<TxPhase>("idle");
  const [badgeError, setBadgeError] = useState<string | undefined>();

  // Live fee for this wallet (accounts for NFT discount on-chain).
  const { data: fee } = useReadContract({
    address: GAME_PAYMENT_ADDRESS,
    abi: gamePaymentAbi,
    functionName: "currentFee",
    args: address ? [address] : undefined,
    query: { enabled: queryEnabled },
  });

  // NFT ownership.
  const { data: nftBalance, refetch: refetchBalance } = useReadContract({
    address: DISCOUNT_NFT_ADDRESS,
    abi: discountNftAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: queryEnabled },
  });

  const hasNFT = (nftBalance ?? 0n) > 0n;

  // Achievement badge ownership (only queried when its address is configured).
  const { data: badgeBalance, refetch: refetchBadge } = useReadContract({
    address: ACHIEVEMENT_BADGE_ADDRESS,
    abi: achievementBadgeAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: badgeConfigured && !!address && onCorrectNetwork },
  });

  const hasBadge = (badgeBalance ?? 0n) > 0n;

  const pay = useCallback(async (): Promise<boolean> => {
    if (fee === undefined) return false;
    setPayError(undefined);
    setPayPhase("pending");
    try {
      const hash = await writeContractAsync({
        address: GAME_PAYMENT_ADDRESS,
        abi: gamePaymentAbi,
        functionName: "pay",
        value: fee,
      });
      setPayPhase("confirming");
      await waitForTransactionReceipt(wagmiConfig, { hash });
      setPayPhase("success");
      return true;
    } catch (e) {
      setPayError(shortError(e));
      setPayPhase("error");
      return false;
    }
  }, [fee, writeContractAsync]);

  const mint = useCallback(async (): Promise<void> => {
    setMintError(undefined);
    setMintPhase("pending");
    try {
      const hash = await writeContractAsync({
        address: DISCOUNT_NFT_ADDRESS,
        abi: discountNftAbi,
        functionName: "mint",
      });
      setMintPhase("confirming");
      await waitForTransactionReceipt(wagmiConfig, { hash });
      setMintPhase("success");
      // Refresh balance so the discounted fee is reflected immediately.
      await refetchBalance();
    } catch (e) {
      setMintError(shortError(e));
      setMintPhase("error");
    }
  }, [writeContractAsync, refetchBalance]);

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
    contractsConfigured,

    fee,
    feeLabel: fee !== undefined ? `${formatEther(fee)} ETH` : "—",
    hasNFT,

    pay,
    payPhase,
    payError,

    mint,
    mintPhase,
    mintError,

    badgeConfigured,
    hasBadge,
    mintBadge,
    badgePhase,
    badgeError,
  };
};
