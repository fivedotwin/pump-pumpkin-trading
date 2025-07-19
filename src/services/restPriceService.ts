import { fetchTokenDetailCached } from './birdeyeApi';

// Intelligent high-frequency price update service with rate limit protection
class RestPriceService {
  private priceCallbacks: Map<string, Set<(price: number) => void>> = new Map();
  private activeTokens: Set<string> = new Set();
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  
  // INTELLIGENT UPDATE FREQUENCY: 2Hz (500ms) - Professional speed while respecting API limits
  private readonly UPDATE_INTERVAL = 500; // Reduced from 100ms to 500ms
  private readonly MAX_UPDATE_INTERVAL = 5000; // Max 5s during rate limiting
  private currentInterval = this.UPDATE_INTERVAL;
  
  // Rate limiting protection
  private rateLimitedUntil = 0;
  private consecutiveErrors = 0;
  private lastSuccessfulUpdate = Date.now();
  
  constructor() {
    console.log('🚀 RestPriceService initialized with 2Hz intelligent rate-limited updates');
  }
  
  // Subscribe to price updates for a token
  subscribeToPrice(tokenAddress: string, callback: (price: number) => void): () => void {
    console.log(`📡 Subscribing to INTELLIGENT price updates for: ${tokenAddress.slice(0, 8)}...`);
    
    if (!this.priceCallbacks.has(tokenAddress)) {
      this.priceCallbacks.set(tokenAddress, new Set());
    }
    
    this.priceCallbacks.get(tokenAddress)!.add(callback);
    this.activeTokens.add(tokenAddress);
    
    // Start the update loop if not already running
    if (!this.isRunning) {
      this.startUpdates();
    }
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.priceCallbacks.get(tokenAddress);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.priceCallbacks.delete(tokenAddress);
          this.activeTokens.delete(tokenAddress);
          console.log(`📡 Unsubscribed from price updates for: ${tokenAddress.slice(0, 8)}...`);
        }
      }
      
      // Stop updates if no active subscriptions
      if (this.activeTokens.size === 0) {
        this.stopUpdates();
      }
    };
  }
  
  // Subscribe to price updates for multiple tokens (for Dashboard/bulk use)
  subscribeToMultiplePrices(
    subscriberId: string,
    tokenAddresses: string[],
    callback: (prices: { [address: string]: number }) => void
  ): () => void {
    console.log(`📡 INTELLIGENT Bulk subscription (${subscriberId}) for ${tokenAddresses.length} tokens`);
    
    const unsubscribeFunctions: (() => void)[] = [];
    const currentPrices: { [address: string]: number } = {};
    
    // Subscribe to each token individually
    tokenAddresses.forEach(tokenAddress => {
      const unsubscribe = this.subscribeToPrice(tokenAddress, (newPrice) => {
        currentPrices[tokenAddress] = newPrice;
        // Call the bulk callback with all current prices
        callback({ ...currentPrices });
      });
      unsubscribeFunctions.push(unsubscribe);
    });
    
    // Return function to unsubscribe from all
    return () => {
      console.log(`📡 Bulk unsubscribe for ${subscriberId}`);
      unsubscribeFunctions.forEach(unsub => unsub());
    };
  }
  
  // Start the intelligent update loop with rate limit protection
  private startUpdates(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('⚡ Starting INTELLIGENT 2Hz price updates with rate limit protection');
    
    this.scheduleNextUpdate();
  }
  
  // Intelligent scheduling with exponential backoff
  private scheduleNextUpdate(): void {
    if (!this.isRunning) return;
    
    // Check if we're rate limited
    const now = Date.now();
    if (now < this.rateLimitedUntil) {
      const waitTime = this.rateLimitedUntil - now;
      console.log(`⏳ RATE LIMITED: Waiting ${waitTime}ms before next update`);
      setTimeout(() => this.scheduleNextUpdate(), waitTime);
      return;
    }
    
    this.updateInterval = setTimeout(() => {
      this.updateAllPrices().finally(() => {
        this.scheduleNextUpdate();
      });
    }, this.currentInterval);
  }
  
  // Stop the update loop
  private stopUpdates(): void {
    if (this.updateInterval) {
      clearTimeout(this.updateInterval);
      this.updateInterval = null;
    }
    this.isRunning = false;
    console.log('⏸️ Stopped intelligent price updates');
  }
  
  // Update all subscribed token prices with intelligent error handling
  private async updateAllPrices(): Promise<void> {
    if (this.activeTokens.size === 0) return;
    
    const activeTokensList = Array.from(this.activeTokens);
    
    // Reduced logging - only log every 10th update (2Hz / 10 = every 5 seconds)
    if (Math.random() < 0.1) {
      console.log(`🔄 INTELLIGENT: Updating ${activeTokensList.length} token prices (2Hz professional frequency)`);
    }
    
    // Update tokens sequentially to respect API rate limits
    for (const tokenAddress of activeTokensList) {
      try {
        const newPrice = await fetchTokenDetailCached(tokenAddress);
        
        if (newPrice && typeof newPrice.price === 'number') {
          // Update cache and notify subscribers
          this.priceCache.set(tokenAddress, {
            price: newPrice.price,
            timestamp: Date.now()
          });
          
          const callbacks = this.priceCallbacks.get(tokenAddress);
          if (callbacks) {
            callbacks.forEach(callback => {
              try {
                callback(newPrice.price);
              } catch (callbackError) {
                console.error('Error in price callback:', callbackError);
              }
            });
          }
          
          // Record successful update
          this.onSuccessfulUpdate();
        }
        
        // Small delay between API calls to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error: any) {
        console.error(`❌ Error fetching price for ${tokenAddress.slice(0, 8)}:`, error.message);
        this.onApiError(error);
      }
    }
  }
  
  // Handle successful API updates
  private onSuccessfulUpdate(): void {
    this.lastSuccessfulUpdate = Date.now();
    this.consecutiveErrors = 0;
    
    // Gradually reduce interval back to normal on success
    if (this.currentInterval > this.UPDATE_INTERVAL) {
      this.currentInterval = Math.max(
        this.UPDATE_INTERVAL,
        this.currentInterval * 0.8 // 20% reduction toward normal
      );
    }
  }
  
  // Handle API errors with intelligent backoff
  private onApiError(error: any): void {
    this.consecutiveErrors++;
    
    // Check for rate limiting
    if (error.response?.status === 429 || error.message.includes('rate limit')) {
      console.warn('🚫 RATE LIMITED: Implementing exponential backoff');
      this.rateLimitedUntil = Date.now() + (this.consecutiveErrors * 2000); // 2s, 4s, 6s...
      this.currentInterval = Math.min(this.MAX_UPDATE_INTERVAL, this.currentInterval * 1.5);
    } 
    // Handle other API errors
    else if (error.response?.status >= 400) {
      console.warn(`⚠️ API Error ${error.response.status}: Slowing down updates`);
      this.currentInterval = Math.min(this.MAX_UPDATE_INTERVAL, this.currentInterval * 1.2);
    }
    
    // If too many consecutive errors, take a longer break
    if (this.consecutiveErrors >= 5) {
      console.warn('🚨 Too many errors: Taking 30s break');
      this.rateLimitedUntil = Date.now() + 30000; // 30 second break
    }
  }
  
  // Get cached price for immediate display
  getCachedPrice(tokenAddress: string): number | null {
    const cached = this.priceCache.get(tokenAddress);
    return cached ? cached.price : null;
  }
  
  // Get service status for debugging
  getStatus(): {
    isRunning: boolean;
    activeTokens: number;
    currentInterval: number;
    rateLimited: boolean;
    consecutiveErrors: number;
  } {
    return {
      isRunning: this.isRunning,
      activeTokens: this.activeTokens.size,
      currentInterval: this.currentInterval,
      rateLimited: Date.now() < this.rateLimitedUntil,
      consecutiveErrors: this.consecutiveErrors
    };
  }
}

// Export singleton instance
const restPriceService = new RestPriceService();
export default restPriceService; 