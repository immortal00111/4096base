# Audit Readiness — 4096base contracts

Scope: `contracts/GamePayment.sol`, `contracts/DiscountNFT.sol`,
`contracts/AchievementBadge.sol` (the test-only `contracts/test/ReentrantAttacker.sol`
is not in scope for deployment).

- Solidity: `0.8.24` (pinned, exact), EVM target `cancun`, optimizer on (200 runs).
- Dependencies: OpenZeppelin Contracts v5.1.
- Network: Base **Sepolia testnet only** — no mainnet network is configured.
- Status: **no deploys have been performed.** This document is assessment only;
  no contract logic was changed to produce it.

---

## What each contract does

### GamePayment.sol
Per-game ETH pay-to-play. `pay()` requires `msg.value >= currentFee(msg.sender)`
and emits `GamePaid`; any overpayment is accepted and retained (no refund path, by
design — avoids a refund re-entrancy surface). `currentFee` returns `discountFee`
if the caller holds any `discountNFT`, else `baseFee`. Collected ETH accumulates in
the contract and is swept by the owner via `withdraw()` to a configurable `receiver`.
Owner can update fees, receiver, and the discount-NFT address.

### DiscountNFT.sol
Free, one-per-wallet ERC-721 (`4096D`). Holding one qualifies a wallet for the
discounted fee in GamePayment. No payment, no owner/admin surface — anyone may
`mint()` exactly once (`hasMinted` guard).

### AchievementBadge.sol
Free, one-per-wallet ERC-721 (`4096W`) "4096 Champion" badge the UI offers on a win.
Open mint, one per wallet. **Explicitly documented in-contract as NOT cheat-proof**
(see Known limitations).

---

## Trust model

- **Owner (GamePayment only):** set at construction via `Ownable`. The owner is
  **fully trusted** and can:
  - change `baseFee` / `discountFee` to any value (no upper bound);
  - change `receiver` to any non-zero address;
  - change `discountNFT` to any address;
  - withdraw the **entire** contract balance to `receiver` at any time.
  There is no timelock, multisig, or fee cap enforced on-chain — those are
  operational choices left to whoever holds ownership.
- **DiscountNFT / AchievementBadge:** **no owner/admin at all.** They are pure
  ERC-721s with a public, permissionless, one-per-wallet `mint()`. Nothing is
  upgradeable; there is no pause, no mint cap, no admin mint.
- **Players:** trustless. A player can always mint their NFTs and pay to play; they
  never grant the contract custody beyond the ETH they send to `pay()`.

---

## Checklist

| Item | Result |
|---|---|
| NatSpec present | ✅ `@title`/`@notice`/`@dev` on all 3 contracts; `@notice` on every external/public fn |
| Events on all state changes | ✅ `GamePaid`, `FeesUpdated`, `ReceiverUpdated`, `DiscountNFTUpdated`, `Withdrawn`; `DiscountMinted`; `BadgeMinted`. Only the constructors set state without an event (standard) |
| Custom errors used | ✅ `IncorrectPayment`, `ZeroAddress`, `NothingToWithdraw`, `WithdrawFailed`, `AlreadyMinted` — no revert strings |
| No unused code | ✅ All imports used (`Ownable`, `ReentrancyGuard`, `IERC721`, `ERC721`); no dead variables/functions |
| Compiler version pinned | ✅ `pragma solidity 0.8.24;` (exact) in all 3; matches `hardhat.config.js` |
| Reentrancy | ✅ `withdraw()` is `nonReentrant` + checks-effects-interactions; NFT mints set `hasMinted`/`nextTokenId` **before** `_safeMint`, so re-entry hits `AlreadyMinted`. A test (`ReentrantAttacker`) proves the guard holds |
| Access control | ✅ All mutating GamePayment admin fns are `onlyOwner`; NFT mints are intentionally permissionless |

---

## Static analysis — Slither

Tool: `slither-analyzer` 0.11.4 (compiled via Hardhat / solc 0.8.24).
Command: `slither . --exclude-dependencies`.
Result: **24 contracts analyzed (100 detectors), 5 findings — 0 high, 0 medium.**
All findings are informational/low and are either false positives or intentional,
reviewed design choices. None require a code change for an audit.

| # | Detector | Location | Severity | Assessment |
|---|---|---|---|---|
| 1 | `incorrect-equality` | `GamePayment.withdraw` `balance == 0` | Informational (false positive) | Comparing the contract's own balance to `0` to early-revert `NothingToWithdraw`. Strict equality is only dangerous against attacker-influenced values; `address(this).balance == 0` is safe and correct. |
| 2 | `reentrancy-events` | `DiscountNFT.mint`, `AchievementBadge.mint` | Informational | The `*Minted` event is emitted after `_safeMint` (an external call to the receiver hook). State (`hasMinted`, `nextTokenId`) is already set **before** the call, so re-entry reverts with `AlreadyMinted` — no state-based reentrancy. Only event *ordering* is flagged; not exploitable. |
| 3 | `pragma` (multiple versions) | dependency tree | Informational | The 7 pragmas all come from OpenZeppelin's floating ranges in `node_modules` (`^0.8.20`, `>=0.8.4`, …). **All three in-scope contracts pin exactly `0.8.24`.** |
| 4 | `low-level-calls` | `GamePayment.withdraw` `.call{value:}` | Informational | Intentional: `.call` is the recommended ETH-send pattern (vs `transfer`/`send`), and the return value is checked (`if (!ok) revert WithdrawFailed()`). |

(Finding count is 4 detector types across 5 reported lines — the `reentrancy-events`
detector reports both NFT mints.)

### Manual review — additional notes (not flagged by Slither)

- **Low / trust-dependent — `currentFee` external call:** `pay()` → `currentFee()` →
  `discountNFT.balanceOf(player)` is an external (static) call into an
  owner-configured contract. If the owner sets `discountNFT` to a contract whose
  `balanceOf` reverts, `pay()` would revert for everyone until the owner fixes it.
  Mitigations already present: `address(0)` is short-circuited, and only the trusted
  owner can set the address. No fund risk; a griefing vector only under a
  misbehaving owner-set NFT.
- **Informational — no fee cap:** `setFees` accepts any `uint256`. Owner-trusted.
- **Informational — no per-game accounting:** GamePayment does not track which player
  paid for which game on-chain; the `GamePaid` event is the canonical record for an
  off-chain indexer. Funds simply accumulate until `withdraw()`.
- **Informational — no `tokenURI`/metadata override** on either NFT (inherited
  default returns empty). Not a security issue; flag only if on-chain metadata is
  desired later.

---

## Static analysis — Aderyn

Tool: Aderyn 0.6.8 (Cyfrin). Command: `aderyn .` (Hardhat project, solc 0.8.24).
Result: **88 detectors, 1 High + 4 Low.** The High and two of the Lows are located
in the **test-only** `ReentrantAttacker.sol` (out of deployment scope); the
GamePayment Lows are by-design / best-practice, not bugs.

| # | Aderyn finding | Location | Severity | Disposition |
|---|---|---|---|---|
| A-H1 | Contract locks Ether without a withdraw function | `test/ReentrantAttacker.sol` | High | **N/A — test-only.** Not deployed; it's the harness that proves the reentrancy guard. |
| A-L1 | Centralization risk (owner-privileged admin) | `GamePayment` (contract + `withdraw`/`setFees`/`setReceiver`/`setDiscountNFT`) | Low | **Confirmed-safe (by design).** Matches the documented trusted-owner model. |
| A-L2 | `nonReentrant` is not the first modifier | `GamePayment.withdraw` (`onlyOwner nonReentrant`) | Low | **Confirmed-safe.** `onlyOwner` (OZ `Ownable`) performs no external call, so no reentrancy can occur "through" it before the guard engages. Optional hardening only; not changed (no-logic-change constraint). |
| A-L3 | State change without event | `test/ReentrantAttacker.sol` `receive()` | Low | **N/A — test-only.** |
| A-L4 | Address state var set without zero-check | `GamePayment` ctor + `setDiscountNFT` (`discountNFT`) | Low | **Confirmed-safe (intentional).** `address(0)` is a *valid* "no discount NFT configured" state; `currentFee` explicitly short-circuits on zero. Adding a zero-check would be incorrect. |

## Symbolic execution — Mythril

Tool: Mythril 0.24.8 (`myth analyze`, per-contract, `--execution-timeout 200`,
solc 0.8.24 / cancun, OZ remapping).
Results: **DiscountNFT — no issues. AchievementBadge — no issues. GamePayment — 3 High,
1 Medium, 1 Low, all false positives** (see below).

Mythril analyzes runtime bytecode with **symbolic storage and symbolic constructor
arguments**. It therefore does **not** know that `owner` was concretely set in the
constructor, so it treats the `Ownable` owner slot as attacker-controllable and
reports `onlyOwner`-guarded paths as "anyone can call." All three Highs stem from
this single modeling gap and are **refuted by the access-control fuzz test** (120
randomized non-owner callers, every guarded mutator reverts).

| # | Mythril finding (SWC) | Function | Severity | Disposition |
|---|---|---|---|---|
| M-1 | Unprotected Ether Withdrawal (SWC-105) | `withdraw()` | High | **False positive.** `withdraw` is `onlyOwner`; Mythril's symbolic owner makes it look open. Refuted by fuzz test #2 + the existing access-control unit tests. |
| M-2 | Unprotected Ether Withdrawal (SWC-105) | `pay()` @ `discountNFT.balanceOf` | High | **False positive.** `pay()` moves **no** Ether out and writes **no** state (only emits an event); the flag is an artifact of the symbolic `discountNFT`/owner reaching `withdraw`. |
| M-3 | Unprotected Ether Withdrawal (SWC-105) | `currentFee(address)` @ `balanceOf` | High | **False positive.** `currentFee` is `view` — it cannot move Ether. Same symbolic root as M-2. |
| M-4 | State access after external call (SWC-107) | `withdraw()` (OZ `ReentrancyGuard`) | Medium | **False positive.** The flagged "write after the call" is `ReentrancyGuard` resetting `_status` to `NOT_ENTERED` — i.e. the guard *itself*, which is the mitigation. CEI is followed; no business state is written after the call. |
| M-5 | External call to user-supplied address (SWC-107) | `withdraw()` `.call{value:}` | Low | **Confirmed-safe.** Intended owner-controlled withdrawal to `receiver`; `nonReentrant` + checked return + CEI. Same root as Slither S-4 / the `currentFee` external-call note. |

## Fuzz / property tests — GamePayment

New suite `test/GamePayment.fuzz.test.js` (Hardhat + mocha; seeded `mulberry32`
PRNG for reproducibility). **380 randomized cases, all passing.** These are
property checks, not findings — they back the "confirmed-safe" / "false-positive"
dispositions above with executed evidence.

| # | Property | Cases | Result | What it proves / refutes |
|---|---|---|---|---|
| F-1 | `pay()` amount vs required fee, both tiers (with & without discount NFT) | 200 | ✅ pass | Under-fee always reverts `IncorrectPayment(sent, required)` and takes nothing; exact/over always emits `GamePaid(payer, msg.value, …)` and credits the contract by **exactly** `msg.value`. No fund-loss / mis-accounting path. |
| F-2 | Access control on `withdraw`/`setFees`/`setReceiver`/`setDiscountNFT`, random callers & args | 120 | ✅ pass | **Refutes Mythril M-1/M-2/M-3:** no non-owner can call any guarded mutator (always `OwnableUnauthorizedAccount`); the owner always can and changes persist. |
| F-3 | `withdraw()` sweeps full balance to `receiver`, leaves zero | 60 | ✅ pass | After arbitrary accepted payments, `receiver` gains **exactly** the contract's prior balance, the contract is left at **0**, and zero-balance `withdraw` reverts `NothingToWithdraw`. |

## Aggregated findings — all tools, by severity

Across Slither (4), Aderyn (5), and Mythril (5) there are **0 confirmed exploitable
issues**. Every High/Medium is either a tool false positive (Mythril's symbolic
owner) or a test-only contract (Aderyn). Everything else is informational or
by-design and matches the trust model. The fuzz suite provides executed
counter-evidence for the access-control and fund-handling claims.

| Severity | Tool — finding | Disposition | Basis |
|---|---|---|---|
| **High** | Mythril M-1 — unprotected withdraw | **False positive** | `onlyOwner`; refuted by fuzz F-2 (120 cases) + unit tests |
| **High** | Mythril M-2 — unprotected Ether via `pay()` | **False positive** | `pay()` moves no Ether, writes no state |
| **High** | Mythril M-3 — unprotected Ether via `currentFee()` | **False positive** | `view` function; symbolic-owner artifact |
| **High** | Aderyn A-H1 — locks Ether, no withdraw | **N/A (test-only)** | `ReentrantAttacker.sol`, not deployed |
| **Medium** | Mythril M-4 — state write after call | **False positive** | The write is `ReentrancyGuard` resetting; guard is the mitigation; CEI holds |
| **Low** | Mythril M-5 / Slither S-4 — low-level `.call` in withdraw | **Confirmed-safe** | Intended owner withdrawal; `nonReentrant` + checked + CEI |
| **Low** | Aderyn A-L1 — centralization | **Confirmed-safe (by design)** | Documented trusted-owner model |
| **Low** | Aderyn A-L2 — `nonReentrant` ordering | **Confirmed-safe** | `onlyOwner` makes no external call; optional hardening only |
| **Low** | Aderyn A-L4 — no zero-check on `discountNFT` | **Confirmed-safe (intentional)** | `address(0)` is a valid "no discount" state; `currentFee` short-circuits |
| **Low** | Aderyn A-L3 — state change w/o event (test) | **N/A (test-only)** | `ReentrantAttacker.receive()` |
| **Info** | Slither S-1 — strict equality `balance == 0` | **False positive** | Own-balance check is safe |
| **Info** | Slither S-2 — reentrancy-events (NFT mints) | **Confirmed-safe** | CEI: state set before `_safeMint`; re-entry hits `AlreadyMinted` |
| **Info** | Slither S-3 — multiple pragmas | **Confirmed-safe** | All from OZ deps; our 3 contracts pin exactly `0.8.24` |
| **Manual** | `currentFee`→`discountNFT.balanceOf` external call | **Confirmed-safe under trust model** | Only the trusted owner sets the NFT; `pay()` has no funds/state at risk; griefing-only if owner sets a bad NFT |

**Bottom line:** ready for external review. No code change is warranted by any
finding; the only residual is the accepted, documented owner-trust centralization.

---

## Known limitations (by design, accepted)

1. **AchievementBadge mint is not cheat-proof.** 4096base is fully client-side;
   nothing on-chain can prove the caller reached 4096. `mint()` is an open mint anyone
   can call once. The contract documents this and sketches the EIP-712 server-attestation
   approach that a tamper-resistant version would use (intentionally not built).
2. **Fees collect inside GamePayment.** ETH is held by the contract until the owner
   withdraws; there is no automatic forwarding. Acceptable for a single-owner game.
3. **DiscountNFT discount is per-wallet, not per-use.** Any balance > 0 qualifies; the
   NFT is not consumed.
4. **Centralized owner** on GamePayment (no timelock/multisig on-chain). Operational
   risk to be managed by key custody, not code.

---

## Verification performed for this report

- `npm run build` (Hardhat compile): **22 Solidity files compiled, cancun target.**
- `npm test`: **24 passing** (21 original + 3 fuzz suites), 2 pending (fork self-skips offline).
- `npm run test:vault` (live read-only sim): **9 passed, 0 failed.**
- `npm run test:fork` (Base mainnet fork): **2 passing** (deposit + withdraw round-trip).
- `slither . --exclude-dependencies`: **5 findings, 0 high / 0 medium.**
- `aderyn .` (Aderyn 0.6.8): **1 High + 4 Low** — all test-only or by-design (table above).
- `myth analyze` (Mythril 0.24.8) on each contract: **NFTs clean; GamePayment 3H/1M/1L, all false positives** (table above).
- `npx hardhat test test/GamePayment.fuzz.test.js`: **3 suites / 380 randomized cases, all passing.**

No contracts were deployed, no contract logic was modified, and nothing was pushed.

