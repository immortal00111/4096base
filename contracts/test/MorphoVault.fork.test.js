// Base-mainnet FORK test for the "4096 Fund" feature.
//
// This does NOT deploy anything. It forks Base mainnet into a local in-memory
// sandbox and simulates a user depositing into and withdrawing from the REAL,
// already-deployed Moonwell Flagship USDC MetaMorpho vault (ERC-4626), exactly
// as our non-custodial frontend will (wallet -> vault directly; the app is
// never in the funds path).
//
// Run with:  npm run test:fork   (sets FORK_BASE=1)
// Without FORK_BASE the suite self-skips (the vault has no code on a bare local
// chain), so the normal `npm test` stays fast and offline.

const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

// Verified on Base mainnet (chainId 8453) — see Batch 5 research:
const VAULT = "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca"; // Moonwell Flagship USDC (mwUSDC)
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // canonical Base USDC

// Base USDC is Circle's FiatTokenV2 proxy; its `balances` mapping lives at
// storage slot 9. We mint test USDC by writing that slot directly — this avoids
// impersonating any account (impersonating a *contract* whale trips Hardhat's
// snapshot-revert teardown), so the suite stays self-contained.
const USDC_BALANCE_SLOT = 9;

const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];
const vaultAbi = [
  "function asset() view returns (address)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function deposit(uint256 assets,address receiver) returns (uint256 shares)",
  "function withdraw(uint256 assets,address receiver,address owner) returns (uint256 shares)",
  "function redeem(uint256 shares,address receiver,address owner) returns (uint256 assets)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function maxRedeem(address) view returns (uint256)",
];

const forking = !!process.env.FORK_BASE;
(forking ? describe : describe.skip)(
  "Morpho vault (Base mainnet fork) — non-custodial deposit/withdraw",
  function () {
    this.timeout(600_000); // cold fork fetch from a public RPC can be very slow

    let user, vault, usdc;
    const DEPOSIT = 1_000n * 10n ** 6n; // 1,000 USDC (6 decimals)

    before(async function () {
      [user] = await ethers.getSigners();
      vault = new ethers.Contract(VAULT, vaultAbi, ethers.provider);
      usdc = new ethers.Contract(USDC, erc20Abi, ethers.provider);

      // Confirm we really forked Base: the vault must have code AND read back as
      // the exact USDC ERC-4626 we expect. (We don't assert chainId — Hardhat
      // keeps its default id even when forking; identity proves the fork.)
      expect(await ethers.provider.getCode(VAULT)).to.not.equal("0x");
      expect(await vault.asset()).to.equal(USDC);
      expect(await vault.symbol()).to.equal("mwUSDC");

      // Mint test USDC to the user by writing the balances-mapping storage slot
      // directly (no impersonation needed). slot = keccak256(abi.encode(user,9)).
      const slot = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256"],
          [user.address, USDC_BALANCE_SLOT]
        )
      );
      await helpers.setStorageAt(
        USDC,
        slot,
        ethers.toBeHex(DEPOSIT * 2n, 32)
      );

      expect(await usdc.balanceOf(user.address)).to.equal(DEPOSIT * 2n);
    });

    it("deposits USDC directly into the vault and credits shares to the user", async function () {
      const sharesBefore = await vault.balanceOf(user.address);
      const usdcBefore = await usdc.balanceOf(user.address);

      // Standard ERC-4626 flow: approve, then deposit(assets, receiver=user).
      await usdc.connect(user).approve(VAULT, DEPOSIT);
      await vault.connect(user).deposit(DEPOSIT, user.address);

      const sharesAfter = await vault.balanceOf(user.address);
      const usdcAfter = await usdc.balanceOf(user.address);

      expect(sharesAfter).to.be.gt(sharesBefore); // received vault shares
      expect(usdcBefore - usdcAfter).to.equal(DEPOSIT); // paid exactly DEPOSIT

      // Position readout the UI uses: convertToAssets(shares) ~= deposit
      // (<= deposit due to ERC-4626 rounding in the vault's favour).
      const positionAssets = await vault.convertToAssets(sharesAfter);
      expect(positionAssets).to.be.gt(0n);
      expect(positionAssets).to.be.lte(DEPOSIT);
      expect(DEPOSIT - positionAssets).to.be.lt(100n); // within ~dust of USDC
    });

    it("redeems shares back to the user's own wallet (app never holds funds)", async function () {
      const redeemable = await vault.maxRedeem(user.address);
      expect(redeemable).to.be.gt(0n); // liquidity available to exit

      const usdcBefore = await usdc.balanceOf(user.address);
      await vault.connect(user).redeem(redeemable, user.address, user.address);
      const usdcAfter = await usdc.balanceOf(user.address);

      // USDC came straight back to the user; the app is never in the path.
      const returned = usdcAfter - usdcBefore;
      expect(returned).to.be.gt(0n);
      // Should recover almost all of the deposit (minus tiny rounding).
      expect(returned).to.be.gte(DEPOSIT - 100n);

      // The position is fully exited. We redeem maxRedeem() rather than the raw
      // share balance because on a real MetaMorpho vault maxRedeem() rounds DOWN
      // (it is liquidity-aware and converts assets->shares conservatively), so it
      // can sit a few share-wei below balanceOf(). Any residue is therefore
      // sub-dust (~1 wei of USDC at the pinned block): assert it is worth less
      // than 100 wei of USDC rather than requiring exactly-zero shares, which
      // would be unrealistically strict against the live vault.
      const residualShares = await vault.balanceOf(user.address);
      const residualAssets = await vault.convertToAssets(residualShares);
      expect(residualAssets).to.be.lt(100n); // < 100 wei USDC = dust
    });
  }
);
