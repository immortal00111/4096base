// Property / fuzz tests for GamePayment.
//
// Hardhat has no native fuzzer, so we drive randomized inputs from a SEEDED
// PRNG (mulberry32). Seeding keeps runs reproducible — a failure can always be
// replayed — while still sweeping a wide value space across hundreds of cases.
//
// Properties asserted:
//   1. pay(): under-fee always reverts (no funds taken); exact/over always
//      succeeds, emits GamePaid with the real msg.value, and credits the
//      contract by exactly msg.value — tested both WITH and WITHOUT the
//      discount NFT (i.e. against both discountFee and baseFee).
//   2. access control: no non-owner can withdraw/setFees/setReceiver/
//      setDiscountNFT for ANY arguments; the owner always can.
//   3. withdraw(): always sweeps the FULL balance to the receiver and leaves
//      the contract at exactly zero; reverts NothingToWithdraw at zero balance.

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const BASE_FEE = ethers.parseEther("0.000003");
const DISCOUNT_FEE = ethers.parseEther("0.0000003");
const RECEIVER = "0x678C2FBC740c22edbcA38F4F1eb516DaEbF2D222";

// --- seeded PRNG -----------------------------------------------------------
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// uniform-ish bigint in [0, max] (inclusive); max must be >= 0
function randRange(rng, max) {
  if (max <= 0n) return 0n;
  let v = 0n;
  for (let i = 0; i < 96; i += 32) {
    v = (v << 32n) | BigInt(Math.floor(rng() * 4294967296));
  }
  return v % (max + 1n);
}

async function deployFixture() {
  const signers = await ethers.getSigners();
  const [owner, player, other] = signers;

  const DiscountNFT = await ethers.getContractFactory("DiscountNFT");
  const nft = await DiscountNFT.deploy();
  await nft.waitForDeployment();

  const GamePayment = await ethers.getContractFactory("GamePayment");
  const game = await GamePayment.deploy(
    owner.address,
    RECEIVER,
    await nft.getAddress(),
    BASE_FEE,
    DISCOUNT_FEE
  );
  await game.waitForDeployment();

  // `player` holds the discount NFT; `other` does not.
  await nft.connect(player).mint();

  return { game, nft, owner, player, other, signers };
}

describe("GamePayment — fuzz: pay() amount vs required fee", function () {
  const RUNS = 200;

  it("under-fee reverts and takes nothing; exact/over succeeds and credits exactly msg.value (with & without NFT)", async function () {
    const { game, player, other } = await deployFixture();
    const rng = makeRng(0xc0ffee);
    const gameAddr = await game.getAddress();

    // Sanity: the discount tier really is in effect for the NFT holder.
    expect(await game.currentFee(player.address)).to.equal(DISCOUNT_FEE);
    expect(await game.currentFee(other.address)).to.equal(BASE_FEE);

    let expectedBalance = 0n;

    for (let i = 0; i < RUNS; i++) {
      const useDiscount = rng() < 0.5;
      const payer = useDiscount ? player : other;
      const fee = useDiscount ? DISCOUNT_FEE : BASE_FEE;

      // 0=under, 1=exact, 2=over — bias toward the boundary cases.
      const cat = Math.floor(rng() * 3);
      let amount;
      if (cat === 0) {
        amount = randRange(rng, fee - 1n); // strictly below fee (incl. 0)
      } else if (cat === 1) {
        amount = fee; // exact
      } else {
        amount = fee + randRange(rng, ethers.parseEther("0.5")); // over
      }

      if (amount < fee) {
        await expect(game.connect(payer).pay({ value: amount }))
          .to.be.revertedWithCustomError(game, "IncorrectPayment")
          .withArgs(amount, fee);
      } else {
        await expect(game.connect(payer).pay({ value: amount }))
          .to.emit(game, "GamePaid")
          .withArgs(payer.address, amount, anyValue);
        expectedBalance += amount;
      }

      // INVARIANT: contract balance == sum of all accepted payments.
      expect(await ethers.provider.getBalance(gameAddr)).to.equal(
        expectedBalance
      );
    }
  });
});

describe("GamePayment — fuzz: access control", function () {
  const RUNS = 120;

  it("rejects every non-owner caller for any args; owner always succeeds", async function () {
    const { game, owner, signers } = await deployFixture();
    const rng = makeRng(0x1234abcd);
    const nonOwners = signers.slice(1); // signers[0] is the owner

    for (let i = 0; i < RUNS; i++) {
      const caller = nonOwners[Math.floor(rng() * nonOwners.length)];
      const a = randRange(rng, ethers.parseEther("1000"));
      const b = randRange(rng, ethers.parseEther("1000"));
      const addr = ethers.getAddress(
        "0x" + randRange(rng, (1n << 160n) - 1n).toString(16).padStart(40, "0")
      );

      // Non-owner: every guarded mutator must revert with the OZ error.
      await expect(game.connect(caller).withdraw()).to.be.revertedWithCustomError(
        game,
        "OwnableUnauthorizedAccount"
      );
      await expect(
        game.connect(caller).setFees(a, b)
      ).to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount");
      // setReceiver(0) would hit ZeroAddress first; the access check must fire
      // regardless, so only test non-zero receiver args here.
      if (addr !== ethers.ZeroAddress) {
        await expect(
          game.connect(caller).setReceiver(addr)
        ).to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount");
      }
      await expect(
        game.connect(caller).setDiscountNFT(addr)
      ).to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount");

      // Owner: the same setters succeed and persist.
      await game.connect(owner).setFees(a, b);
      expect(await game.baseFee()).to.equal(a);
      expect(await game.discountFee()).to.equal(b);
      if (addr !== ethers.ZeroAddress) {
        await game.connect(owner).setReceiver(addr);
        expect(await game.receiver()).to.equal(addr);
      }
      await game.connect(owner).setDiscountNFT(addr);
      expect(await game.discountNFT()).to.equal(addr);
    }
  });
});

describe("GamePayment — fuzz: withdraw sweeps full balance to receiver", function () {
  const RUNS = 60;

  it("after arbitrary payments, withdraw sends the entire balance to receiver and leaves zero", async function () {
    const rng = makeRng(0xdecafbad);

    for (let i = 0; i < RUNS; i++) {
      // Fresh contract each iteration so balances are independent.
      const { game, owner, player, other } = await deployFixture();
      const gameAddr = await game.getAddress();

      // Zero-balance withdraw must revert (nothing to sweep).
      await expect(
        game.connect(owner).withdraw()
      ).to.be.revertedWithCustomError(game, "NothingToWithdraw");

      // Make 1..5 accepted payments (>= the applicable fee) from both tiers.
      const nPays = 1 + Math.floor(rng() * 5);
      let deposited = 0n;
      for (let p = 0; p < nPays; p++) {
        const useDiscount = rng() < 0.5;
        const payer = useDiscount ? player : other;
        const fee = useDiscount ? DISCOUNT_FEE : BASE_FEE;
        const amount = fee + randRange(rng, ethers.parseEther("0.25"));
        await game.connect(payer).pay({ value: amount });
        deposited += amount;
      }

      const contractBal = await ethers.provider.getBalance(gameAddr);
      expect(contractBal).to.equal(deposited);

      const recvBefore = await ethers.provider.getBalance(RECEIVER);
      await expect(game.connect(owner).withdraw())
        .to.emit(game, "Withdrawn")
        .withArgs(RECEIVER, contractBal);
      const recvAfter = await ethers.provider.getBalance(RECEIVER);

      // INVARIANT 1: receiver gains exactly the contract's prior balance.
      expect(recvAfter - recvBefore).to.equal(contractBal);
      // INVARIANT 2: contract is fully drained.
      expect(await ethers.provider.getBalance(gameAddr)).to.equal(0n);
    }
  });
});
