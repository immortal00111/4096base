const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, player, other] = await ethers.getSigners();
  const PremiumNFT = await ethers.getContractFactory("PremiumNFT");
  const nft = await PremiumNFT.deploy();
  await nft.waitForDeployment();
  return { nft, owner, player, other };
}

describe("PremiumNFT", function () {
  it("has the expected name and symbol", async function () {
    const { nft } = await deployFixture();
    expect(await nft.name()).to.equal("4096 Premium");
    expect(await nft.symbol()).to.equal("4096P");
  });

  it("mints one free NFT to the caller and emits PremiumMinted", async function () {
    const { nft, player } = await deployFixture();
    await expect(nft.connect(player).mint())
      .to.emit(nft, "PremiumMinted")
      .withArgs(player.address, 0);
    expect(await nft.balanceOf(player.address)).to.equal(1n);
    expect(await nft.ownerOf(0)).to.equal(player.address);
    expect(await nft.hasMinted(player.address)).to.equal(true);
  });

  it("enforces one-per-wallet (AlreadyMinted revert)", async function () {
    const { nft, player } = await deployFixture();
    await nft.connect(player).mint();
    await expect(nft.connect(player).mint()).to.be.revertedWithCustomError(
      nft,
      "AlreadyMinted"
    );
    expect(await nft.balanceOf(player.address)).to.equal(1n);
  });

  it("lets different wallets each mint once with incrementing ids", async function () {
    const { nft, player, other } = await deployFixture();
    await expect(nft.connect(player).mint())
      .to.emit(nft, "PremiumMinted")
      .withArgs(player.address, 0);
    await expect(nft.connect(other).mint())
      .to.emit(nft, "PremiumMinted")
      .withArgs(other.address, 1);
    expect(await nft.nextTokenId()).to.equal(2n);
  });
});
