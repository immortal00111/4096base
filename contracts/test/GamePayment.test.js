const { expect } = require("chai");
const { ethers } = require("hardhat");

const BASE_FEE = ethers.parseEther("0.000003");
const DISCOUNT_FEE = ethers.parseEther("0.0000003");
const RECEIVER = "0x678C2FBC740c22edbcA38F4F1eb516DaEbF2D222";

async function deployFixture() {
  const [owner, player, other, newReceiver] = await ethers.getSigners();

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

  return { game, nft, owner, player, other, newReceiver };
}

describe("DiscountNFT", function () {
  it("mints one free NFT to the caller", async function () {
    const { nft, player } = await deployFixture();
    await expect(nft.connect(player).mint())
      .to.emit(nft, "DiscountMinted")
      .withArgs(player.address, 0);
    expect(await nft.balanceOf(player.address)).to.equal(1n);
    expect(await nft.ownerOf(0)).to.equal(player.address);
    expect(await nft.hasMinted(player.address)).to.equal(true);
  });

  it("enforces one-per-wallet", async function () {
    const { nft, player } = await deployFixture();
    await nft.connect(player).mint();
    await expect(nft.connect(player).mint()).to.be.revertedWithCustomError(
      nft,
      "AlreadyMinted"
    );
    expect(await nft.balanceOf(player.address)).to.equal(1n);
  });

  it("lets different wallets each mint once", async function () {
    const { nft, player, other } = await deployFixture();
    await nft.connect(player).mint();
    await nft.connect(other).mint();
    expect(await nft.nextTokenId()).to.equal(2n);
  });
});

describe("GamePayment — fees", function () {
  it("charges the base fee for a wallet without the NFT", async function () {
    const { game, player } = await deployFixture();
    expect(await game.currentFee(player.address)).to.equal(BASE_FEE);

    await expect(game.connect(player).pay({ value: BASE_FEE }))
      .to.emit(game, "GamePaid")
      .withArgs(player.address, BASE_FEE, anyUint());
  });

  it("charges the discounted fee for an NFT holder", async function () {
    const { game, nft, player } = await deployFixture();
    await nft.connect(player).mint();
    expect(await game.currentFee(player.address)).to.equal(DISCOUNT_FEE);

    await expect(game.connect(player).pay({ value: DISCOUNT_FEE })).to.emit(
      game,
      "GamePaid"
    );
  });

  it("reverts when payment is below the required fee", async function () {
    const { game, player } = await deployFixture();
    await expect(
      game.connect(player).pay({ value: DISCOUNT_FEE }) // too low without NFT
    ).to.be.revertedWithCustomError(game, "IncorrectPayment");
  });

  it("an NFT holder underpaying the base fee but meeting discount succeeds", async function () {
    const { game, nft, player } = await deployFixture();
    await nft.connect(player).mint();
    // discount fee < base fee; paying discount fee must succeed for a holder.
    await expect(game.connect(player).pay({ value: DISCOUNT_FEE })).to.emit(
      game,
      "GamePaid"
    );
  });

  it("accepts overpayment and retains it", async function () {
    const { game, player } = await deployFixture();
    const over = BASE_FEE * 2n;
    await game.connect(player).pay({ value: over });
    expect(await ethers.provider.getBalance(await game.getAddress())).to.equal(
      over
    );
  });
});

describe("GamePayment — withdrawal", function () {
  it("withdraws the full balance to the receiver", async function () {
    const { game, owner, player } = await deployFixture();
    await game.connect(player).pay({ value: BASE_FEE });
    await game.connect(player).pay({ value: BASE_FEE });

    const before = await ethers.provider.getBalance(RECEIVER);
    await expect(game.connect(owner).withdraw())
      .to.emit(game, "Withdrawn")
      .withArgs(RECEIVER, BASE_FEE * 2n);
    const after = await ethers.provider.getBalance(RECEIVER);

    expect(after - before).to.equal(BASE_FEE * 2n);
    expect(await ethers.provider.getBalance(await game.getAddress())).to.equal(
      0n
    );
  });

  it("reverts withdraw when there is nothing to withdraw", async function () {
    const { game, owner } = await deployFixture();
    await expect(game.connect(owner).withdraw()).to.be.revertedWithCustomError(
      game,
      "NothingToWithdraw"
    );
  });

  it("withdraws to an updated receiver", async function () {
    const { game, owner, player, newReceiver } = await deployFixture();
    await game.connect(owner).setReceiver(newReceiver.address);
    await game.connect(player).pay({ value: BASE_FEE });

    await expect(game.connect(owner).withdraw()).to.changeEtherBalance(
      newReceiver,
      BASE_FEE
    );
  });
});

describe("GamePayment — access control", function () {
  it("blocks non-owner from setFees", async function () {
    const { game, other } = await deployFixture();
    await expect(
      game.connect(other).setFees(1, 1)
    ).to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount");
  });

  it("blocks non-owner from setReceiver", async function () {
    const { game, other } = await deployFixture();
    await expect(
      game.connect(other).setReceiver(other.address)
    ).to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount");
  });

  it("blocks non-owner from setDiscountNFT", async function () {
    const { game, other } = await deployFixture();
    await expect(
      game.connect(other).setDiscountNFT(other.address)
    ).to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount");
  });

  it("blocks non-owner from withdraw", async function () {
    const { game, other, player } = await deployFixture();
    await game.connect(player).pay({ value: BASE_FEE });
    await expect(
      game.connect(other).withdraw()
    ).to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount");
  });

  it("lets the owner update fees and reflects them in currentFee", async function () {
    const { game, owner, player } = await deployFixture();
    const newBase = ethers.parseEther("0.00001");
    const newDiscount = ethers.parseEther("0.000001");
    await expect(game.connect(owner).setFees(newBase, newDiscount))
      .to.emit(game, "FeesUpdated")
      .withArgs(newBase, newDiscount);
    expect(await game.currentFee(player.address)).to.equal(newBase);
  });
});

describe("GamePayment — reentrancy", function () {
  it("blocks reentrant withdraw via a malicious receiver/owner", async function () {
    const [owner, player] = await ethers.getSigners();

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

    // Deploy attacker, point the contract's receiver at it, and hand it
    // ownership so it is allowed to call withdraw().
    const Attacker = await ethers.getContractFactory("ReentrantAttacker");
    const attacker = await Attacker.deploy(await game.getAddress());
    await attacker.waitForDeployment();

    await game.connect(owner).setReceiver(await attacker.getAddress());
    await game.connect(owner).transferOwnership(await attacker.getAddress());

    // Fund the contract with a couple of plays.
    await game.connect(player).pay({ value: BASE_FEE });
    await game.connect(player).pay({ value: BASE_FEE });

    const total = BASE_FEE * 2n;

    // Attack triggers withdraw -> receive() tries to re-enter withdraw().
    // The nonReentrant guard must block the nested call; the outer call still
    // succeeds and transfers the whole balance exactly once.
    await attacker.attack();

    expect(await attacker.reentered()).to.equal(true);
    expect(await ethers.provider.getBalance(await game.getAddress())).to.equal(
      0n
    );
    expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(
      total
    );
  });
});

// Helper: chai matcher for an unspecified uint (used for block.timestamp).
function anyUint() {
  const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
  return anyValue;
}
