# Audit Readiness — 4096base contracts

Scope: `contracts/PremiumNFT.sol`, `contracts/AchievementBadge.sol`.

4096base is a **free game**. There is **no payment, fee, fund, deposit, yield, or
custody contract** — neither contract holds, moves, or custodies any funds. The
only on-chain pieces are two free, one-per-wallet collectible ERC-721s.

- Solidity: `0.8.24` (pinned, exact), EVM target `cancun`, optimizer on (200 runs).
- Dependencies: OpenZeppelin Contracts v5.1.
- Network: Base **Sepolia testnet only** — no mainnet network is configured.
- Status: **no deploys have been performed.** Assessment only; no contract logic
  was changed to produce this document.

> **Scope change (this revision).** The previous pay-to-play `GamePayment`
> contract, its `ReentrantAttacker` test helper, and the entire Aerodrome/Morpho
> "4096 Fund" (ERC-4626 vault) integration and its fork/sim tests were **removed**.
> `DiscountNFT` was renamed to **`PremiumNFT`** (logic identical — a free
> one-per-wallet mint) and no longer relates to any fee. Earlier audit findings
> about `GamePayment` / the fund no longer apply because that code is gone.

---

## What each contract does

### PremiumNFT.sol  (`4096 Premium` / `4096P`)
Free, one-per-wallet ERC-721 marking a wallet as a premium / early supporter.
No payment and no owner/admin surface — anyone may `mint()` exactly once
(`hasMinted` guard). Holding it grants **no** fees, discounts, or financial
rights; it is purely a membership badge.

### AchievementBadge.sol  (`4096 Champion` / `4096W`)
Free, one-per-wallet ERC-721 "Reached 4096" winner badge the UI offers on a win.
Open mint, one per wallet. **Explicitly documented in-contract as NOT cheat-proof**
(see Known limitations).

---

## Trust model

- **No owner / admin on either contract.** Both are plain ERC-721s with a public,
  permissionless, one-per-wallet `mint()`. There is no `Ownable`, no pause, no
  mint cap, no admin mint, nothing upgradeable.
- **No funds anywhere.** Neither contract is payable, holds ETH/tokens, or has a
  withdrawal path. There is no centralization or custody risk to assess.
- **Players:** fully trustless — a player can always mint each NFT once and never
  grants the contracts any custody.

---

## Checklist

| Item | Result |
|---|---|
| NatSpec present | ✅ `@title`/`@notice`/`@dev` on both; `@notice` on `mint()` |
| Events on state changes | ✅ `PremiumMinted` / `BadgeMinted` on mint (the only state change) |
| Custom errors used | ✅ `AlreadyMinted` — no revert strings |
| No unused code | ✅ single `ERC721` import, used; no dead vars/functions |
| Compiler pinned | ✅ `pragma solidity 0.8.24;` (exact) in both; matches `hardhat.config.js` |
| Reentrancy | ✅ CEI: `hasMinted`/`nextTokenId` set **before** `_safeMint`, so any re-entry hits `AlreadyMinted` |
| Access control | ✅ Mints are intentionally permissionless; there is no privileged surface to gate |

---

## Multi-tool security pass (re-run on the current two-NFT set)

All three tools were re-run against the contracts as they stand now. **0 high,
0 medium across all tools; 0 exploitable issues.**

| Tool | Version | Result |
|---|---|---|
| Slither | 0.11.4 | 19 contracts, 100 detectors — **3 informational** (table below), 0 high/medium |
| Aderyn | 0.6.8 | 88 detectors — **0 issues** (its prior Lows were all GamePayment/test-only, now deleted) |
| Mythril | 0.24.8 | `myth analyze` per contract — **PremiumNFT: no issues; AchievementBadge: no issues** |

### Slither findings (all informational, by-design)

| # | Detector | Location | Disposition |
|---|---|---|---|
| S-1 | `reentrancy-events` | `PremiumNFT.mint`, `AchievementBadge.mint` | **Confirmed-safe.** Event emitted after `_safeMint`, but state (`hasMinted`, `nextTokenId`) is set **before** the call, so re-entry reverts `AlreadyMinted`. Only event ordering is flagged; not exploitable. |
| S-2 | `pragma` (multiple versions) | dependency tree | **Confirmed-safe.** All non-`0.8.24` pragmas come from OpenZeppelin's floating ranges in `node_modules`; both in-scope contracts pin exactly `0.8.24`. |

---

## Known limitations (by design, accepted)

1. **AchievementBadge mint is not cheat-proof.** 4096base is fully client-side;
   nothing on-chain can prove the caller reached 4096. `mint()` is an open mint
   anyone can call once. The contract documents this and sketches the EIP-712
   server-attestation approach a tamper-resistant version would use (intentionally
   not built).
2. **Mints are per-wallet, not transfer-aware.** The one-per-wallet guard is on the
   minting address; standard ERC-721 transfers are otherwise unrestricted.
3. **No `tokenURI`/metadata override** on either NFT (inherited default returns
   empty). Not a security issue; flag only if on-chain metadata is desired later.

---

## Verification performed for this report

- `npm run build` (Hardhat compile): **17 Solidity files compiled, cancun target.**
- `npm test`: **8 passing** (4 PremiumNFT + 4 AchievementBadge).
- `slither . --exclude-dependencies`: **3 findings, 0 high / 0 medium.**
- `aderyn .`: **0 issues.**
- `myth analyze` on each contract: **both clean, no issues.**

No contracts were deployed, no contract logic was modified, and nothing was pushed.
