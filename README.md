# ⚡ Blockchain-Integrated EV Charging Network

Welcome to a revolutionary Web3 solution for electric vehicle (EV) charging! This project builds a decentralized network that incentivizes off-peak charging to reduce grid strain, lower energy costs, and promote sustainable energy use. Users earn "Energy Tokens" (ET) for charging during low-demand periods, which can be redeemed for discounts, priority access, or traded. Built on the Stacks blockchain using Clarity smart contracts, it ensures transparency, security, and immutability.

This addresses real-world problems like grid overload during peak hours, high energy costs for EV owners, and inefficient charging infrastructure by leveraging blockchain for fair rewards and decentralized management.

## ✨ Features

🔋 Register EV charging stations and users securely  
🎁 Reward off-peak charging with Energy Tokens  
⏰ Real-time off-peak detection via oracles  
💰 Redeem tokens for charging discounts or payments  
📊 Track usage and rewards transparently  
🛡️ Prevent fraud with verifiable proofs  
🏛️ Community governance for network rules  
🔄 Trade tokens on decentralized exchanges  
📈 Analytics for energy consumption patterns  
🚫 Dispute resolution for charging issues  

## 🛠 How It Works

The system involves 8 smart contracts written in Clarity to handle various aspects of the network. Here's a high-level overview:

1. **UserRegistry.clar**: Manages user registration, storing wallet addresses and EV details.  
2. **StationRegistry.clar**: Registers and verifies charging stations, including location and owner info.  
3. **EnergyToken.clar**: An FT (Fungible Token) contract for minting, burning, and transferring Energy Tokens.  
4. **RewardsDistributor.clar**: Calculates and distributes rewards based on charging data, enforcing off-peak rules.  
5. **OffPeakOracle.clar**: Integrates with external oracles to determine real-time peak/off-peak periods.  
6. **PaymentGateway.clar**: Handles payments for charging sessions, accepting STX or tokens with discounts.  
7. **Governance.clar**: Allows token holders to vote on network parameters like reward rates or off-peak definitions.  
8. **DisputeResolution.clar**: Manages disputes over charging sessions or rewards, with escrow and voting mechanisms.  

**For EV Owners (Users)**  
- Register your wallet and EV via UserRegistry.  
- Locate and connect to a registered station using StationRegistry.  
- Charge during off-peak times (verified by OffPeakOracle).  
- Submit charging proof (e.g., hashed session data) to RewardsDistributor to earn Energy Tokens.  
- Use PaymentGateway to pay for sessions with token discounts.  

Boom! You've saved on costs and helped balance the grid while earning tradable tokens.

**For Charging Station Operators**  
- Register your station with StationRegistry, providing proof of ownership.  
- Integrate IoT devices to report charging sessions securely.  
- Earn a share of fees via PaymentGateway and participate in Governance for network improvements.  

**For Verifiers and Community**  
- Use get-user-rewards or get-station-stats functions across contracts to view transparent data.  
- Participate in Governance votes or DisputeResolution for fair oversight.  
- Trade Energy Tokens on DEXes for liquidity.  

That's it! A decentralized, incentivized EV ecosystem that scales with real-world energy demands.