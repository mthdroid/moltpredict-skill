// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MoltPredict {
    IERC20 public usdc;
    address public owner;
    uint256 public marketCount;
    uint256 public constant FEE_BPS = 200; // 2%

    struct Market {
        string question;
        address creator;
        uint256 endTime;
        uint256 yesPool;
        uint256 noPool;
        bool resolved;
        bool outcome; // true = YES won
        bool feeSent;
        mapping(address => uint256) yesBets;
        mapping(address => uint256) noBets;
        mapping(address => bool) claimed;
    }

    mapping(uint256 => Market) public markets;

    event MarketCreated(uint256 indexed id, string question, address creator, uint256 endTime);
    event BetPlaced(uint256 indexed id, address bettor, bool isYes, uint256 amount);
    event MarketResolved(uint256 indexed id, bool outcome);
    event WinningsClaimed(uint256 indexed id, address bettor, uint256 amount);

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
        owner = msg.sender;
    }

    function createMarket(string calldata _question, uint256 _durationSeconds) external returns (uint256) {
        marketCount++;
        Market storage m = markets[marketCount];
        m.question = _question;
        m.creator = msg.sender;
        m.endTime = block.timestamp + _durationSeconds;
        emit MarketCreated(marketCount, _question, msg.sender, m.endTime);
        return marketCount;
    }

    function bet(uint256 _marketId, bool _isYes, uint256 _amount) external {
        Market storage m = markets[_marketId];
        require(block.timestamp < m.endTime, "Market ended");
        require(!m.resolved, "Already resolved");
        require(_amount > 0, "Amount must be > 0");

        usdc.transferFrom(msg.sender, address(this), _amount);

        if (_isYes) {
            m.yesBets[msg.sender] += _amount;
            m.yesPool += _amount;
        } else {
            m.noBets[msg.sender] += _amount;
            m.noPool += _amount;
        }
        emit BetPlaced(_marketId, msg.sender, _isYes, _amount);
    }

    function resolveMarket(uint256 _marketId, bool _outcome) external {
        Market storage m = markets[_marketId];
        require(msg.sender == m.creator || msg.sender == owner, "Not authorized");
        require(block.timestamp >= m.endTime, "Market not ended");
        require(!m.resolved, "Already resolved");

        m.resolved = true;
        m.outcome = _outcome;
        emit MarketResolved(_marketId, _outcome);
    }

    function claimWinnings(uint256 _marketId) external {
        Market storage m = markets[_marketId];
        require(m.resolved, "Not resolved");
        require(!m.claimed[msg.sender], "Already claimed");

        m.claimed[msg.sender] = true;

        uint256 userBet;
        uint256 winningPool;
        uint256 losingPool;

        if (m.outcome) {
            userBet = m.yesBets[msg.sender];
            winningPool = m.yesPool;
            losingPool = m.noPool;
        } else {
            userBet = m.noBets[msg.sender];
            winningPool = m.noPool;
            losingPool = m.yesPool;
        }

        require(userBet > 0, "No winning bet");

        uint256 totalPool = winningPool + losingPool;
        uint256 fee = (totalPool * FEE_BPS) / 10000;
        uint256 distributable = totalPool - fee;
        uint256 payout = (userBet * distributable) / winningPool;

        // Send fee to owner once per market
        if (!m.feeSent && fee > 0) {
            m.feeSent = true;
            usdc.transfer(owner, fee);
        }

        usdc.transfer(msg.sender, payout);
        emit WinningsClaimed(_marketId, msg.sender, payout);
    }

    // View functions
    function getMarket(uint256 _id) external view returns (
        string memory question, address creator, uint256 endTime,
        uint256 yesPool, uint256 noPool, bool resolved, bool outcome
    ) {
        Market storage m = markets[_id];
        return (m.question, m.creator, m.endTime, m.yesPool, m.noPool, m.resolved, m.outcome);
    }

    function getUserBets(uint256 _id, address _user) external view returns (uint256 yesBet, uint256 noBet) {
        return (markets[_id].yesBets[_user], markets[_id].noBets[_user]);
    }
}
