const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const RPC = "https://sepolia.base.org";

  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    console.error("ERROR: Set DEPLOYER_PRIVATE_KEY in .env");
    process.exit(1);
  }

  // Load compiled artifact
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "MoltPredict.sol",
    "MoltPredict.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

  console.log("Deployer:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("ETH balance:", ethers.formatEther(balance));

  console.log("\nDeploying MoltPredict to Base Sepolia...");
  console.log("USDC address:", USDC_BASE_SEPOLIA);

  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );
  const contract = await factory.deploy(USDC_BASE_SEPOLIA);

  console.log("TX hash:", contract.deploymentTransaction().hash);
  console.log("Waiting for confirmation...");

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("\nMoltPredict deployed to:", address);
  console.log("Explorer:", `https://sepolia.basescan.org/address/${address}`);
  console.log("Deploy TX:", `https://sepolia.basescan.org/tx/${contract.deploymentTransaction().hash}`);
  console.log("\nUpdate this address in:");
  console.log("  - skill/moltpredict.js (CONFIG.predict)");
  console.log("  - skill/moltpredict-skill.json (networks.testnet.contracts.predict)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
