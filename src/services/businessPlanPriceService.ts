import { fetchTokenDetailCached } from './birdeyeApi';

// BUSINESS PLAN OPTIMIZED: Ultra-high frequency price service for professional trading
class BusinessPlanPriceService {
  private priceCallbacks: Map<string, Set<(price: number) => void>> = new Map();
  private activeTokens: Set<string> = new Set();
  private priceCache: Map<string, { 
    price: number; 
    timestamp: number;
    changePercent?: number;
    trend?: 'up' | 'down' | 'stable';
  }> = new Map();
  
  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  
  // BUSINESS PLAN: ULTRA-FAST 20Hz updates (50ms intervals) for maximum professional trading speed
  private readonly UPDATE_INTERVAL = 50; // 20 times per second - BLAZING FAST
  private readonly PRICE_CACHE_DURATION = 5000; // 5 second cache
  
  // State management for UI synchronization
  private lastUpdateTime = 0;
  private priceUpdateCount = 0;
  private activeSubscriptions = 0;
  
  constructor() {
    console.log('🚀 BUSINESS PLAN: Ultra-high frequency price service initialized (10Hz professional trading)');
  }
  
  // Subscribe to ultra-fast price updates
  subscribeToPrice(tokenAddress: string, callback: (price: number) => void): () => void {
    console.log(`⚡ BUSINESS PLAN: Subscribing to 10Hz price updates for: ${tokenAddress.slice(0, 8)}...`);
    
    if (!this.priceCallbacks.has(tokenAddress)) {
      this.priceCallbacks.set(tokenAddress, new Set());
    }
    
    this.priceCallbacks.get(tokenAddress)!.add(callback);
    this.activeTokens.add(tokenAddress);
    this.activeSubscriptions++;
    
    // Start ultra-fast updates immediately
    if (!this.isRunning) {
      this.startUltraFastUpdates();
    }
    
    // Get immediate price if cached
    const cached = this.priceCache.get(tokenAddress);
    if (cached) {
      setTimeout(() => callback(cached.price), 0);
    }
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.priceCallbacks.get(tokenAddress);
      if (callbacks) {
        callbacks.delete(callback);
        this.activeSubscriptions--;
        
        if (callbacks.size === 0) {
          this.priceCallbacks.delete(tokenAddress);
          this.activeTokens.delete(tokenAddress);
          console.log(`⚡ BUSINESS PLAN: Unsubscribed from price updates for: ${tokenAddress.slice(0, 8)}...`);
        }
      }
      
      // Stop updates if no active subscriptions
      if (this.activeTokens.size === 0) {
        this.stopUpdates();
      }
    };
  }
  
  // Subscribe to bulk price updates for dashboard/multiple tokens
  subscribeToMultiplePrices(
    subscriberId: string,
    tokenAddresses: string[],
    callback: (prices: { [address: string]: number }) => void
  ): () => void {
    console.log(`⚡ BUSINESS PLAN: Bulk subscription (${subscriberId}) for ${tokenAddresses.length} tokens at 10Hz`);
    
    const unsubscribeFunctions: (() => void)[] = [];
    const currentPrices: { [address: string]: number } = {};
    let updateScheduled = false;
    
    // Subscribe to each token individually
    tokenAddresses.forEach(tokenAddress => {
      const unsubscribe = this.subscribeToPrice(tokenAddress, (newPrice) => {
        currentPrices[tokenAddress] = newPrice;
        
        // Debounce bulk callbacks to avoid excessive renders
        if (!updateScheduled) {
          updateScheduled = true;
          setTimeout(() => {
            callback({ ...currentPrices });
            updateScheduled = false;
          }, 10); // 10ms debounce
        }
      });
      unsubscribeFunctions.push(unsubscribe);
    });
    
    // Return function to unsubscribe from all
    return () => {
      console.log(`⚡ BUSINESS PLAN: Bulk unsubscribe for ${subscriberId}`);
      unsubscribeFunctions.forEach(unsub => unsub());
    };
  }
  
  // Start ultra-fast updates optimized for business plan
  private startUltraFastUpdates(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastUpdateTime = Date.now();
    console.log('🚀 BUSINESS PLAN: Starting ultra-fast 10Hz price updates for professional trading');
    
    this.updateInterval = setInterval(() => {
      this.updateAllPricesUltraFast();
    }, this.UPDATE_INTERVAL);
  }
  
  // Stop updates
  private stopUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.isRunning = false;
    console.log('⏸️ BUSINESS PLAN: Stopped ultra-fast price updates');
  }
  
  // Ultra-fast price updates with business plan optimizations
  private async updateAllPricesUltraFast(): Promise<void> {
    if (this.activeTokens.size === 0) return;
    
    const now = Date.now();
    const activeTokensList = Array.from(this.activeTokens);
    this.priceUpdateCount++;
    
    // Log every 200th update (every 10 seconds at 20Hz) to avoid spam
    if (this.priceUpdateCount % 200 === 0) {
      console.log(`⚡ BUSINESS PLAN: BLAZING FAST update #${this.priceUpdateCount} - ${activeTokensList.length} tokens at 20Hz`);
    }
    
    // Update tokens in parallel for maximum speed (business plan can handle it)
    const updatePromises = activeTokensList.map(async (tokenAddress) => {
      try {
        // Check cache first for ultra-fast response
        const cached = this.priceCache.get(tokenAddress);
        const cacheAge = now - (cached?.timestamp || 0);
        
        // Use cache if less than 1 second old (for UI smoothness)
        if (cached && cacheAge < 1000) {
          return;
        }
        
        // Fetch fresh price
        const tokenData = await fetchTokenDetailCached(tokenAddress);
        
        if (tokenData && typeof tokenData.price === 'number' && tokenData.price > 0) {
          const newPrice = tokenData.price;
          const oldPrice = cached?.price || newPrice;
          
          // Calculate trend and change percentage
          const changePercent = ((newPrice - oldPrice) / oldPrice) * 100;
          const trend = newPrice > oldPrice ? 'up' : newPrice < oldPrice ? 'down' : 'stable';
          
          // Update cache with trend information
          this.priceCache.set(tokenAddress, {
            price: newPrice,
            timestamp: now,
            changePercent,
            trend
          });
          
          // Notify all subscribers immediately
          const callbacks = this.priceCallbacks.get(tokenAddress);
          if (callbacks) {
            callbacks.forEach(callback => {
              try {
                callback(newPrice);
              } catch (callbackError) {
                console.error('BUSINESS PLAN: Error in price callback:', callbackError);
              }
            });
          }
          
          // Log significant price movements
          if (Math.abs(changePercent) > 0.5) {
            console.log(`💰 BUSINESS PLAN: Significant price movement - ${tokenAddress.slice(0, 8)}... ${changePercent > 0 ? '📈' : '📉'} ${changePercent.toFixed(2)}%`);
          }
        }
        
      } catch (error: any) {
        // Silent error handling for business plan (don't break the flow)
        if (this.priceUpdateCount % 100 === 0) { // Log errors every 10 seconds
          console.error(`❌ BUSINESS PLAN: Price update error for ${tokenAddress.slice(0, 8)}:`, error.message);
        }
      }
    });
    
    // Execute all updates in parallel for maximum speed
    await Promise.allSettled(updatePromises);
  }
  
  // Get cached price with trend information
  getCachedPriceWithTrend(tokenAddress: string): {
    price: number;
    trend?: 'up' | 'down' | 'stable';
    changePercent?: number;
    age: number;
  } | null {
    const cached = this.priceCache.get(tokenAddress);
    if (!cached) return null;
    
    return {
      price: cached.price,
      trend: cached.trend,
      changePercent: cached.changePercent,
      age: Date.now() - cached.timestamp
    };
  }
  
  // Get service status for debugging
  getBusinessPlanStatus(): {
    isRunning: boolean;
    activeTokens: number;
    updateFrequency: string;
    totalUpdates: number;
    activeSubscriptions: number;
    cacheSize: number;
    uptime: number;
  } {
    return {
      isRunning: this.isRunning,
      activeTokens: this.activeTokens.size,
      updateFrequency: '10Hz (Business Plan)',
      totalUpdates: this.priceUpdateCount,
      activeSubscriptions: this.activeSubscriptions,
      cacheSize: this.priceCache.size,
      uptime: Date.now() - this.lastUpdateTime
    };
  }
  
  // Force immediate price refresh for a specific token
  async forceRefreshPrice(tokenAddress: string): Promise<number | null> {
    try {
      console.log(`🔄 BUSINESS PLAN: Force refreshing price for ${tokenAddress.slice(0, 8)}...`);
      
      const tokenData = await fetchTokenDetailCached(tokenAddress);
      if (tokenData && tokenData.price) {
        const newPrice = tokenData.price;
        
        // Update cache
        this.priceCache.set(tokenAddress, {
          price: newPrice,
          timestamp: Date.now(),
          trend: 'stable'
        });
        
        // Notify subscribers immediately
        const callbacks = this.priceCallbacks.get(tokenAddress);
        if (callbacks) {
          callbacks.forEach(callback => callback(newPrice));
        }
        
        return newPrice;
      }
      
      return null;
    } catch (error) {
      console.error(`❌ BUSINESS PLAN: Force refresh failed for ${tokenAddress}:`, error);
      return null;
    }
  }
  
  // Clear all cache and restart
  restart(): void {
    console.log('🔄 BUSINESS PLAN: Restarting price service...');
    this.stopUpdates();
    this.priceCache.clear();
    this.priceUpdateCount = 0;
    
    if (this.activeTokens.size > 0) {
      this.startUltraFastUpdates();
    }
  }
}

// Export singleton instance optimized for business plan
const businessPlanPriceService = new BusinessPlanPriceService();

// BUSINESS PLAN DEBUG: Add global debug function for users
(window as any).checkBusinessPlanStatus = () => {
  const status = businessPlanPriceService.getBusinessPlanStatus();
  console.log('🚀 BUSINESS PLAN STATUS:', {
    ...status,
    apiEndpoint: 'https://public-api.birdeye.so',
    planType: 'Business Plan',
    optimization: 'Ultra-fast 10Hz updates',
    features: [
      'Real-time price updates every 100ms',
      'Parallel API calls for maximum speed',
      'Intelligent caching with 1-second refresh',
      'Visual update indicators',
      'Professional trading speed'
    ]
  });
  
  console.log('📊 RECENT PRICE CACHE:');
  // @ts-ignore - accessing private property for debug
  businessPlanPriceService.priceCache.forEach((data, address) => {
    console.log(`  ${address.slice(0, 8)}...: $${data.price.toFixed(8)} (${data.trend}) ${data.changePercent?.toFixed(2)}%`);
  });
  
  return status;
};

// BUSINESS PLAN DEBUG: Add force refresh function
(window as any).forceRefreshAllPrices = () => {
  console.log('🔄 BUSINESS PLAN: Force refreshing all tracked prices...');
  businessPlanPriceService.restart();
  return 'Prices refreshed - check updates in UI';
};

export default businessPlanPriceService; 