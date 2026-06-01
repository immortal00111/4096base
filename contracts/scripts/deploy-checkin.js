// Deploy ONLY the DailyCheckIn contract, wired to an ALREADY-deployed
// PlayerRegistry. Does NOT touch PlayerRegistry / PremiumNFT / AchievementBadge.
//
//   npx hardhat run scripts/deploy-checkin.js --network baseSepolia
//
// The registry address is read from deployments.json for the target network.
// DailyCheckIn holds no funds (not payable, no admin). Requires PRIVATE_KEY in
// contracts/.env.

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Testnet/local only here — deliberately exclude mainnet from this one-off.
const ALLOWED = ["baseSepolia", "hardhat", "localhost"];

async function main() {
  const net = hre.network.name;
  if (!ALLOWED.includes(net)) {
    throw new Error(
      `Refusing to deploy to network "${net}". Allowed: ${ALLOWED.join(", ")}.`
    );
  }

  const deploymentsPath = path.join(__dirname, "..", "..", "deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const registryAddress = deployments[net] && deployments[net].playerRegistry;
  if (!registryAddress) {
    throw new Error(`No playerRegistry recorded for "${net}" in deployments.json`);
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Network:        ", net, `(chainId ${hre.network.config.chainId})`);
  console.log("Deployer:       ", deployer.address);
  console.log(
    "Balance:        ",
    hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)),
    "ETH"
  );
  console.log("PlayerRegistry: ", registryAddress, "(existing — not redeployed)");

  // Sanity: the registry must already have code on this network.
  const regCode = await hre.ethers.provider.getCode(registryAddress);
  if (regCode === "0x") {
    throw new Error(`No code at PlayerRegistry ${registryAddress} on ${net}`);
  }

  const DailyCheckIn = await hre.ethers.getContractFactory("DailyCheckIn");
  const checkin = await DailyCheckIn.deploy(registryAddress);
  await checkin.waitForDeployment();
  const checkinAddress = await checkin.getAddress();

  console.log("\nDailyCheckIn:   ", checkinAddress);
  console.log("registry() ->   ", await checkin.registry());
  console.log(`\nVITE_DAILY_CHECKIN_ADDRESS=${checkinAddress}`);
  console.log(`Record under "${net}".dailyCheckIn in deployments.json.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
