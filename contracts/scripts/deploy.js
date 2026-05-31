// Deploy DiscountNFT + GamePayment to Base Sepolia (testnet) ONLY.
//
//   npx hardhat run scripts/deploy.js --network baseSepolia
//
// Requires PRIVATE_KEY in contracts/.env (a Base Sepolia test wallet funded
// from a faucet). This script intentionally has no mainnet path.

const hre = require("hardhat");

// Where withdrawn play fees are sent. Owner can change this later on-chain.
const RECEIVER = "0x678C2FBC740c22edbcA38F4F1eb516DaEbF2D222";

// Fees in ETH (converted to wei below).
const BASE_FEE = hre.ethers.parseEther("0.000003");
const DISCOUNT_FEE = hre.ethers.parseEther("0.0000003");

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

  // 1) Discount NFT.
  const DiscountNFT = await hre.ethers.getContractFactory("DiscountNFT");
  const nft = await DiscountNFT.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log("DiscountNFT:", nftAddress);

  // 2) GamePayment (owner = deployer, receiver = constant above).
  const GamePayment = await hre.ethers.getContractFactory("GamePayment");
  const game = await GamePayment.deploy(
    deployer.address,
    RECEIVER,
    nftAddress,
    BASE_FEE,
    DISCOUNT_FEE
  );
  await game.waitForDeployment();
  const gameAddress = await game.getAddress();
  console.log("GamePayment:", gameAddress);

  // 3) Achievement badge ("4096 Champion") — free, one-per-wallet, offered by
  //    the UI on reaching 4096. No constructor args.
  const AchievementBadge = await hre.ethers.getContractFactory("AchievementBadge");
  const badge = await AchievementBadge.deploy();
  await badge.waitForDeployment();
  const badgeAddress = await badge.getAddress();
  console.log("AchievementBadge:", badgeAddress);

  console.log("\n--- Frontend env (.env / .env.local in project root) ---");
  console.log(`VITE_GAME_PAYMENT_ADDRESS=${gameAddress}`);
  console.log(`VITE_DISCOUNT_NFT_ADDRESS=${nftAddress}`);
  console.log(`VITE_ACHIEVEMENT_BADGE_ADDRESS=${badgeAddress}`);
  console.log("VITE_CHAIN_ID=84532");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
