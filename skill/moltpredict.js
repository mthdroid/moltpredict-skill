const { ethers } = require('ethers');

const CONFIG = {
    chainId: 84532,
    rpc: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    predict: '0x51736f099058E6D2CBa8346E0E43E4Afb695F3F8'
};

const PREDICT_ABI = [
    "function marketCount() view returns (uint256)",
    "function getMarket(uint256) view returns (string, address, uint256, uint256, uint256, bool, bool)",
    "function getUserBets(uint256, address) view returns (uint256, uint256)",
    "function createMarket(string, uint256) returns (uint256)",
    "function bet(uint256, bool, uint256)",
    "function resolveMarket(uint256, bool)",
    "function claimWinnings(uint256)"
];

const ERC20_ABI = [
    "function approve(address, uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

class MoltPredictSkill {
    constructor({ privateKey }) {
        this.provider = new ethers.JsonRpcProvider(CONFIG.rpc);
        if (privateKey) {
            this.wallet = new ethers.Wallet(privateKey, this.provider);
        }
    }

    async listMarkets() {
        const predict = new ethers.Contract(CONFIG.predict, PREDICT_ABI, this.provider);
        const count = await predict.marketCount();
        const markets = [];
        for (let i = 1; i <= count; i++) {
            const [question, creator, endTime, yesPool, noPool, resolved, outcome] = await predict.getMarket(i);
            markets.push({
                id: i, question, creator,
                endTime: new Date(Number(endTime) * 1000).toISOString(),
                yesPool: ethers.formatUnits(yesPool, 6),
                noPool: ethers.formatUnits(noPool, 6),
                resolved, outcome,
                active: !resolved && Date.now() / 1000 < Number(endTime)
            });
        }
        return markets;
    }

    async placeBet(marketId, isYes, amountUsdc) {
        const predict = new ethers.Contract(CONFIG.predict, PREDICT_ABI, this.wallet);
        const usdc = new ethers.Contract(CONFIG.usdc, ERC20_ABI, this.wallet);
        const amount = ethers.parseUnits(amountUsdc.toString(), 6);

        const approveTx = await usdc.approve(CONFIG.predict, amount);
        await approveTx.wait();

        const tx = await predict.bet(marketId, isYes, amount);
        const receipt = await tx.wait();
        return { success: true, txHash: receipt.hash, side: isYes ? 'YES' : 'NO', amount: amountUsdc };
    }

    async createMarket(question, durationHours = 24) {
        const predict = new ethers.Contract(CONFIG.predict, PREDICT_ABI, this.wallet);
        const tx = await predict.createMarket(question, durationHours * 3600);
        const receipt = await tx.wait();
        return { success: true, txHash: receipt.hash };
    }

    async resolve(marketId, outcome) {
        const predict = new ethers.Contract(CONFIG.predict, PREDICT_ABI, this.wallet);
        const tx = await predict.resolveMarket(marketId, outcome);
        await tx.wait();
        return { success: true };
    }

    async claim(marketId) {
        const predict = new ethers.Contract(CONFIG.predict, PREDICT_ABI, this.wallet);
        const tx = await predict.claimWinnings(marketId);
        await tx.wait();
        return { success: true };
    }
}

// CLI
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const skill = new MoltPredictSkill({ privateKey: process.env.MOLTPREDICT_PRIVATE_KEY });

    switch (command) {
        case 'markets': {
            const markets = await skill.listMarkets();
            markets.forEach(m => {
                const status = m.resolved ? (m.outcome ? 'YES won' : 'NO won') : (m.active ? 'Active' : 'Ended');
                console.log(`#${m.id} [${status}] ${m.question}`);
                console.log(`   YES: ${m.yesPool} USDC | NO: ${m.noPool} USDC`);
            });
            if (markets.length === 0) console.log('No markets yet.');
            break;
        }
        case 'bet': {
            const result = await skill.placeBet(parseInt(args[1]), args[2] === 'yes', parseFloat(args[3]));
            console.log(`Bet placed: ${result.amount} USDC on ${result.side} | TX: ${result.txHash}`);
            break;
        }
        case 'create': {
            const question = args.slice(1, -1).join(' ');
            const hours = parseInt(args[args.length - 1]) || 24;
            const result = await skill.createMarket(question, hours);
            console.log(`Market created! TX: ${result.txHash}`);
            break;
        }
        case 'resolve': {
            await skill.resolve(parseInt(args[1]), args[2] === 'yes');
            console.log('Market resolved!');
            break;
        }
        case 'claim': {
            await skill.claim(parseInt(args[1]));
            console.log('Winnings claimed!');
            break;
        }
        default:
            console.log(`MoltPredict - Agent Prediction Market
Commands:
  markets              - List all prediction markets
  create <question> <hours> - Create a new market
  bet <id> <yes|no> <amount> - Bet USDC on a market
  resolve <id> <yes|no> - Resolve a market
  claim <id>           - Claim winnings`);
    }
}

module.exports = { MoltPredictSkill };
if (require.main === module) main().catch(console.error);
