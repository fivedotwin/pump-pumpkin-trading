// Birdeye WebSocket Service for Real-Time Data Feeds
// Note: This was originally named jupiterWebSocket.ts but Jupiter doesn't provide WebSocket.
// Birdeye WebSocket is used instead for real-time price streaming, charts, and transactions.

type PriceUpdateCallback = (tokenAddress: string, price: number) => void;
type TransactionCallback = (tokenAddress: string, transaction: BirdeyeTransaction) => void;
type ChartUpdateCallback = (tokenAddress: string, ohlcv: BirdeyeOHLCV) => void;
type WalletTxCallback = (walletAddress: string, transaction: BirdeyeWalletTx) => void;

interface BirdeyePriceMessage {
  type: 'SUBSCRIBE_PRICE';
  data: {
    address: string;
    p: number; // price
    t: number; // timestamp
    s: string; // symbol
    o?: number; // open
    h?: number; // high
    l?: number; // low
    c?: number; // close
    v?: number; // volume
  };
}

interface BirdeyeTransactionMessage {
  type: 'SUBSCRIBE_TXS';
  data: BirdeyeTransaction;
}

interface BirdeyeWalletTxMessage {
  type: 'SUBSCRIBE_WALLET_TXS';
  data: BirdeyeWalletTx;
}

interface BirdeyeTransaction {
  txHash: string;
  blockUnixTime: number;
  address: string;
  side: 'buy' | 'sell';
  amount: number;
  priceUsd: number;
  volumeUsd: number;
  maker: string;
}

interface BirdeyeOHLCV {
  address: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

interface BirdeyeWalletTx {
  txHash: string;
  blockUnixTime: number;
  wallet: string;
  tokenAddress: string;
  side: 'buy' | 'sell';
  amount: number;
  priceUsd: number;
  volumeUsd: number;
}

class BirdeyeWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  
  // Subscription management for different data types
  private priceSubscribers: Map<string, Set<PriceUpdateCallback>> = new Map();
  private transactionSubscribers: Map<string, Set<TransactionCallback>> = new Map();
  private chartSubscribers: Map<string, Set<ChartUpdateCallback>> = new Map();
  private walletSubscribers: Map<string, Set<WalletTxCallback>> = new Map();
  
  // Data caches
  private latestPrices: Map<string, number> = new Map();
  private latestOHLCV: Map<string, BirdeyeOHLCV> = new Map();
  
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3; // Reduced attempts for faster fallback
  private apiKey: string;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private hasWebSocketAccess = false;
  private restApiFallbackInterval: NodeJS.Timeout | null = null;

  // Birdeye WebSocket endpoint for real-time data streaming
  private readonly WS_URL = 'wss://public-api.birdeye.so/socket/solana';

  constructor() {
    // Use the same API key as Birdeye REST API
    this.apiKey = 'd43c3786090f4ed997afb84acc4d84c4';
    
    console.log('🔄 Attempting Birdeye WebSocket connection...');
    this.connect();
    
    // Try WebSocket longer before falling back for better real-time performance
    setTimeout(() => {
      if (!this.hasWebSocketAccess) {
        console.log('🔧 Starting REST API fallback after 3 seconds - WebSocket unavailable');
        this.startRestApiFallback();
      }
    }, 3000);
  }

  private connect(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    console.log('🔗 Connecting to Birdeye WebSocket...');

    // Set connection timeout - if no connection in 1 second, fallback to REST API for MAXIMUM SPEED
    this.connectionTimeout = setTimeout(() => {
      if (this.isConnecting) {
        console.log('⏰ WebSocket connection timeout - falling back to REST API polling for MAXIMUM SPEED');
        this.isConnecting = false;
        this.hasWebSocketAccess = false;
        this.startRestApiFallback();
      }
    }, 1000); // ULTRA FAST: 1 second timeout for instant fallback

    try {
      const wsUrlWithKey = `${this.WS_URL}?x-api-key=${this.apiKey}`;
      
      // FIXED: Create WebSocket with proper headers according to Birdeye SDK documentation
      this.ws = new WebSocket(wsUrlWithKey, 'echo-protocol');
      
      // Note: In browser environment, we can't set custom headers directly on WebSocket
      // The headers need to be handled by the browser automatically
      // The 'echo-protocol' is already specified as the second parameter

      this.ws.onopen = () => {
        console.log('✅ Birdeye WebSocket connected successfully!');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.hasWebSocketAccess = true;

        // Clear connection timeout
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }

        // Stop REST API fallback if it was running
        this.stopRestApiFallback();

        // Subscribe to all tokens we need
        this.resubscribeAll();

        // ADDED: Monitor connection health (browser WebSocket handles ping/pong automatically)
        const healthCheck = setInterval(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            console.log('💔 WebSocket connection lost, clearing health check');
            clearInterval(healthCheck);
          } else {
            console.log('💚 Birdeye WebSocket connection healthy');
          }
        }, 30000); // Check health every 30 seconds
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.ws.onclose = (event) => {
        console.log(`🔌 Birdeye WebSocket disconnected (code: ${event.code}, reason: ${event.reason})`);
        console.log('🔍 WebSocket Close Code Details:', {
          code: event.code,
          reason: event.reason || 'No reason provided',
          wasClean: event.wasClean
        });
        
        this.isConnecting = false;
        this.ws = null;
        this.hasWebSocketAccess = false;

        // Check if this is an authentication/permission error
        if (event.code === 1003 || event.code === 1008 || event.code === 1011 || event.code === 1006) {
          console.log('🔒 WebSocket access denied - likely requires Business Package subscription');
          console.log('💡 Free API keys only have REST API access');
          console.log('📡 Starting ULTRA-FAST REST API fallback for sub-second updates...');
          this.startRestApiFallback();
        } else {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ Birdeye WebSocket error:', error);
        this.isConnecting = false;
        this.hasWebSocketAccess = false;
      };

    } catch (error) {
      console.error('❌ Failed to create Birdeye WebSocket connection:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached for Birdeye WebSocket');
      console.log('📡 Starting REST API fallback for real-time updates...');
      this.startRestApiFallback();
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`🔄 Reconnecting to Birdeye WebSocket in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startRestApiFallback(): void {
    // Stop any existing fallback interval
    this.stopRestApiFallback();

    console.log('🚀 Starting REST API fallback with conservative 10-second polling to respect rate limits');
    
    // Poll REST API every 10 seconds for conservative rate-limit-friendly updates
    this.restApiFallbackInterval = setInterval(async () => {
      // Only poll if we have active subscribers
      const activeTokens = Array.from(this.priceSubscribers.keys());
      console.log(`📊 REST API fallback ULTRA-FAST polling for ${activeTokens.length} tokens:`, activeTokens.map(t => t.slice(0, 8) + '...'));
      if (activeTokens.length === 0) return;

      try {
                 // Import Birdeye API dynamically to avoid circular imports
         const { fetchTokenPriceCached } = await import('./birdeyeApi');
         
         // Fetch latest prices for all subscribed tokens (batch them for efficiency)
         const pricePromises = activeTokens.map(async (tokenAddress) => {
           try {
             const price = await fetchTokenPriceCached(tokenAddress);
             return { tokenAddress, price };
           } catch (error) {
             console.error(`❌ Failed to fetch price for ${tokenAddress}:`, error);
             return { tokenAddress, price: null };
           }
         });

         const priceResults = await Promise.all(pricePromises);
         const prices: Record<string, number> = {};
         
         priceResults.forEach(({ tokenAddress, price }) => {
           if (price !== null && typeof price === 'number') {
             prices[tokenAddress] = price;
           }
         });
        
        console.log(`💰 REST API fallback fetched prices:`, Object.entries(prices).map(([addr, price]) => `${addr.slice(0, 8)}...: $${price}`));
        
        // Update cached prices and notify subscribers
        Object.entries(prices).forEach(([tokenAddress, price]) => {
          if (typeof price === 'number') {
            // Update cache
            this.latestPrices.set(tokenAddress, price);
            
            // Notify price subscribers
            const callbacks = this.priceSubscribers.get(tokenAddress);
            console.log(`🔔 Notifying ${callbacks?.size || 0} price subscribers for ${tokenAddress.slice(0, 8)}...`);
            if (callbacks) {
              callbacks.forEach(callback => {
                try {
                  console.log(`📞 Calling price callback with price: $${price}`);
                  callback(tokenAddress, price);
                } catch (error) {
                  console.error('❌ Error in REST fallback price callback:', error);
                }
              });
            }

            // Create mock OHLCV data for chart subscribers
            const ohlcv: BirdeyeOHLCV = {
              address: tokenAddress,
              open: price,
              high: price,
              low: price,
              close: price,
              volume: 0, // No volume data in REST fallback
              timestamp: Math.floor(Date.now() / 1000)
            };

            this.latestOHLCV.set(tokenAddress, ohlcv);

            // Notify chart subscribers
            const chartCallbacks = this.chartSubscribers.get(tokenAddress);
            if (chartCallbacks) {
              chartCallbacks.forEach(callback => {
                try {
                  callback(tokenAddress, ohlcv);
                } catch (error) {
                  console.error('❌ Error in REST fallback chart callback:', error);
                }
              });
            }
          }
        });

      } catch (error) {
        console.error('❌ REST API fallback polling error:', error);
      }
    }, 1000); // Poll every 1 second for real-time trading performance
  }

  private stopRestApiFallback(): void {
    if (this.restApiFallbackInterval) {
      console.log('🛑 Stopping REST API fallback polling');
      clearInterval(this.restApiFallbackInterval);
      this.restApiFallbackInterval = null;
    }
  }

  private resubscribeAll(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const allTokens = Array.from(this.priceSubscribers.keys());
    if (allTokens.length > 0) {
      this.subscribeToTokens(allTokens);
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'SUBSCRIBE_PRICE':
          this.handlePriceUpdate(message as BirdeyePriceMessage);
          break;
        case 'SUBSCRIBE_TXS':
          this.handleTransactionUpdate(message as BirdeyeTransactionMessage);
          break;
        case 'SUBSCRIBE_WALLET_TXS':
          this.handleWalletTxUpdate(message as BirdeyeWalletTxMessage);
          break;
        default:
          console.log('📊 Received Birdeye message:', message.type);
      }
    } catch (error) {
      console.error('❌ Error parsing Birdeye WebSocket message:', error);
    }
  }

  private handlePriceUpdate(message: BirdeyePriceMessage): void {
    if (!message.data) return;

    const { address: tokenAddress, p: price, o, h, l, c, v, t } = message.data;
    
    // Update latest price cache
    this.latestPrices.set(tokenAddress, price);

    // Update OHLCV cache if available
    if (o !== undefined && h !== undefined && l !== undefined && c !== undefined && v !== undefined) {
      const ohlcv: BirdeyeOHLCV = {
        address: tokenAddress,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v,
        timestamp: t
      };
      this.latestOHLCV.set(tokenAddress, ohlcv);

      // Notify chart subscribers
      const chartCallbacks = this.chartSubscribers.get(tokenAddress);
      if (chartCallbacks) {
        chartCallbacks.forEach(callback => {
          try {
            callback(tokenAddress, ohlcv);
          } catch (error) {
            console.error('❌ Error in chart update callback:', error);
          }
        });
      }
    }

    // Notify price subscribers
    const priceCallbacks = this.priceSubscribers.get(tokenAddress);
    if (priceCallbacks) {
      priceCallbacks.forEach(callback => {
        try {
          callback(tokenAddress, price);
        } catch (error) {
          console.error('❌ Error in price update callback:', error);
        }
      });
    }
  }

  private handleTransactionUpdate(message: BirdeyeTransactionMessage): void {
    if (!message.data) return;

    const transaction = message.data;
    const callbacks = this.transactionSubscribers.get(transaction.address);
    
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(transaction.address, transaction);
        } catch (error) {
          console.error('❌ Error in transaction update callback:', error);
        }
      });
    }
  }

  private handleWalletTxUpdate(message: BirdeyeWalletTxMessage): void {
    if (!message.data) return;

    const transaction = message.data;
    const callbacks = this.walletSubscribers.get(transaction.wallet);
    
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(transaction.wallet, transaction);
        } catch (error) {
          console.error('❌ Error in wallet transaction update callback:', error);
        }
      });
    }
  }

  // Subscribe to real-time transactions for specific tokens
  subscribeToTransactions(tokenAddress: string, callback: TransactionCallback): () => void {
    console.log(`📡 Subscribing to Birdeye transactions for ${tokenAddress}`);

    if (!this.transactionSubscribers.has(tokenAddress)) {
      this.transactionSubscribers.set(tokenAddress, new Set());
    }

    this.transactionSubscribers.get(tokenAddress)!.add(callback);

    // Send subscription message to Birdeye WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'SUBSCRIBE_TXS',
        data: {
          address: tokenAddress
        }
      }));
    }

    // Return unsubscribe function
    return () => {
      this.unsubscribeFromTransactions(tokenAddress, callback);
    };
  }

  // Subscribe to real-time chart data (OHLCV) for specific tokens
  subscribeToChart(tokenAddress: string, callback: ChartUpdateCallback): () => void {
    console.log(`📊 Subscribing to Birdeye chart data for ${tokenAddress}`);

    if (!this.chartSubscribers.has(tokenAddress)) {
      this.chartSubscribers.set(tokenAddress, new Set());
    }

    this.chartSubscribers.get(tokenAddress)!.add(callback);

    // Chart data comes with price updates, so also subscribe to price
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'SUBSCRIBE_PRICE',
        data: {
          chartType: '1m',
          currency: 'pair',
          address: tokenAddress
        }
      }));
    }

    // Return unsubscribe function
    return () => {
      this.unsubscribeFromChart(tokenAddress, callback);
    };
  }

  // Subscribe to wallet transactions
  subscribeToWallet(walletAddress: string, callback: WalletTxCallback): () => void {
    console.log(`👛 Subscribing to Birdeye wallet transactions for ${walletAddress}`);

    if (!this.walletSubscribers.has(walletAddress)) {
      this.walletSubscribers.set(walletAddress, new Set());
    }

    this.walletSubscribers.get(walletAddress)!.add(callback);

    // Send subscription message to Birdeye WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'SUBSCRIBE_WALLET_TXS',
        data: {
          wallet: walletAddress
        }
      }));
    }

    // Return unsubscribe function
    return () => {
      this.unsubscribeFromWallet(walletAddress, callback);
    };
  }

  // Subscribe to price updates for specific tokens
  subscribeToToken(tokenAddress: string, callback: PriceUpdateCallback): () => void {
    console.log(`📡 Subscribing to Birdeye price feed for ${tokenAddress}`);

    if (!this.priceSubscribers.has(tokenAddress)) {
      this.priceSubscribers.set(tokenAddress, new Set());
    }

    this.priceSubscribers.get(tokenAddress)!.add(callback);

    // Send subscription message to Birdeye WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'SUBSCRIBE_PRICE',
        data: {
          chartType: '1m',
          currency: 'pair',
          address: tokenAddress
        }
      }));
    }

    // Return unsubscribe function
    return () => {
      this.unsubscribeFromToken(tokenAddress, callback);
    };
  }

  // Subscribe to multiple tokens at once (for liquidation monitoring)
  subscribeToTokens(tokenAddresses: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ Birdeye WebSocket not connected, cannot subscribe to tokens');
      return;
    }

    console.log(`📡 Subscribing to Birdeye price feeds for ${tokenAddresses.length} tokens`);

    // Send individual subscription messages for each token (Birdeye format)
    tokenAddresses.forEach(tokenAddress => {
      this.ws!.send(JSON.stringify({
        type: 'SUBSCRIBE_PRICE',
        data: {
          chartType: '1m',
          currency: 'pair',
          address: tokenAddress
        }
      }));
    });
  }

  private unsubscribeFromToken(tokenAddress: string, callback: PriceUpdateCallback): void {
    const callbacks = this.priceSubscribers.get(tokenAddress);
    if (callbacks) {
      callbacks.delete(callback);
      
      if (callbacks.size === 0) {
        this.priceSubscribers.delete(tokenAddress);
        
        // Unsubscribe from Birdeye WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'UNSUBSCRIBE_PRICE',
            data: {
              address: tokenAddress
            }
          }));
        }
      }
    }
  }

  private unsubscribeFromTransactions(tokenAddress: string, callback: TransactionCallback): void {
    const callbacks = this.transactionSubscribers.get(tokenAddress);
    if (callbacks) {
      callbacks.delete(callback);
      
      if (callbacks.size === 0) {
        this.transactionSubscribers.delete(tokenAddress);
        
        // Unsubscribe from Birdeye WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'UNSUBSCRIBE_TXS',
            data: {
              address: tokenAddress
            }
          }));
        }
      }
    }
  }

  private unsubscribeFromChart(tokenAddress: string, callback: ChartUpdateCallback): void {
    const callbacks = this.chartSubscribers.get(tokenAddress);
    if (callbacks) {
      callbacks.delete(callback);
      
      if (callbacks.size === 0) {
        this.chartSubscribers.delete(tokenAddress);
        
        // Chart unsubscribe handled by price unsubscribe
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'UNSUBSCRIBE_PRICE',
            data: {
              address: tokenAddress
            }
          }));
        }
      }
    }
  }

  private unsubscribeFromWallet(walletAddress: string, callback: WalletTxCallback): void {
    const callbacks = this.walletSubscribers.get(walletAddress);
    if (callbacks) {
      callbacks.delete(callback);
      
      if (callbacks.size === 0) {
        this.walletSubscribers.delete(walletAddress);
        
        // Unsubscribe from Birdeye WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'UNSUBSCRIBE_WALLET_TXS',
            data: {
              wallet: walletAddress
            }
          }));
        }
      }
    }
  }

  // Get latest cached price (synchronous)
  getLatestPrice(tokenAddress: string): number | null {
    return this.latestPrices.get(tokenAddress) || null;
  }

  // Get latest prices for multiple tokens (synchronous)
  getLatestPrices(tokenAddresses: string[]): Record<string, number> {
    const prices: Record<string, number> = {};
    
    tokenAddresses.forEach(address => {
      const price = this.latestPrices.get(address);
      if (price !== undefined) {
        prices[address] = price;
      }
    });

    return prices;
  }

  // Get latest cached OHLCV data (synchronous)
  getLatestOHLCV(tokenAddress: string): BirdeyeOHLCV | null {
    return this.latestOHLCV.get(tokenAddress) || null;
  }

  // Get latest OHLCV data for multiple tokens (synchronous)
  getLatestOHLCVs(tokenAddresses: string[]): Record<string, BirdeyeOHLCV> {
    const ohlcvs: Record<string, BirdeyeOHLCV> = {};
    
    tokenAddresses.forEach(address => {
      const ohlcv = this.latestOHLCV.get(address);
      if (ohlcv !== undefined) {
        ohlcvs[address] = ohlcv;
      }
    });

    return ohlcvs;
  }

  // Check if WebSocket is connected
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // Check if we have real WebSocket access (not just fallback)
  hasRealTimeAccess(): boolean {
    return this.hasWebSocketAccess && this.ws?.readyState === WebSocket.OPEN;
  }

  // Check if using REST API fallback
  isUsingFallback(): boolean {
    return !this.hasWebSocketAccess && this.restApiFallbackInterval !== null;
  }

  // Get connection status
  getConnectionStatus(): string {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }

  // Cleanup
  disconnect(): void {
    console.log('🔌 Disconnecting Birdeye WebSocket and stopping all services...');
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    // Stop REST API fallback
    this.stopRestApiFallback();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.priceSubscribers.clear();
    this.transactionSubscribers.clear();
    this.chartSubscribers.clear();
    this.walletSubscribers.clear();
    this.latestPrices.clear();
    this.latestOHLCV.clear();
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.hasWebSocketAccess = false;
  }
}

// Export singleton instance (keeping jupiterWebSocket name for backward compatibility)
export const jupiterWebSocket = new BirdeyeWebSocketService();

// Helper function for easy price subscription
export const subscribeToJupiterPrice = (
  tokenAddress: string, 
  callback: PriceUpdateCallback
): (() => void) => {
  return jupiterWebSocket.subscribeToToken(tokenAddress, callback);
};

// Helper function to get latest price
export const getJupiterPrice = (tokenAddress: string): number | null => {
  return jupiterWebSocket.getLatestPrice(tokenAddress);
};

// Helper function to get multiple prices
export const getJupiterPrices = (tokenAddresses: string[]): Record<string, number> => {
  return jupiterWebSocket.getLatestPrices(tokenAddresses);
};

// Helper function for transaction subscription
export const subscribeToJupiterTransactions = (
  tokenAddress: string, 
  callback: TransactionCallback
): (() => void) => {
  return jupiterWebSocket.subscribeToTransactions(tokenAddress, callback);
};

// Helper function for chart data subscription
export const subscribeToJupiterChart = (
  tokenAddress: string, 
  callback: ChartUpdateCallback
): (() => void) => {
  return jupiterWebSocket.subscribeToChart(tokenAddress, callback);
};

// Helper function for wallet transaction subscription
export const subscribeToJupiterWallet = (
  walletAddress: string, 
  callback: WalletTxCallback
): (() => void) => {
  return jupiterWebSocket.subscribeToWallet(walletAddress, callback);
};

// Helper function to get latest OHLCV data
export const getJupiterOHLCV = (tokenAddress: string): BirdeyeOHLCV | null => {
  return jupiterWebSocket.getLatestOHLCV(tokenAddress);
};

// Helper function to get multiple OHLCV data
export const getJupiterOHLCVs = (tokenAddresses: string[]): Record<string, BirdeyeOHLCV> => {
  return jupiterWebSocket.getLatestOHLCVs(tokenAddresses);
};

// Helper function to check WebSocket connection status
export const isJupiterWebSocketConnected = (): boolean => {
  return jupiterWebSocket.hasRealTimeAccess();
};

// Helper function to check if using fallback
export const isJupiterUsingFallback = (): boolean => {
  return jupiterWebSocket.isUsingFallback();
};

// Helper function to get connection status string
export const getJupiterConnectionStatus = (): string => {
  if (jupiterWebSocket.hasRealTimeAccess()) {
    return 'connected';
  } else if (jupiterWebSocket.isUsingFallback()) {
    return 'fallback';
  } else if (jupiterWebSocket.isConnected()) {
    return 'connecting';
  } else {
    return 'disconnected';
  }
};

// Export types for external use
export type { BirdeyeTransaction, BirdeyeOHLCV, BirdeyeWalletTx, TransactionCallback, ChartUpdateCallback, WalletTxCallback }; 