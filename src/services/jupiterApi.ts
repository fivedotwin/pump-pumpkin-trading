import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { createJupiterApiClient, QuoteGetRequest, QuoteResponse, SwapPostRequest } from '@jup-ag/api';

// Configuration
const JUPITER_API_KEY = '788ad1ee-4c79-43ed-99e4-d97d4065bde4';
const PPA_TOKEN_ADDRESS = '51NRTtZ8GwG3J4MGmxTsGJAdLViwu9s5ggEQup35pump';
const SOL_TOKEN_ADDRESS = 'So11111111111111111111111111111111111111112'; // Wrapped SOL

// Fee configuration - 0.5% fee to your wallet
const FEE_ACCOUNT = 'CTDZ5teoWajqVcAsWQyEmmvHQzaDiV1jrnvwRmcL1iWv';
const FEE_BPS = 50; // 0.5% = 50 basis points

// Create Jupiter API client according to official docs
const jupiterQuoteApi = createJupiterApiClient({
  basePath: 'https://quote-api.jup.ag/v6',
});

export interface SwapQuote {
  inputAmount: string;
  outputAmount: string;
  priceImpactPct: string;
  routePlan: any[];
  swapMode: string;
  inputMint: string;
  outputMint: string;
  otherAmountThreshold: string;
  slippageBps: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
}

export interface SwapResult {
  txid: string;
  inputAmount: number;
  outputAmount: number;
  feeAmount: number;
}

export type SwapDirection = 'SOL_TO_PPA' | 'PPA_TO_SOL';

export class JupiterSwapService {
  private connection: Connection;

  constructor() {
    // Use QuickNode Solana mainnet RPC endpoint
    this.connection = new Connection('https://dimensional-white-pine.solana-mainnet.quiknode.pro/e229761b955e887d87f412414b4024c993e7a91d/', {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    });
  }

  /**
   * Calculate platform fee amount
   */
  private calculatePlatformFee(inputAmount: number, inputMint: string): string {
    let amountInSmallestUnit: number;
    
    if (inputMint === SOL_TOKEN_ADDRESS) {
      amountInSmallestUnit = Math.floor(inputAmount * 1_000_000_000); // SOL has 9 decimals
    } else {
      amountInSmallestUnit = Math.floor(inputAmount * 1_000_000); // PPA has 6 decimals
    }
    
    // Calculate 0.5% fee
    const feeAmount = Math.floor((amountInSmallestUnit * FEE_BPS) / 10000);
    return feeAmount.toString();
  }

  /**
   * Get swap quote using Jupiter API v6 with platform fee
   */
  async getSwapQuoteWithDirection(
    inputAmount: number, 
    direction: SwapDirection
  ): Promise<SwapQuote | null> {
    try {
      let inputMint: string;
      let outputMint: string;
      let amountInSmallestUnit: number;

      // Configure swap based on direction
      switch (direction) {
        case 'SOL_TO_PPA':
          inputMint = SOL_TOKEN_ADDRESS;
          outputMint = PPA_TOKEN_ADDRESS;
          amountInSmallestUnit = Math.floor(inputAmount * 1_000_000_000); // SOL has 9 decimals
          break;
        case 'PPA_TO_SOL':
          inputMint = PPA_TOKEN_ADDRESS;
          outputMint = SOL_TOKEN_ADDRESS;
          amountInSmallestUnit = Math.floor(inputAmount * 1_000_000); // PPA has 6 decimals
          break;
        default:
          throw new Error('Invalid swap direction');
      }

      console.log(`🔄 Getting Jupiter quote for: ${inputAmount} ${direction}`);
      console.log(`📊 Amount in smallest unit: ${amountInSmallestUnit}`);
      
      // Calculate platform fee
      const platformFeeAmount = this.calculatePlatformFee(inputAmount, inputMint);
      
      console.log(`💰 Platform fee: ${platformFeeAmount} (${FEE_BPS} bps = 0.5%)`);

      // Create quote request according to Jupiter API v6 docs with platform fee
      const quoteRequest: QuoteGetRequest = {
        inputMint,
        outputMint,
        amount: amountInSmallestUnit,
        slippageBps: 50, // 0.5% slippage
        swapMode: 'ExactIn',
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
        platformFeeBps: FEE_BPS, // Add platform fee to quote request
      };

      console.log('📋 Quote request with fee:', quoteRequest);

      // Get quote from Jupiter API
      const quote = await jupiterQuoteApi.quoteGet(quoteRequest);
      
      if (!quote) {
        console.error('❌ No quote received from Jupiter');
        return null;
      }

      console.log('✅ Quote received with fee:', {
        inputAmount: quote.inAmount,
        outputAmount: quote.outAmount,
        priceImpactPct: quote.priceImpactPct,
        platformFee: quote.platformFee,
        routePlan: quote.routePlan?.length || 0
      });

      return {
        inputAmount: quote.inAmount,
        outputAmount: quote.outAmount,
        priceImpactPct: quote.priceImpactPct || '0',
        routePlan: quote.routePlan || [],
        swapMode: quote.swapMode || 'ExactIn',
        inputMint,
        outputMint,
        otherAmountThreshold: quote.otherAmountThreshold || quote.outAmount,
        slippageBps: 50,
        platformFee: quote.platformFee ? {
          amount: quote.platformFee.amount,
          feeBps: quote.platformFee.feeBps
        } : {
          amount: platformFeeAmount,
          feeBps: FEE_BPS
        }
      };

    } catch (error) {
      console.error('💥 Error getting Jupiter quote:', error);
      return null;
    }
  }

  /**
   * Execute swap using Jupiter API v6 with platform fee
   */
  async executeSwap(
    quote: SwapQuote,
    userPublicKey: PublicKey,
    signTransaction: (transaction: VersionedTransaction) => Promise<VersionedTransaction>
  ): Promise<SwapResult | null> {
    try {
      console.log('🚀 Executing swap with quote and fee:', quote);

      // Create platform fee configuration
      const platformFee = {
        amount: quote.platformFee?.amount || '0',
        feeBps: FEE_BPS
      };

      // Create swap request according to Jupiter API v6 docs with platform fee
      const swapRequest: SwapPostRequest = {
        quoteResponse: {
          inputMint: quote.inputMint,
          inAmount: quote.inputAmount,
          outputMint: quote.outputMint,
          outAmount: quote.outputAmount,
          otherAmountThreshold: quote.otherAmountThreshold,
          swapMode: quote.swapMode,
          slippageBps: quote.slippageBps,
          platformFee: platformFee,
          priceImpactPct: quote.priceImpactPct,
          routePlan: quote.routePlan,
        },
        userPublicKey: userPublicKey.toString(),
        wrapAndUnwrapSol: true,
        useSharedAccounts: true,
        feeAccount: FEE_ACCOUNT, // Your wallet address for receiving fees
        trackingAccount: undefined,
        computeUnitPriceMicroLamports: undefined,
        prioritizationFeeLamports: undefined,
        asLegacyTransaction: false,
        useTokenLedger: false,
        destinationTokenAccount: undefined,
      };

      console.log('📋 Swap request prepared with fee account:', FEE_ACCOUNT);

      // Get swap transaction from Jupiter API
      const swapResponse = await jupiterQuoteApi.swapPost({ swapRequest });
      
      if (!swapResponse.swapTransaction) {
        console.error('❌ No swap transaction received');
        return null;
      }

      console.log('✅ Swap transaction received from Jupiter with platform fee');

      // Deserialize the transaction
      const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      console.log('🔐 Requesting transaction signature...');

      // Sign the transaction
      const signedTransaction = await signTransaction(transaction);

      console.log('📡 Sending transaction to network...');

      // Send the transaction
      const rawTransaction = signedTransaction.serialize();
      const txid = await this.connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2,
      });

      console.log('⏳ Confirming transaction:', txid);

      // Confirm the transaction
      const confirmation = await this.connection.confirmTransaction(txid, 'confirmed');
      
      if (confirmation.value.err) {
        console.error('❌ Transaction failed:', confirmation.value.err);
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }

      console.log('✅ Transaction confirmed with platform fee:', txid);

      // Calculate amounts for display
      let inputAmount: number;
      let outputAmount: number;
      let feeAmount: number;

      if (quote.inputMint === SOL_TOKEN_ADDRESS) {
        inputAmount = parseInt(quote.inputAmount) / 1_000_000_000; // SOL has 9 decimals
        feeAmount = parseInt(quote.platformFee?.amount || '0') / 1_000_000_000;
      } else {
        inputAmount = parseInt(quote.inputAmount) / 1_000_000; // PPA has 6 decimals
        feeAmount = parseInt(quote.platformFee?.amount || '0') / 1_000_000;
      }

      if (quote.outputMint === SOL_TOKEN_ADDRESS) {
        outputAmount = parseInt(quote.outputAmount) / 1_000_000_000; // SOL has 9 decimals
      } else {
        outputAmount = parseInt(quote.outputAmount) / 1_000_000; // PPA has 6 decimals
      }

      console.log(`💰 Swap completed - Fee: ${feeAmount} sent to ${FEE_ACCOUNT}`);

      return {
        txid,
        inputAmount,
        outputAmount,
        feeAmount,
      };

    } catch (error) {
      console.error('💥 Error executing swap:', error);
      throw error;
    }
  }

  /**
   * Get PPA price in SOL (how many PPA per 1 SOL) - includes fee calculation
   */
  async getPPAPrice(): Promise<number | null> {
    try {
      const quote = await this.getSwapQuoteWithDirection(1, 'SOL_TO_PPA');
      
      if (!quote) {
        return null;
      }

      const inputAmount = parseInt(quote.inputAmount) / 1_000_000_000; // SOL
      const outputAmount = parseInt(quote.outputAmount) / 1_000_000; // PPA
      
      return outputAmount / inputAmount;

    } catch (error) {
      console.error('💥 Error getting PPA price:', error);
      return null;
    }
  }

  /**
   * Get SOL price in PPA (how many SOL per 1 PPA) - includes fee calculation
   */
  async getSOLPrice(): Promise<number | null> {
    try {
      const quote = await this.getSwapQuoteWithDirection(1, 'PPA_TO_SOL');
      
      if (!quote) {
        return null;
      }

      const inputAmount = parseInt(quote.inputAmount) / 1_000_000; // PPA
      const outputAmount = parseInt(quote.outputAmount) / 1_000_000_000; // SOL
      
      return outputAmount / inputAmount;

    } catch (error) {
      console.error('💥 Error getting SOL price:', error);
      return null;
    }
  }

  /**
   * Get current exchange rate for display - FIXED CALCULATION
   */
  async getExchangeRate(direction: SwapDirection): Promise<string | null> {
    try {
      if (direction === 'SOL_TO_PPA') {
        // For buying PPA: show how much PPA you get per SOL
        const quote = await this.getSwapQuoteWithDirection(1, 'SOL_TO_PPA');
        if (quote) {
          const inputSOL = parseInt(quote.inputAmount) / 1_000_000_000;
          const outputPPA = parseInt(quote.outputAmount) / 1_000_000;
          const rate = outputPPA / inputSOL;
          return `1 SOL ≈ ${rate.toLocaleString('en-US', { maximumFractionDigits: 0 })} PPA`;
        }
      } else {
        // For selling PPA: Use the ACTUAL quote amounts to calculate rate
        // Don't use a separate rate calculation - use the actual quote being shown
        return null; // We'll calculate this in the component using the actual quote
      }
      return null;
    } catch (error) {
      console.error('💥 Error getting exchange rate:', error);
      return null;
    }
  }

  /**
   * Format token amounts for display
   */
  formatTokenAmount(amount: string, tokenMint?: string): string {
    let decimals = 6; // Default for PPA
    
    if (tokenMint === SOL_TOKEN_ADDRESS) {
      decimals = 9; // SOL has 9 decimals
    }

    const num = parseInt(amount) / Math.pow(10, decimals);
    
    // Better formatting based on token type
    if (tokenMint === SOL_TOKEN_ADDRESS) {
      // SOL formatting - show up to 4 decimal places
      return num.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 4 
      });
    } else {
      // PPA formatting - show appropriate decimal places based on size
      if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
      } else if (num >= 1000) {
        return (num / 1000).toFixed(2) + 'K';
      } else {
        return num.toLocaleString('en-US', { 
          minimumFractionDigits: 0, 
          maximumFractionDigits: 2 
        });
      }
    }
  }

  /**
   * Validate SOL balance (including fee)
   */
  async validateSOLBalance(
    userPublicKey: PublicKey, 
    requiredAmount: number
  ): Promise<boolean> {
    try {
      const balance = await this.connection.getBalance(userPublicKey);
      const solBalance = balance / 1_000_000_000;
      console.log('💰 SOL Balance:', solBalance);
      
      // Calculate total needed including fee and transaction costs
      const feeAmount = requiredAmount * 0.005; // 0.5% fee
      const totalNeeded = requiredAmount + feeAmount + 0.01; // Include transaction fees
      
      console.log(`💰 Required: ${requiredAmount}, Fee: ${feeAmount}, Total needed: ${totalNeeded}`);
      
      return solBalance >= totalNeeded;

    } catch (error) {
      console.error('💥 Error checking SOL balance:', error);
      return false;
    }
  }

  /**
   * Validate PPA balance (including fee)
   */
  async validatePPABalance(
    userPublicKey: PublicKey, 
    requiredAmount: number
  ): Promise<boolean> {
    try {
      const mint = new PublicKey(PPA_TOKEN_ADDRESS);
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        userPublicKey,
        { mint }
      );

      if (tokenAccounts.value.length === 0) {
        console.warn('⚠️ No PPA token account found');
        return false;
      }

      const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
      console.log('💰 PPA Balance:', balance);

      // Calculate total needed including fee
      const feeAmount = requiredAmount * 0.005; // 0.5% fee
      const totalNeeded = requiredAmount + feeAmount;
      
      console.log(`💰 Required: ${requiredAmount}, Fee: ${feeAmount}, Total needed: ${totalNeeded}`);

      return balance >= totalNeeded;

    } catch (error) {
      console.error('💥 Error checking PPA balance:', error);
      return false;
    }
  }

  /**
   * Get user balances
   */
  async getUserBalances(userPublicKey: PublicKey): Promise<{
    sol: number;
    ppa: number;
  }> {
    let sol = 0;
    let ppa = 0;

    try {
      // Get SOL balance
      const solBalance = await this.connection.getBalance(userPublicKey);
      sol = solBalance / 1_000_000_000;

      // Get PPA balance
      try {
        const ppaAccounts = await this.connection.getParsedTokenAccountsByOwner(
          userPublicKey,
          { mint: new PublicKey(PPA_TOKEN_ADDRESS) }
        );
        if (ppaAccounts.value.length > 0) {
          ppa = ppaAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
        }
      } catch (error) {
        console.warn('⚠️ Could not fetch PPA balance:', error.message);
        ppa = 0;
      }

      console.log('💰 Balances - SOL:', sol, 'PPA:', ppa);
      return { sol, ppa };

    } catch (error) {
      console.error('💥 Error getting user balances:', error);
      return { sol: 0, ppa: 0 };
    }
  }
}

// Export singleton instance
export const jupiterSwapService = new JupiterSwapService();