const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 86400;

async function deployFixture() {
  const [deployer, alice, bob, carol] = await ethers.getSigners();

  const PlayerRegistry = await ethers.getContractFactory("PlayerRegistry");
  const reg = await PlayerRegistry.deploy();
  await reg.waitForDeployment();

  // alice & bob are registered; carol is NOT.
  await reg.connect(alice).register("ALICE");
  await reg.connect(bob).register("BOB");

  const DailyCheckIn = await ethers.getContractFactory("DailyCheckIn");
  const checkin = await DailyCheckIn.deploy(await reg.getAddress());
  await checkin.waitForDeployment();

  return { reg, checkin, alice, bob, carol };
}

// A UTC day index safely in the future of the current block time.
async function futureDay() {
  const now = await time.latest();
  return Math.floor(now / DAY) + 2;
}

// Mine the next checkIn() tx at a specific UTC day (with an in-day offset).
async function checkInOnDay(checkin, signer, day, offsetSeconds = 3600) {
  await time.setNextBlockTimestamp(day * DAY + offsetSeconds);
  return checkin.connect(signer).checkIn();
}

describe("DailyCheckIn — gating & first check-in", function () {
  it("reverts for an unregistered wallet (NotRegistered)", async function () {
    const { checkin, carol } = await loadFixture(deployFixture);
    await expect(checkin.connect(carol).checkIn()).to.be.revertedWithCustomError(
      checkin,
      "NotRegistered"
    );
  });

  it("rejects a zero registry address in the constructor", async function () {
    const DailyCheckIn = await ethers.getContractFactory("DailyCheckIn");
    await expect(
      DailyCheckIn.deploy(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(DailyCheckIn, "ZeroAddress");
  });

  it("first check-in mints exactly one NFT, sets streak 1, and emits CheckedIn", async function () {
    const { checkin, alice } = await loadFixture(deployFixture);
    const d0 = await futureDay();

    await expect(checkInOnDay(checkin, alice, d0))
      .to.emit(checkin, "CheckedIn")
      .withArgs(alice.address, d0, 1);

    expect(await checkin.balanceOf(alice.address)).to.equal(1n);
    expect(await checkin.ownerOf(0)).to.equal(alice.address);
    expect(await checkin.hasCheckInNFT(alice.address)).to.equal(true);
    expect(await checkin.nextTokenId()).to.equal(1n);
    expect(await checkin.currentStreak(alice.address)).to.equal(1n);
    expect(await checkin.longestStreak(alice.address)).to.equal(1n);
    expect(await checkin.lastCheckInDay(alice.address)).to.equal(d0);
    expect(await checkin.totalCheckIns(alice.address)).to.equal(1n);
  });

  it("reverts a second check-in on the same UTC day (AlreadyCheckedInToday)", async function () {
    const { checkin, alice } = await loadFixture(deployFixture);
    const d0 = await futureDay();
    await checkInOnDay(checkin, alice, d0, 3600);
    // Later the same day (still d0): must revert.
    await time.setNextBlockTimestamp(d0 * DAY + 50000);
    await expect(checkin.connect(alice).checkIn()).to.be.revertedWithCustomError(
      checkin,
      "AlreadyCheckedInToday"
    );
    expect(await checkin.totalCheckIns(alice.address)).to.equal(1n);
  });
});

describe("DailyCheckIn — streak logic", function () {
  it("increments the streak on consecutive days without minting again", async function () {
    const { checkin, alice } = await loadFixture(deployFixture);
    const d0 = await futureDay();

    await checkInOnDay(checkin, alice, d0);
    await checkInOnDay(checkin, alice, d0 + 1);
    await expect(checkInOnDay(checkin, alice, d0 + 2))
      .to.emit(checkin, "CheckedIn")
      .withArgs(alice.address, d0 + 2, 3);

    expect(await checkin.currentStreak(alice.address)).to.equal(3n);
    expect(await checkin.longestStreak(alice.address)).to.equal(3n);
    expect(await checkin.totalCheckIns(alice.address)).to.equal(3n);
    // Still only one NFT ever.
    expect(await checkin.balanceOf(alice.address)).to.equal(1n);
    expect(await checkin.nextTokenId()).to.equal(1n);
  });

  it("resets the streak to 1 after a gap, preserving the longest", async function () {
    const { checkin, alice } = await loadFixture(deployFixture);
    const d0 = await futureDay();

    await checkInOnDay(checkin, alice, d0); // streak 1
    await checkInOnDay(checkin, alice, d0 + 1); // streak 2
    await checkInOnDay(checkin, alice, d0 + 2); // streak 3 (longest = 3)

    // Skip d0+3; check in on d0+4 → gap → streak resets to 1.
    await expect(checkInOnDay(checkin, alice, d0 + 4))
      .to.emit(checkin, "CheckedIn")
      .withArgs(alice.address, d0 + 4, 1);

    expect(await checkin.currentStreak(alice.address)).to.equal(1n);
    expect(await checkin.longestStreak(alice.address)).to.equal(3n);
    expect(await checkin.totalCheckIns(alice.address)).to.equal(4n);
  });

  it("tracks the longest streak across multiple runs", async function () {
    const { checkin, alice } = await loadFixture(deployFixture);
    const d0 = await futureDay();

    // First run: 2-day streak.
    await checkInOnDay(checkin, alice, d0);
    await checkInOnDay(checkin, alice, d0 + 1); // longest = 2
    // Gap, then a 4-day run → longest should become 4.
    await checkInOnDay(checkin, alice, d0 + 5); // streak 1
    await checkInOnDay(checkin, alice, d0 + 6); // 2
    await checkInOnDay(checkin, alice, d0 + 7); // 3
    await checkInOnDay(checkin, alice, d0 + 8); // 4

    expect(await checkin.currentStreak(alice.address)).to.equal(4n);
    expect(await checkin.longestStreak(alice.address)).to.equal(4n);
  });
});

describe("DailyCheckIn — views & isolation", function () {
  it("canCheckIn flips false after checking in, true again next day", async function () {
    const { checkin, alice } = await loadFixture(deployFixture);
    const d0 = await futureDay();

    // Before any check-in (and registered): can check in.
    expect(await checkin.canCheckIn(alice.address)).to.equal(true);

    await checkInOnDay(checkin, alice, d0);
    // Same day now (advance a little, still d0): cannot.
    await time.setNextBlockTimestamp(d0 * DAY + 70000);
    await ethers.provider.send("evm_mine", []);
    expect(await checkin.canCheckIn(alice.address)).to.equal(false);

    // Next day: can again.
    await time.setNextBlockTimestamp((d0 + 1) * DAY + 10);
    await ethers.provider.send("evm_mine", []);
    expect(await checkin.canCheckIn(alice.address)).to.equal(true);
  });

  it("defaults are zero/false for a wallet that never checked in", async function () {
    const { checkin, carol } = await loadFixture(deployFixture);
    expect(await checkin.currentStreak(carol.address)).to.equal(0n);
    expect(await checkin.longestStreak(carol.address)).to.equal(0n);
    expect(await checkin.lastCheckInDay(carol.address)).to.equal(0n);
    expect(await checkin.totalCheckIns(carol.address)).to.equal(0n);
    expect(await checkin.hasCheckInNFT(carol.address)).to.equal(false);
    // canCheckIn is purely day-based (registration is enforced in checkIn()).
    expect(await checkin.canCheckIn(carol.address)).to.equal(true);
  });

  it("keeps separate streaks per wallet and mints one NFT each", async function () {
    const { checkin, alice, bob } = await loadFixture(deployFixture);
    const d0 = await futureDay();

    await checkInOnDay(checkin, alice, d0, 100);
    await checkInOnDay(checkin, bob, d0, 200);
    await checkInOnDay(checkin, alice, d0 + 1, 100);

    expect(await checkin.currentStreak(alice.address)).to.equal(2n);
    expect(await checkin.currentStreak(bob.address)).to.equal(1n);
    expect(await checkin.balanceOf(alice.address)).to.equal(1n);
    expect(await checkin.balanceOf(bob.address)).to.equal(1n);
    expect(await checkin.nextTokenId()).to.equal(2n); // one per wallet
    expect(await checkin.ownerOf(0)).to.equal(alice.address);
    expect(await checkin.ownerOf(1)).to.equal(bob.address);
  });
});
