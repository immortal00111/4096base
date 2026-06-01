// Deploy the on-chain pieces of 4096base to Base Sepolia (testnet) ONLY:
//   - PlayerRegistry   — on-chain accounts (names) + self-reported high scores
//   - PremiumNFT      ("4096 Premium")  — free, one-per-wallet "early supporter"
//   - AchievementBadge ("4096 Champion") — free, one-per-wallet "reached 4096"
//
//   npx hardhat run scripts/deploy.js --network baseSepolia
//
// The game is FREE: there is no payment, fee, fund, or custody contract. None of
// these contracts holds or moves funds. Requires PRIVATE_KEY in contracts/.env
// (a Base Sepolia test wallet funded from a faucet). This script has no mainnet
// path.

const hre = require("hardhat");

async function main() {
  const net = hre.network.name;
  if (net !== "baseSepolia" && net !== "hardhat" && net !== "localhost") {
    throw new Error(
      `Refusing to deploy to network "${net}". This script targets Base Sepolia testnet only.`
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

  // 1) Player registry — on-chain accounts + high scores (holds no funds).
  const PlayerRegistry = await hre.ethers.getContractFactory("PlayerRegistry");
  const registry = await PlayerRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("PlayerRegistry:  ", registryAddress);

  // 2) Premium / early-supporter NFT.
  const PremiumNFT = await hre.ethers.getContractFactory("PremiumNFT");
  const premium = await PremiumNFT.deploy();
  await premium.waitForDeployment();
  const premiumAddress = await premium.getAddress();
  console.log("PremiumNFT:      ", premiumAddress);

  // 3) "Reached 4096" winner badge — offered by the UI on reaching 4096.
  const AchievementBadge = await hre.ethers.getContractFactory("AchievementBadge");
  const badge = await AchievementBadge.deploy();
  await badge.waitForDeployment();
  const badgeAddress = await badge.getAddress();
  console.log("AchievementBadge:", badgeAddress);

  console.log("\n--- Frontend env (.env / .env.local in project root) ---");
  console.log(`VITE_PLAYER_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`VITE_PREMIUM_NFT_ADDRESS=${premiumAddress}`);
  console.log(`VITE_ACHIEVEMENT_BADGE_ADDRESS=${badgeAddress}`);
  console.log("VITE_CHAIN_ID=84532");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
