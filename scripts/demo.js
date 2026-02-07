const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  const PREDICT_ADDRESS = process.env.MOLTPREDICT_ADDRESS;
  if (!PREDICT_ADDRESS) {
    console.error("Set MOLTPREDICT_ADDRESS in .env to the deployed contract address");
    process.exit(1);
  }
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    console.error("Set DEPLOYER_PRIVATE_KEY in .env");
    process.exit(1);
  }

  const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const RPC = "https://sepolia.base.org";

  // Load ABI from compiled artifact
  const artifactPath = path.join(
    __dirname, "..", "artifacts", "contracts", "MoltPredict.sol", "MoltPredict.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  console.log("Using account:", wallet.address);

  const predict = new ethers.Contract(PREDICT_ADDRESS, artifact.abi, wallet);
  const usdc = new ethers.Contract(USDC_ADDRESS, [
    "function approve(address, uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)"
  ], wallet);

  // Check USDC balance
  const balance = await usdc.balanceOf(wallet.address);
  console.log("USDC balance:", ethers.formatUnits(balance, 6));

  // 1. Create a demo market (24h duration)
  console.log("\n--- Creating demo market ---");
  const createTx = await predict.createMarket(
    "Will AI agents govern 10+ DAOs by March 2026?",
    86400
  );
  const createReceipt = await createTx.wait();
  console.log("Market created! TX:", createReceipt.hash);

  const marketId = await predict.marketCount();
  console.log("Market ID:", marketId.toString());

  // 2. Place a YES bet (1 USDC)
  const betAmount = ethers.parseUnits("1", 6);

  if (balance >= betAmount) {
    console.log("\n--- Placing YES bet (1 USDC) ---");
    const approveTx = await usdc.approve(PREDICT_ADDRESS, betAmount);
    await approveTx.wait();
    console.log("USDC approved");

    const betTx = await predict.bet(marketId, true, betAmount);
    const betReceipt = await betTx.wait();
    console.log("Bet placed! TX:", betReceipt.hash);
  } else {
    console.log("\nInsufficient USDC for demo bet. Need >= 1 USDC.");
    console.log("Get testnet USDC from: https://faucet.circle.com/");
  }

  // 3. Show market state
  console.log("\n--- Market state ---");
  const market = await predict.getMarket(marketId);
  console.log("Question:", market[0]);
  console.log("Creator:", market[1]);
  console.log("End time:", new Date(Number(market[2]) * 1000).toISOString());
  console.log("YES pool:", ethers.formatUnits(market[3], 6), "USDC");
  console.log("NO pool:", ethers.formatUnits(market[4], 6), "USDC");

  console.log("\n--- Demo complete ---");
  console.log("Contract:", PREDICT_ADDRESS);
  console.log("Explorer:", `https://sepolia.basescan.org/address/${PREDICT_ADDRESS}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
