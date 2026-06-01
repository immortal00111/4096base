// Top web3 bar: connect button, network status, and the free Premium NFT mint.
// Purely presentational over the useWallet hook. No fees — the game is free.

import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { WalletFlow } from "./useWallet";

export const WalletBar = ({ flow }: { flow: WalletFlow }) => {
  return (
    <div className="wallet-bar">
      <div className="wallet-row">
        <ConnectButton
          accountStatus="address"
          chainStatus="icon"
          showBalance={false}
        />
      </div>

      {flow.isConnected && !flow.onCorrectNetwork && (
        <div className="wallet-note warn switch">
          <span>Wrong network — switch to Base Sepolia.</span>
          <button className="btn btn-primary" onClick={flow.switchToTarget}>
            Switch network
          </button>
        </div>
      )}

      {flow.isConnected &&
        flow.onCorrectNetwork &&
        flow.premiumConfigured && (
          <div className="wallet-status">
            <div className="wallet-stat">
              <span className="wallet-stat-label">Membership</span>
              <span className="wallet-stat-value">
                {flow.hasPremium ? "Premium member ✓" : "Free player"}
              </span>
            </div>
            {!flow.hasPremium && (
              <button
                className="btn"
                onClick={flow.mintPremium}
                disabled={
                  flow.premiumPhase === "pending" ||
                  flow.premiumPhase === "confirming"
                }
              >
                {flow.premiumPhase === "pending"
                  ? "Confirm in wallet…"
                  : flow.premiumPhase === "confirming"
                    ? "Minting…"
                    : "Mint Premium / Early supporter NFT"}
              </button>
            )}
          </div>
        )}

      {flow.hasPremium && (
        <p className="wallet-note">⭐ Early supporter — thanks for being here.</p>
      )}

      {flow.premiumError && <p className="wallet-note err">{flow.premiumError}</p>}
    </div>
  );
};
