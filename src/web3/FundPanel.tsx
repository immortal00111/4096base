// "4096 Fund" panel — a thin, NON-CUSTODIAL UI over the existing Moonwell
// Flagship USDC ERC-4626 vault on Base. The app never holds funds; the user's
// wallet deposits to / withdraws from the audited vault directly.

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useFund } from "./useFund";
import { MORPHO_VAULT_URL, fundConfigured } from "./config";

const busy = (p: string) => p === "pending" || p === "confirming";

export const FundPanel = () => {
  const fund = useFund();
  const [depositAmt, setDepositAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");

  if (!fundConfigured) {
    return (
      <div className="panel fund-panel">
        <h2>💰 4096 Fund</h2>
        <p className="empty">
          The Fund isn't configured. Set <code>VITE_MORPHO_USDC_VAULT</code> to
          enable USDC deposits into the Moonwell/Morpho vault.
        </p>
      </div>
    );
  }

  const depositBusy = busy(fund.depositPhase);
  const withdrawBusy = busy(fund.withdrawPhase);

  return (
    <div className="panel fund-panel">
      <div className="fund-head">
        <h2>💰 4096 Fund</h2>
        {fund.apyLabel ? (
          <span className="fund-apy" title="Live net APY from Morpho (variable)">
            ~{fund.apyLabel} APY
          </span>
        ) : (
          <a
            className="fund-apy link"
            href={MORPHO_VAULT_URL}
            target="_blank"
            rel="noreferrer"
          >
            View APY ↗
          </a>
        )}
      </div>

      <p className="fund-sub">
        Earn yield on USDC via the audited Moonwell Flagship USDC vault on Base.
      </p>

      {/* MANDATORY disclosure — always visible before depositing. */}
      <div className="fund-disclosure">
        Yield is variable (currently ~4–5%), not guaranteed. Deposits go directly
        to the Morpho/Moonwell vault — this app never holds your funds. DeFi
        deposits carry smart-contract and market risk.
      </div>

      <div className="wallet-row">
        <ConnectButton
          accountStatus="address"
          chainStatus="icon"
          showBalance={false}
        />
      </div>

      {!fund.isConnected ? (
        <p className="wallet-note">Connect your wallet to deposit or withdraw.</p>
      ) : !fund.onCorrectNetwork ? (
        <div className="wallet-note warn switch">
          <span>The Fund is on Base mainnet — switch network to continue.</span>
          <button className="btn btn-primary" onClick={fund.switchToTarget}>
            Switch to Base
          </button>
        </div>
      ) : (
        <>
          <div className="fund-stats">
            <div className="wallet-stat">
              <span className="wallet-stat-label">Your position</span>
              <span className="wallet-stat-value">{fund.positionLabel} USDC</span>
            </div>
            <div className="wallet-stat">
              <span className="wallet-stat-label">Wallet USDC</span>
              <span className="wallet-stat-value">{fund.usdcBalanceLabel}</span>
            </div>
          </div>

          {/* Deposit */}
          <div className="fund-action">
            <label className="fund-label">Deposit USDC</label>
            <div className="fund-input-row">
              <input
                className="name-input fund-amount"
                inputMode="decimal"
                placeholder="0.0"
                value={depositAmt}
                onChange={(e) => setDepositAmt(e.target.value)}
              />
              <button
                className="btn btn-primary"
                disabled={depositBusy || !depositAmt}
                onClick={() => fund.deposit(depositAmt)}
              >
                {fund.approving
                  ? "Approving…"
                  : fund.depositPhase === "pending"
                    ? "Confirm…"
                    : fund.depositPhase === "confirming"
                      ? "Depositing…"
                      : "Deposit"}
              </button>
            </div>
            {fund.depositPhase === "success" && (
              <p className="saved-note">Deposited ✓</p>
            )}
            {fund.depositError && (
              <p className="wallet-note err">{fund.depositError}</p>
            )}
          </div>

          {/* Withdraw */}
          <div className="fund-action">
            <label className="fund-label">Withdraw USDC</label>
            <div className="fund-input-row">
              <input
                className="name-input fund-amount"
                inputMode="decimal"
                placeholder="0.0"
                value={withdrawAmt}
                onChange={(e) => setWithdrawAmt(e.target.value)}
              />
              <button
                className="btn"
                disabled={withdrawBusy || !withdrawAmt || !fund.hasPosition}
                onClick={() => fund.withdraw(withdrawAmt)}
              >
                {fund.withdrawPhase === "pending"
                  ? "Confirm…"
                  : fund.withdrawPhase === "confirming"
                    ? "Withdrawing…"
                    : "Withdraw"}
              </button>
            </div>
            {fund.withdrawPhase === "success" && (
              <p className="saved-note">Withdrawn ✓</p>
            )}
            {fund.withdrawError && (
              <p className="wallet-note err">{fund.withdrawError}</p>
            )}
          </div>

          <a
            className="fund-link"
            href={MORPHO_VAULT_URL}
            target="_blank"
            rel="noreferrer"
          >
            View the vault on Morpho ↗
          </a>
        </>
      )}
    </div>
  );
};
