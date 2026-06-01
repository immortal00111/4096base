// Deploy the on-chain pieces of 4096base to Base Sepolia (testnet) or Base
// mainnet:
//   - PlayerRegistry   — on-chain accounts (names) + self-reported high scores
//   - PremiumNFT      ("4096 Premium")  — free, one-per-wallet "early supporter"
//   - AchievementBadge ("4096 Champion") — free, one-per-wallet "reached 4096"
//   - DailyCheckIn     — once-per-UTC-day streak + check-in NFT (needs registry)
//
//   npx hardhat run scripts/deploy.js --network baseSepolia   (testnet)
//   npx hardhat run scripts/deploy.js --network base          (mainnet, real ETH)
//
// The game is FREE: there is no payment, fee, fund, or custody contract. None of
// these contracts holds or moves funds, so deploying to mainnet is safe — it
// just costs real ETH for gas. Requires PRIVATE_KEY in contracts/.env.

const hre = require("hardhat");

// Networks this script is allowed to deploy to.
const ALLOWED = ["baseSepolia", "base", "hardhat", "localhost"];

async function main() {
  const net = hre.network.name;
  if (!ALLOWED.includes(net)) {
    throw new Error(
      `Refusing to deploy to network "${net}". Allowed: ${ALLOWED.join(", ")}.`
    );
  }
  const chainId = hre.network.config.chainId;
  if (net === "base") {
    console.log(
      "⚠️  Deploying to Base MAINNET (chain 8453) — this spends real ETH for gas."
    );
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Network:    ", net, chainId ? `(chainId ${chainId})` : "");
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

  // 4) Daily check-in — verifies registration against the registry just
  //    deployed above (holds no funds).
  const DailyCheckIn = await hre.ethers.getContractFactory("DailyCheckIn");
  const checkin = await DailyCheckIn.deploy(registryAddress);
  await checkin.waitForDeployment();
  const checkinAddress = await checkin.getAddress();
  console.log("DailyCheckIn:    ", checkinAddress);

  console.log("\n--- Deployed addresses ---");
  console.log("PlayerRegistry:  ", registryAddress);
  console.log("PremiumNFT:      ", premiumAddress);
  console.log("AchievementBadge:", badgeAddress);
  console.log("DailyCheckIn:    ", checkinAddress);

  console.log("\n--- Frontend env (.env / .env.local in project root) ---");
  console.log(`VITE_PLAYER_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`VITE_PREMIUM_NFT_ADDRESS=${premiumAddress}`);
  console.log(`VITE_ACHIEVEMENT_BADGE_ADDRESS=${badgeAddress}`);
  console.log(`VITE_DAILY_CHECKIN_ADDRESS=${checkinAddress}`);
  if (chainId) console.log(`VITE_CHAIN_ID=${chainId}`);

  console.log(
    `\nRecord these under "${net}" (chainId ${chainId ?? "?"}) in deployments.json.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
