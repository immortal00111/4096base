const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, player, other] = await ethers.getSigners();
  const AchievementBadge = await ethers.getContractFactory("AchievementBadge");
  const badge = await AchievementBadge.deploy();
  await badge.waitForDeployment();
  return { badge, owner, player, other };
}

describe("AchievementBadge", function () {
  it("has the expected name and symbol", async function () {
    const { badge } = await deployFixture();
    expect(await badge.name()).to.equal("4096 Champion");
    expect(await badge.symbol()).to.equal("4096W");
  });

  it("mints a free badge to the caller and emits BadgeMinted", async function () {
    const { badge, player } = await deployFixture();
    await expect(badge.connect(player).mint())
      .to.emit(badge, "BadgeMinted")
      .withArgs(player.address, 0);
    expect(await badge.balanceOf(player.address)).to.equal(1n);
    expect(await badge.ownerOf(0)).to.equal(player.address);
    expect(await badge.hasMinted(player.address)).to.equal(true);
    expect(await badge.nextTokenId()).to.equal(1n);
  });

  it("enforces one-per-wallet (AlreadyMinted revert)", async function () {
    const { badge, player } = await deployFixture();
    await badge.connect(player).mint();
    await expect(badge.connect(player).mint()).to.be.revertedWithCustomError(
      badge,
      "AlreadyMinted"
    );
    expect(await badge.balanceOf(player.address)).to.equal(1n);
  });

  it("lets different wallets each mint once with incrementing ids", async function () {
    const { badge, player, other } = await deployFixture();
    await expect(badge.connect(player).mint())
      .to.emit(badge, "BadgeMinted")
      .withArgs(player.address, 0);
    await expect(badge.connect(other).mint())
      .to.emit(badge, "BadgeMinted")
      .withArgs(other.address, 1);
    expect(await badge.nextTokenId()).to.equal(2n);
  });
});
