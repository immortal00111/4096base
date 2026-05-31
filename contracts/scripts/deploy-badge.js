// Deploy ONLY the AchievementBadge ("4096 Champion") to Base Sepolia (testnet).
// Leaves the already-deployed GamePayment and DiscountNFT untouched.
//
//   npx hardhat run scripts/deploy-badge.js --network baseSepolia
//
// Requires PRIVATE_KEY in contracts/.env. No mainnet path.

const hre = require("hardhat");

async function main() {
  const net = hre.network.name;
  if (net !== "baseSepolia" && net !== "hardhat" && net !== "localhost") {
    throw new Error(
      `Refusing to deploy to network "${net}". Base Sepolia testnet only.`
    );
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Network:    ", net);
  console.log("Deployer:   ", deployer.address);
  console.log(
    "Balance:    ",
    hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  const AchievementBadge = await hre.ethers.getContractFactory("AchievementBadge");
  const badge = await AchievementBadge.deploy();
  await badge.waitForDeployment();
  const badgeAddress = await badge.getAddress();

  console.log("AchievementBadge:", badgeAddress);
  console.log("name:", await badge.name());
  console.log("symbol:", await badge.symbol());
  console.log("\n--- Add to .env.local in project root ---");
  console.log(`VITE_ACHIEVEMENT_BADGE_ADDRESS=${badgeAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
