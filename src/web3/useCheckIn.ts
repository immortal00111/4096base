// Daily check-in (DailyCheckIn contract): reads the connected wallet's streak /
// eligibility and exposes the once-per-UTC-day checkIn() write as an async,
// click-driven flow with pending/confirming/success/error status.
//
// Reads are pinned to TARGET_CHAIN_ID via the config's public transport; the
// write uses the connected wallet (the UI only enables it on the right network).

import { useCallback, useState } from "react";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { dailyCheckInAbi } from "./abis";
import {
  DAILY_CHECKIN_ADDRESS,
  TARGET_CHAIN_ID,
  dailyCheckinConfigured,
  wagmiConfig,
} from "./config";
import type { TxPhase } from "./useWallet";

export type CheckInFlow = {
  configured: boolean;
  isConnected: boolean;
  onCorrectNetwork: boolean;

  canCheckIn: boolean;
  currentStreak: number;
  longestStreak: number;
  totalCheckIns: number;
  hasNFT: boolean;

  /** Claim today's check-in. Resolves true once confirmed. */
  checkIn: () => Promise<boolean>;
  phase: TxPhase;
  error?: string;
  refresh: () => void;
};

const shortError = (e: unknown): string => {
  if (!e) return "Unknown error";
  const msg =
    (e as { shortMessage?: string; message?: string }).shortMessage ??
    (e as Error).message ??
    String(e);
  if (/user rejected|denied|rejected the request/i.test(msg)) {
    return "Request rejected in wallet.";
  }
  return msg.length > 140 ? msg.slice(0, 140) + "…" : msg;
};

export const useCheckIn = (): CheckInFlow => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();

  const onCorrectNetwork = chainId === TARGET_CHAIN_ID;
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [error, setError] = useState<string | undefined>();

  const base = {
    address: DAILY_CHECKIN_ADDRESS,
    abi: dailyCheckInAbi,
    chainId: TARGET_CHAIN_ID,
  } as const;
  const enabled = dailyCheckinConfigured && !!address;

  const { data: canData, refetch: refetchCan } = useReadContract({
    ...base,
    functionName: "canCheckIn",
    args: address ? [address] : undefined,
    query: { enabled },
  });
  const { data: streakData, refetch: refetchStreak } = useReadContract({
    ...base,
    functionName: "currentStreak",
    args: address ? [address] : undefined,
    query: { enabled },
  });
  const { data: longestData, refetch: refetchLongest } = useReadContract({
    ...base,
    functionName: "longestStreak",
    args: address ? [address] : undefined,
    query: { enabled },
  });
  const { data: totalData, refetch: refetchTotal } = useReadContract({
    ...base,
    functionName: "totalCheckIns",
    args: address ? [address] : undefined,
    query: { enabled },
  });
  const { data: nftData, refetch: refetchNft } = useReadContract({
    ...base,
    functionName: "hasCheckInNFT",
    args: address ? [address] : undefined,
    query: { enabled },
  });

  const refresh = useCallback(() => {
    refetchCan();
    refetchStreak();
    refetchLongest();
    refetchTotal();
    refetchNft();
  }, [refetchCan, refetchStreak, refetchLongest, refetchTotal, refetchNft]);

  const checkIn = useCallback(async (): Promise<boolean> => {
    setError(undefined);
    setPhase("pending");
    try {
      const hash = await writeContractAsync({
        address: DAILY_CHECKIN_ADDRESS,
        abi: dailyCheckInAbi,
        functionName: "checkIn",
      });
      setPhase("confirming");
      await waitForTransactionReceipt(wagmiConfig, { hash });
      setPhase("success");
      refresh();
      return true;
    } catch (e) {
      setError(shortError(e));
      setPhase("error");
      return false;
    }
  }, [writeContractAsync, refresh]);

  return {
    configured: dailyCheckinConfigured,
    isConnected,
    onCorrectNetwork,

    canCheckIn: canData ?? false,
    currentStreak: Number(streakData ?? 0n),
    longestStreak: Number(longestData ?? 0n),
    totalCheckIns: Number(totalData ?? 0n),
    hasNFT: nftData ?? false,

    checkIn,
    phase,
    error,
    refresh,
  };
};
