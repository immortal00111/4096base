// Top web3 bar: connect button, network/fee status, and the mint-discount-NFT
// action. Purely presentational over the usePlayFlow hook.

import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { PlayFlow } from "./usePlayFlow";
import { contractsConfigured } from "./config";

export const WalletBar = ({ flow }: { flow: PlayFlow }) => {
  return (
    <div className="wallet-bar">
      <div className="wallet-row">
        <ConnectButton
          accountStatus="address"
          chainStatus="icon"
          showBalance={false}
        />
      </div>

      {!contractsConfigured && (
        <p className="wallet-note warn">
          Contracts not configured yet. Deploy to Base Sepolia and set
          <code> VITE_GAME_PAYMENT_ADDRESS</code> /
          <code> VITE_DISCOUNT_NFT_ADDRESS</code>.
        </p>
      )}

      {flow.isConnected && !flow.onCorrectNetwork && (
        <div className="wallet-note warn switch">
          <span>Wrong network — switch to Base Sepolia.</span>
          <button className="btn btn-primary" onClick={flow.switchToTarget}>
            Switch network
          </button>
        </div>
      )}

      {flow.isConnected && flow.onCorrectNetwork && contractsConfigured && (
        <div className="wallet-status">
          <div className="wallet-stat">
            <span className="wallet-stat-label">Fee</span>
            <span className="wallet-stat-value">{flow.feeLabel}</span>
          </div>
          <div className="wallet-stat">
            <span className="wallet-stat-label">Discount NFT</span>
            <span className="wallet-stat-value">
              {flow.hasNFT ? "Held ✓" : "—"}
            </span>
          </div>
          {!flow.hasNFT && (
            <button
              className="btn"
              onClick={flow.mint}
              disabled={flow.mintPhase === "pending" || flow.mintPhase === "confirming"}
            >
              {flow.mintPhase === "pending"
                ? "Confirm in wallet…"
                : flow.mintPhase === "confirming"
                  ? "Minting…"
                  : "Mint discount NFT"}
            </button>
          )}
        </div>
      )}

      {flow.mintError && <p className="wallet-note err">{flow.mintError}</p>}
    </div>
  );
};
