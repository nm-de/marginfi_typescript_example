# mrgnlend Interface (Python)

A Python script for interacting with mrgnlend (marginfi v2) protocol for lending SOL and managing lending positions.

## Current Status

✅ **Complete UI/UX Flow**: Full interactive command-line interface  
✅ **Wallet Integration**: SOL balance checking and price fetching  
✅ **Menu System**: All requested flows (lend, withdraw, status)  
✅ **mrgnlend Integration**: **REAL TRANSACTIONS** - Actual marginfi v2 program interactions

## Features

- 💰 **Wallet Status**: View your available tokens (value > $0.1) with USD values
- 🏦 **mrgnlend Status**: Check your current lending positions and earned interest
- 💸 **Lending Flow**: Lend SOL to earn lending interest with 0% platform fees
- 🔄 **Withdrawal Flow**: Withdraw SOL from lending positions (no fees)
- 📋 **Interactive Menu**: Easy-to-use command-line interface
- 🛡️ **Insurance Protection**: Your funds are protected by marginfi insurance pools

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Environment Variables

Create a `.env` file in the same directory:

```env
# Your Solana wallet private key (base58 encoded)
WALLET_KEY=your_base58_encoded_private_key_here
```

**⚠️ Security Note**: Never commit your `.env` file to version control. Keep your private keys secure.

### 3. Run the Script

```bash
python marginfi_lending.py
```

## Usage

When you run the script, it will:

1. **Display Wallet Status**: Show your available tokens and their USD values
2. **Display MarginFi Status**: Show your current lending positions  
3. **Present Menu Options**:
   - Lend SOL
   - Withdraw lent funds
   - Refresh status
   - Exit

### Lending Flow

1. Shows available SOL balance
2. Displays current lending APY
3. Asks for amount to lend
4. Shows confirmation with estimated returns
5. Executes the lending transaction on Solana mainnet

### Withdrawal Flow

1. Shows all your lending positions
2. Lets you select which pool to withdraw from
3. Asks for withdrawal amount
4. Shows confirmation details
5. Executes the withdrawal transaction on Solana mainnet

## mrgnlend Integration Features

✅ **Real Transactions**: Actual marginfi v2 program interactions on Solana mainnet  
✅ **Account Management**: Automatic marginfi account creation and discovery  
✅ **SOL Bank Discovery**: Finds the SOL lending pool automatically  
✅ **WSOL Handling**: Proper wrapped SOL account management for deposits/withdrawals  
✅ **Transaction Monitoring**: Shows transaction signatures and Solscan links  
✅ **Zero Fees**: 0% platform fees - marginfi only fills insurance pools  
✅ **Insurance Protection**: Your funds are protected by marginfi insurance pools  

### Technical Implementation

- **Program Address**: Uses official marginfi v2 program ID `MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA`
- **Product**: mrgnlend (marginfi v2 lending & borrowing protocol)
- **Account Discovery**: Finds marginfi groups and SOL banks automatically
- **PDA Derivation**: Creates proper program-derived addresses for accounts
- **Instruction Building**: Builds correct marginfi deposit and withdraw instructions
- **WSOL Management**: Handles wrapped SOL creation and cleanup
- **Fee Structure**: 0% platform fees as per marginfi documentation

## Dependencies

- `solana`: Solana Python SDK for blockchain interactions
- `solders`: Low-level Solana primitives (transactions, keys, instructions)
- `spl-token`: SPL token program interactions for WSOL handling
- `requests`: HTTP library for price data from CoinGecko
- `python-dotenv`: Environment variable management

## Safety & Testing

⚠️ **This script performs real transactions on Solana mainnet**

- **Start Small**: Test with small amounts (0.1 SOL) first
- **Verify Transactions**: Check the Solscan links before proceeding with larger amounts
- **Backup Wallet**: Make sure you have your wallet seed phrase backed up
- **Monitor Gas**: Transactions include priority fees for faster confirmation

## Real Implementation

This script now performs actual mrgnlend (marginfi v2) protocol interactions:
- ✅ Creates real marginfi accounts on-chain
- ✅ Lends SOL to earn real lending interest in mrgnlend pools
- ✅ Withdraws SOL from your lending positions
- ✅ All transactions are confirmed on Solana mainnet
- ✅ 0% platform fees - marginfi only fills insurance pools
- ✅ Your funds are protected by marginfi insurance pools