// mrgnlend Interface (TypeScript)
// Interactive CLI for marginfi v2 protocol lending and withdrawal

import { MarginfiClient, getConfig, MarginfiAccountWrapper } from "@mrgnlabs/marginfi-client-v2";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { NodeWallet } from "@mrgnlabs/mrgn-common";
import bs58 from "bs58";
import * as dotenv from "dotenv";
import * as readline from "readline";

dotenv.config();

interface TokenBalance {
    symbol: string;
    amount: number;
    value: number;
}

interface LendingPosition {
    symbol: string;
    amount: number;
    bankAddress: string;
    apy: number;
}

class MarginfiInterface {
    private client: MarginfiClient | null = null;
    private wallet: NodeWallet | null = null;
    private connection: Connection | null = null;
    private marginfiAccount: MarginfiAccountWrapper | null = null;
    private rl: readline.Interface;
    private solPrice: number = 0;

    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    private async question(query: string): Promise<string> {
        return new Promise((resolve) => {
            this.rl.question(query, resolve);
        });
    }

    private async initializeClient(): Promise<void> {
        console.log("🔄 Initializing mrgnlend interface...");
        
        // Load wallet from environment variable
        const walletKey = process.env.WALLET_KEY;
        if (!walletKey) {
            throw new Error("WALLET_KEY not found in .env file");
        }
        const keypair = Keypair.fromSecretKey(bs58.decode(walletKey));
        this.wallet = new NodeWallet(keypair);
        
        console.log(`💳 Wallet: ${this.wallet.publicKey.toBase58()}`);
        
        // Initialize MarginFi client
        const config = getConfig("production");
        
        const rpcUrl = process.env.RPC_URL || "YOUR_PRIVATE_RPC_ENDPOINT_HERE";
        if (rpcUrl === "YOUR_PRIVATE_RPC_ENDPOINT_HERE") {
            throw new Error(`
            ⚠️  You need to set a private RPC endpoint in your .env file!
            
            Add this to your .env file:
            RPC_URL=https://your-private-rpc-endpoint-here
            
            Get a reliable RPC from:
            • Helius: https://www.helius.dev/
            • QuickNode: https://www.quicknode.com/
            • Alchemy: https://www.alchemy.com/
            `);
        }
        
        this.connection = new Connection(rpcUrl, {
            commitment: "confirmed", // Use confirmed for better reliability with blockhashes
            wsEndpoint: undefined,
            httpHeaders: { "User-Agent": "MarginFi-CLI" },
            confirmTransactionInitialTimeout: 60000, // 60 seconds timeout
        });
        
        // Test RPC connection
        const slot = await this.connection.getSlot();
        console.log(`🔗 Connected to Solana (slot: ${slot})`);
        
        // Use specific SOL bank for efficiency
        const SOL_BANK_ADDRESS = new PublicKey("CCKtUs6Cgwo4aaQUmBPmyoApH2gUDErxNZCAntD6LYGh");
        
        this.client = await MarginfiClient.fetch(config, this.wallet, this.connection, {
            preloadedBankAddresses: [SOL_BANK_ADDRESS],
        });
        
        // Load or create marginfi account
        await this.loadMarginfiAccount();
        
        // Fetch SOL price
        await this.fetchSolPrice();
        
        console.log("✅ mrgnlend interface initialized!\n");
    }

    private async loadMarginfiAccount(): Promise<void> {
        if (!this.client || !this.wallet) throw new Error("Client not initialized");
        
        try {
            // Try to load existing account
            const accounts = await this.client.getMarginfiAccountsForAuthority(this.wallet.publicKey);
            if (accounts.length > 0) {
                this.marginfiAccount = accounts[0];
                console.log(`📋 Loaded existing marginfi account: ${this.marginfiAccount.address.toBase58()}`);
            } else {
                console.log("📋 No existing marginfi account found. Creating new one...");
                this.marginfiAccount = await this.client.createMarginfiAccount();
                console.log(`📋 Created new marginfi account: ${this.marginfiAccount.address.toBase58()}`);
            }
        } catch (error) {
            console.log("📋 Creating new marginfi account...");
            this.marginfiAccount = await this.client.createMarginfiAccount();
            console.log(`📋 Created marginfi account: ${this.marginfiAccount.address.toBase58()}`);
        }
    }

    private async refreshMarginfiAccount(): Promise<void> {
        if (!this.client || !this.wallet) {
            console.log("⚠️  Cannot refresh account - client or wallet not initialized");
            return;
        }
        
        try {
            console.log("🔄 Refreshing account data...");
            // Reload the account by fetching fresh data from the blockchain
            const accounts = await this.client.getMarginfiAccountsForAuthority(this.wallet.publicKey);
            if (accounts.length > 0) {
                this.marginfiAccount = accounts[0];
                console.log("✅ Account data refreshed");
            } else {
                console.log("⚠️  No marginfi account found during refresh");
            }
        } catch (error) {
            console.log("⚠️  Could not refresh account data:", error);
        }
    }

    private async fetchSolPrice(): Promise<void> {
        try {
            const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
            const data = await response.json();
            this.solPrice = data.solana.usd;
            console.log(`💰 SOL Price: $${this.solPrice.toFixed(2)}`);
        } catch (error) {
            console.log("⚠️  Could not fetch SOL price, using $0");
            this.solPrice = 0;
        }
    }

    private async getWalletStatus(): Promise<TokenBalance[]> {
        if (!this.connection || !this.wallet) throw new Error("Not initialized");
        
        const balance = await this.connection.getBalance(this.wallet.publicKey);
        const solBalance = balance / LAMPORTS_PER_SOL;
        const value = solBalance * this.solPrice;
        
        const tokens: TokenBalance[] = [];
        if (value > 0.01) { // Only show tokens worth more than $0.1
            tokens.push({
                symbol: 'SOL',
                amount: solBalance,
                value: value
            });
        }
        
        return tokens;
    }

    private async getLendingPositions(): Promise<LendingPosition[]> {
        if (!this.marginfiAccount || !this.client) return [];
        
        const positionsMap = new Map<string, LendingPosition>();
        
        try {
            // Get the account's active balances
            const balances = this.marginfiAccount.activeBalances;
            
            for (const balance of balances) {
                if (balance.active && balance.assetShares.gt(0)) {
                    const bank = balance.bankPk ? this.client.getBankByPk(balance.bankPk) : null;
                    if (bank) {
                        // ✅ FIXED: getAssetQuantity returns lamports, need to convert to proper units
                        const assetQuantity = bank.getAssetQuantity(balance.assetShares);
                        let amount: number;
                        
                        if (bank.tokenSymbol === 'SOL') {
                            amount = assetQuantity.toNumber() / LAMPORTS_PER_SOL;
                        } else {
                            // For other tokens, use their respective decimal places
                            const decimals = bank.mintDecimals || 9; // Default to 9 if not available
                            amount = assetQuantity.toNumber() / Math.pow(10, decimals);
                        }
                        
                        const apy = (bank as any).lendingRate ? (bank as any).lendingRate * 100 : 0; // Convert to percentage
                        const symbol = bank.tokenSymbol || 'Unknown';
                        
                        // Consolidate positions by symbol
                        if (positionsMap.has(symbol)) {
                            const existing = positionsMap.get(symbol)!;
                            existing.amount += amount;
                            // Use the highest APY if there are multiple banks for the same token
                            existing.apy = Math.max(existing.apy, apy);
                        } else {
                            positionsMap.set(symbol, {
                                symbol: symbol,
                                amount: amount,
                                bankAddress: bank.address.toBase58(),
                                apy: apy
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.log("⚠️  Could not load lending positions:", error);
        }
        
        return Array.from(positionsMap.values());
    }

    private async displayWalletStatus(): Promise<void> {
        console.log("\n💰 === WALLET STATUS ===");
        const tokens = await this.getWalletStatus();
        
        if (tokens.length === 0) {
            console.log("No tokens with value > $0.01 found");
        } else {
            let totalValue = 0;
            for (const token of tokens) {
                console.log(`${token.symbol}: ${token.amount.toFixed(6)} ($${token.value.toFixed(2)})`);
                totalValue += token.value;
            }
            console.log(`Total Value: $${totalValue.toFixed(2)}`);
        }
    }

    private async displayMarginfiStatus(): Promise<void> {
        console.log("\n🏦 === MRGNLEND STATUS ===");
        const positions = await this.getLendingPositions();
        
        if (positions.length === 0) {
            console.log("No active lending positions");
        } else {
            let totalValue = 0;
            for (const position of positions) {
                const value = position.symbol === 'SOL' ? position.amount * this.solPrice : 0;
                console.log(`${position.symbol}: ${position.amount.toFixed(6)} (APY: ${position.apy.toFixed(2)}%) ${value > 0 ? `($${value.toFixed(2)})` : ''}`);
                totalValue += value;
            }
            if (totalValue > 0) {
                console.log(`Total Lending Value: $${totalValue.toFixed(2)}`);
            }
        }
    }

    private async lendingFlow(): Promise<void> {
        console.log("\n💸 === LENDING FLOW ===");
        
        // Show available SOL balance
        const tokens = await this.getWalletStatus();
        const solToken = tokens.find(t => t.symbol === 'SOL');
        
        if (!solToken || solToken.amount < 0.001) {
            console.log("❌ Insufficient SOL balance for lending (minimum 0.001 SOL)");
            return;
        }
        
        console.log(`Available SOL: ${solToken.amount.toFixed(6)} ($${solToken.value.toFixed(2)})`);
        
        // Get SOL bank and show current APY
        const SOL_BANK_ADDRESS = new PublicKey("CCKtUs6Cgwo4aaQUmBPmyoApH2gUDErxNZCAntD6LYGh");
        const bank = this.client!.getBankByPk(SOL_BANK_ADDRESS);
        if (!bank) throw new Error("SOL bank not found");
        
        const apy = (bank as any).lendingRate ? (bank as any).lendingRate * 100 : 0;
        console.log(`Current SOL Lending APY: ${apy.toFixed(2)}%`);
        
        // Ask for amount to lend
        const amountStr = await this.question(`\nHow much SOL would you like to lend? (max ${solToken.amount.toFixed(6)}): `);
        const amount = parseFloat(amountStr);
        
        // Add more generous tolerance for floating-point precision issues
        // Use both absolute and relative tolerance for better handling
        const absoluteTolerance = 1e-6;
        const relativeTolerance = solToken.amount * 1e-6;
        const tolerance = Math.max(absoluteTolerance, relativeTolerance);
        
        if (isNaN(amount) || amount <= 0 || amount > (solToken.amount + tolerance)) {
            console.log("❌ Invalid amount");
            console.log(`Debug: amount=${amount}, max=${solToken.amount}, tolerance=${tolerance}`);
            return;
        }
        
        // Show confirmation with estimated returns
        const dailyReturn = (amount * apy / 100) / 365;
        const monthlyReturn = dailyReturn * 30;
        
        console.log(`\n📋 === LENDING CONFIRMATION ===`);
        console.log(`Amount: ${amount} SOL ($${(amount * this.solPrice).toFixed(2)})`);
        console.log(`APY: ${apy.toFixed(2)}%`);
        console.log(`Estimated Daily Return: ${dailyReturn.toFixed(6)} SOL`);
        console.log(`Estimated Monthly Return: ${monthlyReturn.toFixed(6)} SOL`);
        console.log(`Platform Fees: 0% (marginfi only fills insurance pools)`);
        console.log(`Insurance Protection: ✅ Your funds are protected`);
        
        const confirm = await this.question("\nProceed with lending? (y/N): ");
        if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
            console.log("❌ Lending cancelled");
            return;
        }
        
        // Execute lending transaction with retry logic
        await this.executeLendingWithRetry(amount, bank.address);
    }

    private async executeLendingWithRetry(amount: number, bankAddress: PublicKey): Promise<void> {
        const maxRetries = 5;
        const baseDelay = 1000; // 1 second base delay
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🔄 Executing lending transaction (attempt ${attempt}/${maxRetries})...`);
                
                // Check if we need fresh account data
                if (attempt > 1) {
                    console.log("🔄 Refreshing account data before retry...");
                    await this.refreshMarginfiAccount();
                }
                
                const signature = await this.marginfiAccount!.deposit(amount, bankAddress);
                
                console.log("✅ Lending completed successfully!");
                console.log(`   Amount: ${amount} SOL`);
                console.log(`   Transaction: ${signature}`);
                console.log(`   Explorer: https://solscan.io/tx/${signature}`);
                
                // Refresh account data to show updated balances
                await this.refreshMarginfiAccount();
                return; // Success, exit the retry loop
                
            } catch (error: any) {
                const errorMessage = error?.message || String(error);
                console.log(`⚠️  Attempt ${attempt} failed: ${errorMessage}`);
                
                // Check if this is a blockhash-related error
                const isBlockhashError = this.isBlockhashRelatedError(errorMessage);
                const isNetworkError = this.isNetworkRelatedError(errorMessage);
                
                if (isBlockhashError) {
                    console.log("🔄 BlockhashNotFound error detected - this is common and will be retried");
                } else if (isNetworkError) {
                    console.log("🌐 Network connectivity issue detected - retrying");
                } else {
                    // For non-retryable errors, exit immediately
                    console.error("❌ Non-retryable error encountered:");
                    console.error(error);
                    return;
                }
                
                // If this is the last attempt, don't wait
                if (attempt === maxRetries) {
                    console.error("❌ Lending failed after all retry attempts");
                    console.error("💡 This could be due to:");
                    console.error("   • Network congestion - try again in a few minutes");
                    console.error("   • RPC endpoint issues - consider using a different RPC");
                    console.error("   • Insufficient wallet balance for fees");
                    return;
                }
                
                // Calculate exponential backoff delay
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.log(`⏳ Waiting ${delay}ms before retry ${attempt + 1}...`);
                await this.sleep(delay);
            }
        }
    }

    private async withdrawalFlow(): Promise<void> {
        console.log("\n🔄 === WITHDRAWAL FLOW ===");
        
        // Show all lending positions
        const positions = await this.getLendingPositions();
        
        if (positions.length === 0) {
            console.log("❌ No lending positions to withdraw from");
            return;
        }
        
        console.log("Your lending positions:");
        positions.forEach((position, index) => {
            const value = position.symbol === 'SOL' ? position.amount * this.solPrice : 0;
            console.log(`${index + 1}. ${position.symbol}: ${position.amount.toFixed(6)} ${value > 0 ? `($${value.toFixed(2)})` : ''}`);
        });
        
        // Let user select pool
        const selectionStr = await this.question(`\nSelect position to withdraw from (1-${positions.length}): `);
        const selection = parseInt(selectionStr) - 1;
        
        if (isNaN(selection) || selection < 0 || selection >= positions.length) {
            console.log("❌ Invalid selection");
            return;
        }
        
        const selectedPosition = positions[selection];
        
        // Ask for withdrawal amount
        const amountStr = await this.question(`\nHow much ${selectedPosition.symbol} would you like to withdraw? (max ${selectedPosition.amount.toFixed(6)}): `);
        const amount = parseFloat(amountStr);
        
        // Add more generous tolerance for floating-point precision issues
        // Use both absolute and relative tolerance for better handling
        const absoluteTolerance = 1e-6;
        const relativeTolerance = selectedPosition.amount * 1e-6;
        const tolerance = Math.max(absoluteTolerance, relativeTolerance);
        
        if (isNaN(amount) || amount <= 0 || amount > (selectedPosition.amount + tolerance)) {
            console.log("❌ Invalid amount");
            console.log(`Debug: amount=${amount}, max=${selectedPosition.amount}, tolerance=${tolerance}`);
            return;
        }
        
        // Show confirmation details
        const value = selectedPosition.symbol === 'SOL' ? amount * this.solPrice : 0;
        console.log(`\n📋 === WITHDRAWAL CONFIRMATION ===`);
        console.log(`Amount: ${amount} ${selectedPosition.symbol} ${value > 0 ? `($${value.toFixed(2)})` : ''}`);
        console.log(`Bank: ${selectedPosition.bankAddress}`);
        console.log(`Platform Fees: 0%`);
        
        const confirm = await this.question("\nProceed with withdrawal? (y/N): ");
        if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
            console.log("❌ Withdrawal cancelled");
            return;
        }
        
        // Execute withdrawal transaction with retry logic
        await this.executeWithdrawalWithRetry(amount, new PublicKey(selectedPosition.bankAddress), selectedPosition.symbol);
    }

    private async executeWithdrawalWithRetry(amount: number, bankAddress: PublicKey, symbol: string): Promise<void> {
        const maxRetries = 5;
        const baseDelay = 1000; // 1 second base delay
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🔄 Executing withdrawal transaction (attempt ${attempt}/${maxRetries})...`);
                
                // Check if we need fresh account data
                if (attempt > 1) {
                    console.log("🔄 Refreshing account data before retry...");
                    await this.refreshMarginfiAccount();
                }
                
                const signature = await this.marginfiAccount!.withdraw(amount, bankAddress);
                
                console.log("✅ Withdrawal completed successfully!");
                console.log(`   Amount: ${amount} ${symbol}`);
                console.log(`   Transaction: ${signature}`);
                console.log(`   Explorer: https://solscan.io/tx/${signature}`);
                
                // Refresh account data to show updated balances
                await this.refreshMarginfiAccount();
                return; // Success, exit the retry loop
                
            } catch (error: any) {
                const errorMessage = error?.message || String(error);
                console.log(`⚠️  Attempt ${attempt} failed: ${errorMessage}`);
                
                // Check if this is a blockhash-related error
                const isBlockhashError = this.isBlockhashRelatedError(errorMessage);
                const isNetworkError = this.isNetworkRelatedError(errorMessage);
                
                if (isBlockhashError) {
                    console.log("🔄 BlockhashNotFound error detected - this is common and will be retried");
                } else if (isNetworkError) {
                    console.log("🌐 Network connectivity issue detected - retrying");
                } else {
                    // For non-retryable errors, exit immediately
                    console.error("❌ Non-retryable error encountered:");
                    console.error(error);
                    return;
                }
                
                // If this is the last attempt, don't wait
                if (attempt === maxRetries) {
                    console.error("❌ Withdrawal failed after all retry attempts");
                    console.error("💡 This could be due to:");
                    console.error("   • Network congestion - try again in a few minutes");
                    console.error("   • RPC endpoint issues - consider using a different RPC");
                    console.error("   • Account health issues - check your lending position");
                    return;
                }
                
                // Calculate exponential backoff delay
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.log(`⏳ Waiting ${delay}ms before retry ${attempt + 1}...`);
                await this.sleep(delay);
            }
        }
    }

    private isBlockhashRelatedError(errorMessage: string): boolean {
        const blockhashErrorPatterns = [
            'BlockhashNotFound',
            'blockhash not found',
            'Transaction expired',
            'TransactionExpiredBlockheightExceededError',
            'Blockhash not found',
            'recent blockhash',
            'expired blockhash'
        ];
        
        return blockhashErrorPatterns.some(pattern => 
            errorMessage.toLowerCase().includes(pattern.toLowerCase())
        );
    }

    private isNetworkRelatedError(errorMessage: string): boolean {
        const networkErrorPatterns = [
            'timeout',
            'network',
            'connection',
            'ECONNRESET',
            'ENOTFOUND',
            'ETIMEDOUT',
            'socket hang up',
            'fetch failed'
        ];
        
        return networkErrorPatterns.some(pattern => 
            errorMessage.toLowerCase().includes(pattern.toLowerCase())
        );
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async showMenu(): Promise<void> {
        console.log("\n📋 === MENU OPTIONS ===");
        console.log("1. 💸 Lend SOL");
        console.log("2. 🔄 Withdraw lent funds");
        console.log("3. 🔄 Refresh status");
        console.log("4. 🚪 Exit");
        
        const choice = await this.question("\nSelect an option (1-4): ");
        
        switch (choice) {
            case '1':
                await this.lendingFlow();
                break;
            case '2':
                await this.withdrawalFlow();
                break;
            case '3':
                await this.refreshMarginfiAccount();
                await this.displayWalletStatus();
                await this.displayMarginfiStatus();
                break;
            case '4':
                console.log("👋 Goodbye!");
                this.rl.close();
                process.exit(0);
                break;
            default:
                console.log("❌ Invalid option");
        }
    }

    public async start(): Promise<void> {
        try {
            console.log("🚀 mrgnlend Interface (TypeScript)");
            console.log("===================================");
            
            await this.initializeClient();
            
            // Display initial status
            await this.displayWalletStatus();
            await this.displayMarginfiStatus();
            
            // Main menu loop
            while (true) {
                await this.showMenu();
                console.log("\n" + "=".repeat(50));
            }
            
        } catch (error) {
            console.error("❌ Interface failed:", error);
            this.rl.close();
            process.exit(1);
        }
    }
}

// Run the interface
const marginfiInterface = new MarginfiInterface();
marginfiInterface.start();
