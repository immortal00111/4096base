// "4096 Fund" — NON-CUSTODIAL ERC-4626 integration.
//
// IMPORTANT: This hook only orchestrates the user's wallet talking DIRECTLY to
// the existing, audited Moonwell Flagship USDC MetaMorpho vault on Base. We do
// NOT deploy or run any fund/custody contract. We never hold, pool, route, or
// control user funds, and we never pay or promise yield — all yield is the
// vault's, variable, and sourced from Morpho. Deposits go straight from the
// user to the vault; withdrawals go straight back to the user's own wallet.

import { useCallback, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { readContract, waitForTransactionReceipt } from "@wagmi/core";
import { formatUnits, parseUnits, type Address } from "viem";
import { erc20Abi, erc4626VaultAbi } from "./abis";
import {
  FUND_CHAIN_ID,
  MORPHO_API_URL,
  MORPHO_USDC_VAULT_ADDRESS,
  fundConfigured,
  wagmiConfig,
} from "./config";
import type { TxPhase } from "./usePlayFlow";

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

// Show at most 4 decimal places for display.
const trim = (s: string): string => {
  const [whole, frac] = s.split(".");
  if (!frac) return whole;
  return `${whole}.${frac.slice(0, 4)}`;
};

export type FundFlow = {
  fundConfigured: boolean;
  isConnected: boolean;
  onCorrectNetwork: boolean;
  switchToTarget: () => void;

  decimals: number;
  usdcBalanceLabel: string;
  positionLabel: string;
  hasPosition: boolean;
  /** Live, variable net APY from Morpho (e.g. "4.39%"), or undefined. */
  apyLabel?: string;

  deposit: (amount: string) => Promise<void>;
  depositPhase: TxPhase;
  depositError?: string;
  /** True while an ERC-20 approval is in flight as part of deposit. */
  approving: boolean;

  withdraw: (amount: string) => Promise<void>;
  withdrawPhase: TxPhase;
  withdrawError?: string;

  refresh: () => void;
};

export const useFund = (): FundFlow => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const onCorrectNetwork = chainId === FUND_CHAIN_ID;
  const enabled = fundConfigured && !!address && onCorrectNetwork;

  const [depositPhase, setDepositPhase] = useState<TxPhase>("idle");
  const [depositError, setDepositError] = useState<string | undefined>();
  const [approving, setApproving] = useState(false);
  const [withdrawPhase, setWithdrawPhase] = useState<TxPhase>("idle");
  const [withdrawError, setWithdrawError] = useState<string | undefined>();

  // Underlying asset (USDC) address, read from the vault itself (not hardcoded).
  const { data: assetAddress } = useReadContract({
    address: MORPHO_USDC_VAULT_ADDRESS,
    abi: erc4626VaultAbi,
    functionName: "asset",
    chainId: FUND_CHAIN_ID,
    query: { enabled: fundConfigured },
  });

  const { data: assetDecimals } = useReadContract({
    address: assetAddress,
    abi: erc20Abi,
    functionName: "decimals",
    chainId: FUND_CHAIN_ID,
    query: { enabled: fundConfigured && !!assetAddress },
  });
  const decimals = assetDecimals ?? 6;

  const { data: usdcBalance, refetch: refetchUsdc } = useReadContract({
    address: assetAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: FUND_CHAIN_ID,
    query: { enabled: enabled && !!assetAddress },
  });

  const { data: shareBalance, refetch: refetchShares } = useReadContract({
    address: MORPHO_USDC_VAULT_ADDRESS,
    abi: erc4626VaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: FUND_CHAIN_ID,
    query: { enabled },
  });

  const { data: positionAssets, refetch: refetchPosition } = useReadContract({
    address: MORPHO_USDC_VAULT_ADDRESS,
    abi: erc4626VaultAbi,
    functionName: "convertToAssets",
    args: [shareBalance ?? 0n],
    chainId: FUND_CHAIN_ID,
    query: { enabled: enabled && (shareBalance ?? 0n) > 0n },
  });

  // Live, variable APY from Morpho's public API (read-only).
  const { data: apyLabel } = useQuery({
    queryKey: ["morphoApy", MORPHO_USDC_VAULT_ADDRESS],
    enabled: fundConfigured,
    staleTime: 60_000,
    queryFn: async () => {
      const body = {
        query: `{ vaultByAddress(address:"${MORPHO_USDC_VAULT_ADDRESS}", chainId:${FUND_CHAIN_ID}){ state{ netApy } } }`,
      };
      const res = await fetch(MORPHO_API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("apy fetch failed");
      const json = await res.json();
      const net = json?.data?.vaultByAddress?.state?.netApy;
      if (typeof net !== "number") return undefined;
      return `${(net * 100).toFixed(2)}%`;
    },
  });

  const refresh = useCallback(() => {
    refetchUsdc();
    refetchShares();
    refetchPosition();
  }, [refetchUsdc, refetchShares, refetchPosition]);

  const deposit = useCallback(
    async (amount: string): Promise<void> => {
      if (!assetAddress || !address) return;
      let value: bigint;
      try {
        value = parseUnits(amount, decimals);
      } catch {
        setDepositError("Enter a valid amount.");
        setDepositPhase("error");
        return;
      }
      if (value <= 0n) {
        setDepositError("Enter an amount greater than zero.");
        setDepositPhase("error");
        return;
      }

      setDepositError(undefined);
      setDepositPhase("pending");
      try {
        // Approve the vault to pull USDC, only if current allowance is short.
        const allowance = (await readContract(wagmiConfig, {
          address: assetAddress as Address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, MORPHO_USDC_VAULT_ADDRESS],
          chainId: FUND_CHAIN_ID,
        })) as bigint;

        if (allowance < value) {
          setApproving(true);
          const approveHash = await writeContractAsync({
            address: assetAddress as Address,
            abi: erc20Abi,
            functionName: "approve",
            args: [MORPHO_USDC_VAULT_ADDRESS, value],
            chainId: FUND_CHAIN_ID,
          });
          await waitForTransactionReceipt(wagmiConfig, {
            hash: approveHash,
            chainId: FUND_CHAIN_ID,
          });
          setApproving(false);
        }

        // Deposit straight into the vault; shares are minted to the user.
        setDepositPhase("confirming");
        const hash = await writeContractAsync({
          address: MORPHO_USDC_VAULT_ADDRESS,
          abi: erc4626VaultAbi,
          functionName: "deposit",
          args: [value, address],
          chainId: FUND_CHAIN_ID,
        });
        await waitForTransactionReceipt(wagmiConfig, {
          hash,
          chainId: FUND_CHAIN_ID,
        });
        setDepositPhase("success");
        refresh();
      } catch (e) {
        setApproving(false);
        setDepositError(shortError(e));
        setDepositPhase("error");
      }
    },
    [assetAddress, address, decimals, writeContractAsync, refresh]
  );

  const withdraw = useCallback(
    async (amount: string): Promise<void> => {
      if (!address) return;
      let value: bigint;
      try {
        value = parseUnits(amount, decimals);
      } catch {
        setWithdrawError("Enter a valid amount.");
        setWithdrawPhase("error");
        return;
      }
      if (value <= 0n) {
        setWithdrawError("Enter an amount greater than zero.");
        setWithdrawPhase("error");
        return;
      }

      setWithdrawError(undefined);
      setWithdrawPhase("pending");
      try {
        // Withdraw USDC straight back to the user's own wallet.
        const hash = await writeContractAsync({
          address: MORPHO_USDC_VAULT_ADDRESS,
          abi: erc4626VaultAbi,
          functionName: "withdraw",
          args: [value, address, address],
          chainId: FUND_CHAIN_ID,
        });
        setWithdrawPhase("confirming");
        await waitForTransactionReceipt(wagmiConfig, {
          hash,
          chainId: FUND_CHAIN_ID,
        });
        setWithdrawPhase("success");
        refresh();
      } catch (e) {
        setWithdrawError(shortError(e));
        setWithdrawPhase("error");
      }
    },
    [address, decimals, writeContractAsync, refresh]
  );

  return {
    fundConfigured,
    isConnected,
    onCorrectNetwork,
    switchToTarget: () => switchChain({ chainId: FUND_CHAIN_ID }),

    decimals,
    usdcBalanceLabel:
      usdcBalance !== undefined ? trim(formatUnits(usdcBalance, decimals)) : "—",
    positionLabel:
      positionAssets !== undefined
        ? trim(formatUnits(positionAssets, decimals))
        : (shareBalance ?? 0n) > 0n
          ? "…"
          : "0",
    hasPosition: (shareBalance ?? 0n) > 0n,
    apyLabel,

    deposit,
    depositPhase,
    depositError,
    approving,

    withdraw,
    withdrawPhase,
    withdrawError,

    refresh,
  };
};
