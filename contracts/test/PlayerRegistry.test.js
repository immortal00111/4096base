const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [deployer, alice, bob, carol] = await ethers.getSigners();
  const PlayerRegistry = await ethers.getContractFactory("PlayerRegistry");
  const reg = await PlayerRegistry.deploy();
  await reg.waitForDeployment();
  return { reg, deployer, alice, bob, carol };
}

describe("PlayerRegistry — registration", function () {
  it("registers a name and emits PlayerRegistered", async function () {
    const { reg, alice } = await deployFixture();
    await expect(reg.connect(alice).register("ALICE"))
      .to.emit(reg, "PlayerRegistered")
      .withArgs(alice.address, "ALICE");

    expect(await reg.nameOf(alice.address)).to.equal("ALICE");
    expect(await reg.isRegistered(alice.address)).to.equal(true);
    expect(await reg.playerCount()).to.equal(1n);
  });

  it("reverts on an empty name (EmptyName)", async function () {
    const { reg, alice } = await deployFixture();
    await expect(reg.connect(alice).register("")).to.be.revertedWithCustomError(
      reg,
      "EmptyName"
    );
    expect(await reg.isRegistered(alice.address)).to.equal(false);
    expect(await reg.playerCount()).to.equal(0n);
  });

  it("re-registering updates the name without duplicating the player", async function () {
    const { reg, alice } = await deployFixture();
    await reg.connect(alice).register("ALICE");
    await expect(reg.connect(alice).register("ALICE2"))
      .to.emit(reg, "PlayerRegistered")
      .withArgs(alice.address, "ALICE2");

    expect(await reg.nameOf(alice.address)).to.equal("ALICE2");
    // Still exactly one entry — a name update must not re-append.
    expect(await reg.playerCount()).to.equal(1n);
    expect(await reg.playerAt(0)).to.equal(alice.address);
  });

  it("preserves the high score across a name update", async function () {
    const { reg, alice } = await deployFixture();
    await reg.connect(alice).register("ALICE");
    await reg.connect(alice).submitScore(500n);
    await reg.connect(alice).register("RENAMED");
    expect(await reg.highScoreOf(alice.address)).to.equal(500n);
  });
});

describe("PlayerRegistry — scores", function () {
  it("reverts submitScore when not registered (NotRegistered)", async function () {
    const { reg, bob } = await deployFixture();
    await expect(
      reg.connect(bob).submitScore(100n)
    ).to.be.revertedWithCustomError(reg, "NotRegistered");
  });

  it("records a score and emits ScoreSubmitted", async function () {
    const { reg, alice } = await deployFixture();
    await reg.connect(alice).register("ALICE");
    await expect(reg.connect(alice).submitScore(1234n))
      .to.emit(reg, "ScoreSubmitted")
      .withArgs(alice.address, 1234n);
    expect(await reg.highScoreOf(alice.address)).to.equal(1234n);
  });

  it("keeps only the highest score across submissions", async function () {
    const { reg, alice } = await deployFixture();
    await reg.connect(alice).register("ALICE");

    await reg.connect(alice).submitScore(100n);
    expect(await reg.highScoreOf(alice.address)).to.equal(100n);

    // A lower score does not lower the high score...
    await expect(reg.connect(alice).submitScore(50n))
      .to.emit(reg, "ScoreSubmitted")
      .withArgs(alice.address, 50n);
    expect(await reg.highScoreOf(alice.address)).to.equal(100n);

    // ...but a higher one updates it.
    await reg.connect(alice).submitScore(300n);
    expect(await reg.highScoreOf(alice.address)).to.equal(300n);

    // Equal score is a no-op for the stored max.
    await reg.connect(alice).submitScore(300n);
    expect(await reg.highScoreOf(alice.address)).to.equal(300n);
  });
});

describe("PlayerRegistry — views & enumeration", function () {
  it("returns defaults for unknown addresses", async function () {
    const { reg, carol } = await deployFixture();
    expect(await reg.nameOf(carol.address)).to.equal("");
    expect(await reg.highScoreOf(carol.address)).to.equal(0n);
    expect(await reg.isRegistered(carol.address)).to.equal(false);
  });

  it("enumerates all registered players via getPlayers / playerAt", async function () {
    const { reg, alice, bob, carol } = await deployFixture();
    await reg.connect(alice).register("ALICE");
    await reg.connect(bob).register("BOB");
    await reg.connect(carol).register("CAROL");

    expect(await reg.playerCount()).to.equal(3n);
    const list = await reg.getPlayers();
    expect(list).to.deep.equal([alice.address, bob.address, carol.address]);
    expect(await reg.playerAt(1)).to.equal(bob.address);
  });

  it("getAllPlayers returns addresses, names, and high scores in parallel", async function () {
    const { reg, alice, bob } = await deployFixture();
    await reg.connect(alice).register("ALICE");
    await reg.connect(alice).submitScore(900n);
    await reg.connect(bob).register("BOB");
    await reg.connect(bob).submitScore(700n);

    const [addrs, names, scores] = await reg.getAllPlayers();
    expect(addrs).to.deep.equal([alice.address, bob.address]);
    expect(names).to.deep.equal(["ALICE", "BOB"]);
    expect(scores).to.deep.equal([900n, 700n]);
  });
});
