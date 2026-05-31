// Live read-only + simulated validation of the "4096 Fund" path against the
// REAL Moonwell Flagship USDC vault on Base mainnet. No deploy, no broadcast.
//
// Why this instead of a Hardhat fork: the project's Hardhat 2.28.6 / EDR
// 0.12.0-next.23 build cannot fork Base (it rejects the hardforkHistory
// override with "not configured with a hardfork activation history"). This
// script gets equivalent assurance by (a) reading the live vault's ERC-4626
// surface and (b) using eth_call STATE OVERRIDES to simulate a real deposit
// with a funded balance/allowance — exercising the exact functions the
// frontend calls, against live mainnet state.
//
// Run:  node test/morpho-live-sim.mjs

import { ethers } from "ethers";

const RPC = process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
const VAULT = "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USER = "0x1111111111111111111111111111111111111111"; // arbitrary EOA
const DEPOSIT = 1_000n * 10n ** 6n; // 1,000 USDC

const vaultIface = new ethers.Interface([
  "function asset() view returns (address)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function previewDeposit(uint256) view returns (uint256)",
  "function previewRedeem(uint256) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function maxDeposit(address) view returns (uint256)",
  "function deposit(uint256 assets,address receiver) returns (uint256 shares)",
]);
const usdcIface = new ethers.Interface([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);

let pass = 0,
  fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}${detail ? " — " + detail : ""}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
};

const provider = new ethers.JsonRpcProvider(RPC);
const vault = new ethers.Contract(VAULT, vaultIface, provider);
const usdc = new ethers.Contract(USDC, usdcIface, provider);

// Public RPCs throw transient errors ("missing revert data", timeouts) under
// load. Retry a few times so a flaky node doesn't read as a real failure.
const retry = async (fn, tries = 5) => {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last;
};

// keccak256(abi.encode(addr, slot)) — storage key for mapping(address=>uint).
const mapSlot = (addr, slot) =>
  ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [addr, slot])
  );

async function main() {
  console.log(`Live Morpho vault validation @ ${RPC}\n`);

  // --- Reads: confirm identity + ERC-4626 surface (via ethers Contract) ---
  const asset = await retry(() => vault.asset());
  check("vault.asset() == canonical Base USDC", asset.toLowerCase() === USDC.toLowerCase(), asset);

  const symbol = await retry(() => vault.symbol());
  check('vault.symbol() == "mwUSDC"', symbol === "mwUSDC", symbol);

  const previewShares = await retry(() => vault.previewDeposit(DEPOSIT));
  check("previewDeposit(1000 USDC) > 0", previewShares > 0n, previewShares.toString());

  const backToAssets = await retry(() => vault.convertToAssets(previewShares));
  // Round-trip assets ≈ deposit. previewDeposit + convertToAssets each round,
  // and the live share price drifts block-to-block, so the result can land a
  // couple of wei either side of DEPOSIT. Allow a small symmetric tolerance
  // (<1 USDC) rather than asserting a strict direction.
  const diff = backToAssets > DEPOSIT ? backToAssets - DEPOSIT : DEPOSIT - backToAssets;
  check(
    "convertToAssets(previewDeposit(x)) ~= x",
    diff < 1_000_000n,
    `${backToAssets} vs ${DEPOSIT} (|diff| ${diff})`
  );

  const maxDep = await retry(() => vault.maxDeposit(USER));
  check("maxDeposit(user) >= our deposit (vault open)", maxDep >= DEPOSIT, maxDep.toString());

  // --- Simulated deposit via eth_call STATE OVERRIDES ---
  // Give USER a USDC balance (slot 9) and an allowance to the vault (slot 10),
  // then statically execute deposit() — proves the real deposit path succeeds
  // against live state without sending a tx.
  const balSlot = mapSlot(USER, 9);
  const allowOuter = mapSlot(USER, 10); // allowance[user]
  const allowSlot = ethers.keccak256(
    ethers.concat([ethers.zeroPadValue(VAULT, 32), allowOuter])
  ); // allowance[user][vault]
  const hex = (v) => ethers.toBeHex(v, 32);

  const overrides = {
    [USDC]: {
      stateDiff: {
        [balSlot]: hex(DEPOSIT * 2n),
        [allowSlot]: hex(DEPOSIT * 2n),
      },
    },
  };

  // Confirm the overrides take: balance + allowance read back as set.
  const balRes = await retry(() =>
    provider.send("eth_call", [
      { to: USDC, data: usdcIface.encodeFunctionData("balanceOf", [USER]) },
      "latest",
      overrides,
    ])
  );
  const bal = usdcIface.decodeFunctionResult("balanceOf", balRes)[0];
  check("override: USDC balanceOf(user) funded", bal === DEPOSIT * 2n, bal.toString());

  const allowRes = await retry(() =>
    provider.send("eth_call", [
      { to: USDC, data: usdcIface.encodeFunctionData("allowance", [USER, VAULT]) },
      "latest",
      overrides,
    ])
  );
  const allow = usdcIface.decodeFunctionResult("allowance", allowRes)[0];
  check("override: USDC allowance(user,vault) set", allow === DEPOSIT * 2n, allow.toString());

  // Statically execute deposit() as USER with the overrides in place.
  let depositOk = false;
  let mintedShares = 0n;
  try {
    const res = await retry(() =>
      provider.send("eth_call", [
        {
          from: USER,
          to: VAULT,
          data: vaultIface.encodeFunctionData("deposit", [DEPOSIT, USER]),
        },
        "latest",
        overrides,
      ])
    );
    mintedShares = vaultIface.decodeFunctionResult("deposit", res)[0];
    depositOk = mintedShares > 0n;
  } catch (e) {
    console.log("   deposit() simulation reverted:", e.shortMessage || e.message);
  }
  check(
    "SIMULATED deposit(1000 USDC, user) mints shares",
    depositOk,
    depositOk ? `${mintedShares} shares` : "reverted"
  );
  check(
    "minted shares ~= previewDeposit",
    depositOk && (mintedShares > (previewShares * 99n) / 100n),
    `${mintedShares} vs preview ${previewShares}`
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e.shortMessage || e.message);
  process.exit(2);
});
