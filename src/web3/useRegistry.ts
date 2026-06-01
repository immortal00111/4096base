// On-chain player accounts + high scores, behind one hook. Reads the caller's
// registration/name/high-score and the full leaderboard, and exposes the two
// write actions (register a name, submit a score) as async, click-driven flows
// with pending/confirming/success/error status.
//
// All reads are pinned to Base Sepolia (TARGET_CHAIN_ID) via the config's public
// transport, so the leaderboard is readable even before a wallet connects. The
// writes use the connected wallet; the UI only enables them on the right network.

import { useCallback, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { playerRegistryAbi } from "./abis";
import {
  PLAYER_REGISTRY_ADDRESS,
  TARGET_CHAIN_ID,
  registryConfigured,
  wagmiConfig,
} from "./config";
import type { TxPhase } from "./useWallet";

export type LeaderboardPlayer = {
  address: `0x${string}`;
  name: string;
  score: number;
};

export type RegistryFlow = {
  registryConfigured: boolean;
  isConnected: boolean;
  address?: `0x${string}`;
  onCorrectNetwork: boolean;
  switchToTarget: () => void;

  isRegistered: boolean;
  myName: string;
  myHighScore: number;

  /** Register (or rename) on-chain. Resolves true once confirmed. */
  register: (name: string) => Promise<boolean>;
  registerPhase: TxPhase;
  registerError?: string;

  /** Submit a score on-chain (keeps the max). Resolves true once confirmed. */
  submitScore: (score: number) => Promise<boolean>;
  submitPhase: TxPhase;
  submitError?: string;

  /** All registered players, highest score first. */
  players: LeaderboardPlayer[];
  refreshLeaderboard: () => void;
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

export const useRegistry = (): RegistryFlow => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const onCorrectNetwork = chainId === TARGET_CHAIN_ID;

  const [registerPhase, setRegisterPhase] = useState<TxPhase>("idle");
  const [registerError, setRegisterError] = useState<string | undefined>();
  const [submitPhase, setSubmitPhase] = useState<TxPhase>("idle");
  const [submitError, setSubmitError] = useState<string | undefined>();

  const base = {
    address: PLAYER_REGISTRY_ADDRESS,
    abi: playerRegistryAbi,
    chainId: TARGET_CHAIN_ID,
  } as const;

  const { data: registered, refetch: refetchRegistered } = useReadContract({
    ...base,
    functionName: "isRegistered",
    args: address ? [address] : undefined,
    query: { enabled: registryConfigured && !!address },
  });

  const { data: nameData, refetch: refetchName } = useReadContract({
    ...base,
    functionName: "nameOf",
    args: address ? [address] : undefined,
    query: { enabled: registryConfigured && !!address },
  });

  const { data: highScoreData, refetch: refetchHighScore } = useReadContract({
    ...base,
    functionName: "highScoreOf",
    args: address ? [address] : undefined,
    query: { enabled: registryConfigured && !!address },
  });

  const { data: allPlayers, refetch: refetchPlayers } = useReadContract({
    ...base,
    functionName: "getAllPlayers",
    query: { enabled: registryConfigured },
  });

  const players = useMemo<LeaderboardPlayer[]>(() => {
    if (!allPlayers) return [];
    const [addrs, names, scores] = allPlayers;
    return addrs
      .map((a, i) => ({
        address: a,
        name: names[i] ?? "",
        score: Number(scores[i] ?? 0n),
      }))
      .sort((x, y) => y.score - x.score);
  }, [allPlayers]);

  const refreshLeaderboard = useCallback(() => {
    refetchPlayers();
  }, [refetchPlayers]);

  const register = useCallback(
    async (name: string): Promise<boolean> => {
      const trimmed = name.trim();
      if (!trimmed) {
        setRegisterError("Enter a name.");
        setRegisterPhase("error");
        return false;
      }
      setRegisterError(undefined);
      setRegisterPhase("pending");
      try {
        const hash = await writeContractAsync({
          address: PLAYER_REGISTRY_ADDRESS,
          abi: playerRegistryAbi,
          functionName: "register",
          args: [trimmed],
        });
        setRegisterPhase("confirming");
        await waitForTransactionReceipt(wagmiConfig, { hash });
        setRegisterPhase("success");
        await Promise.all([
          refetchRegistered(),
          refetchName(),
          refetchPlayers(),
        ]);
        return true;
      } catch (e) {
        setRegisterError(shortError(e));
        setRegisterPhase("error");
        return false;
      }
    },
    [writeContractAsync, refetchRegistered, refetchName, refetchPlayers]
  );

  const submitScore = useCallback(
    async (score: number): Promise<boolean> => {
      setSubmitError(undefined);
      setSubmitPhase("pending");
      try {
        const hash = await writeContractAsync({
          address: PLAYER_REGISTRY_ADDRESS,
          abi: playerRegistryAbi,
          functionName: "submitScore",
          args: [BigInt(Math.max(0, Math.floor(score)))],
        });
        setSubmitPhase("confirming");
        await waitForTransactionReceipt(wagmiConfig, { hash });
        setSubmitPhase("success");
        await Promise.all([refetchHighScore(), refetchPlayers()]);
        return true;
      } catch (e) {
        setSubmitError(shortError(e));
        setSubmitPhase("error");
        return false;
      }
    },
    [writeContractAsync, refetchHighScore, refetchPlayers]
  );

  return {
    registryConfigured,
    isConnected,
    address,
    onCorrectNetwork,
    switchToTarget: () => switchChain({ chainId: TARGET_CHAIN_ID }),

    isRegistered: registered ?? false,
    myName: nameData ?? "",
    myHighScore: Number(highScoreData ?? 0n),

    register,
    registerPhase,
    registerError,

    submitScore,
    submitPhase,
    submitError,

    players,
    refreshLeaderboard,
  };
};
