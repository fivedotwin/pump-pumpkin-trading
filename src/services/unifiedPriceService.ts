// Unified Price Service - Consolidates all price updates to prevent delays and rate limiting
// Replaces multiple competing intervals with single smart service

import { fetchSOLPrice, fetchTokenPriceCached } from './birdeyeApi';

interface PriceData {
  solPrice: number;
  tokenPrices: Record<string, number>;
  lastUpdate: number;
}

interface PriceSubscriber {
  id: string;
  callback: (data: PriceData) => void;
}

class UnifiedPriceService {
  private subscribers: Map<string, PriceSubscriber> = new Map();
  private currentData: PriceData = {
    solPrice: 0,
    tokenPrices: {},
    lastUpdate: 0
  };
  
  private isRunning = false;
  private updateInterval: NodeJS.Timeout | null = null;
  private trackedTokens: Set<string> = new Set();
  
  // High-priority tokens (currently viewing + active positions) - 500ms updates
  private highPriorityTokens: Set<string> = new Set();
  private fastUpdateInterval: NodeJS.Timeout | null = null;
  
  // Regular update interval for SOL price and low-priority tokens
  private readonly REGULAR_UPDATE_INTERVAL = 3000; // 3 seconds for SOL price (user requested faster updates)
  private readonly FAST_UPDATE_INTERVAL = 500; // 500ms for actively viewed tokens and positions
  
  constructor() {
    console.log('🚀 Unified Price Service initialized - eliminates competing intervals');
  }

  // Start the unified price service
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('⚡ Starting unified price service with smart priority updates');
    
    // Initial price load
    this.updateRegularPrices();
    
    // Regular updates for SOL price
    this.updateInterval = setInterval(() => {
      this.updateRegularPrices();
    }, this.REGULAR_UPDATE_INTERVAL);
    
    // Start fast updates if needed
    this.startFastUpdates();
  }

  // Stop the service
  stop(): void {
    this.isRunning = false;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.fastUpdateInterval) {
      clearInterval(this.fastUpdateInterval);
      this.fastUpdateInterval = null;
    }
    console.log('⏹️ Unified price service stopped');
  }

  // Add high-priority tokens (currently viewing + active positions)
  setHighPriorityTokens(tokenAddresses: string[]): void {
    const oldSize = this.highPriorityTokens.size;
    this.highPriorityTokens.clear();
    tokenAddresses.forEach(addr => this.highPriorityTokens.add(addr));
    
    console.log(`⚡ High-priority tokens updated: ${this.highPriorityTokens.size} tokens (was ${oldSize})`);
    
    // Restart fast updates with new priority list
    if (this.isRunning) {
      this.startFastUpdates();
    }
  }

  // Add a single token to high-priority list
  addHighPriorityToken(tokenAddress: string): void {
    const wasEmpty = this.highPriorityTokens.size === 0;
    this.highPriorityTokens.add(tokenAddress);
    
    console.log(`⚡ Added high-priority token: ${tokenAddress.slice(0, 8)}... (${this.highPriorityTokens.size} total)`);
    
    // Start fast updates if this was the first high-priority token
    if (this.isRunning && wasEmpty) {
      this.startFastUpdates();
    }
  }

  // Remove a single token from high-priority list
  removeHighPriorityToken(tokenAddress: string): void {
    this.highPriorityTokens.delete(tokenAddress);
    
    console.log(`🔇 Removed high-priority token: ${tokenAddress.slice(0, 8)}... (${this.highPriorityTokens.size} remaining)`);
    
    // Stop fast updates if no high-priority tokens remain
    if (this.isRunning && this.highPriorityTokens.size === 0) {
      this.stopFastUpdates();
    }
  }

  // Stop fast updates when no high-priority tokens
  private stopFastUpdates(): void {
    if (this.fastUpdateInterval) {
      console.log('🔇 Stopping fast updates - no high-priority tokens');
      clearInterval(this.fastUpdateInterval);
      this.fastUpdateInterval = null;
    }
  }

  // Start fast updates for high-priority tokens
  private startFastUpdates(): void {
    if (this.fastUpdateInterval) {
      clearInterval(this.fastUpdateInterval);
      this.fastUpdateInterval = null;
    }
    
    if (this.highPriorityTokens.size > 0) {
      console.log(`🚀 Starting 500ms fast updates for ${this.highPriorityTokens.size} high-priority tokens`);
      this.updateHighPriorityTokens();
      this.fastUpdateInterval = setInterval(() => {
        this.updateHighPriorityTokens();
      }, this.FAST_UPDATE_INTERVAL);
    }
  }

  // Subscribe to price updates
  subscribe(id: string, callback: (data: PriceData) => void): () => void {
    console.log(`📡 Subscribing ${id} to unified price service`);
    
    this.subscribers.set(id, { id, callback });
    
    // Send current data immediately if available
    if (this.currentData.lastUpdate > 0) {
      callback(this.currentData);
    }
    
    // Ensure service is running
    this.start();
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(id);
      console.log(`🔌 Unsubscribed ${id} from unified price service`);
      
      // Stop service if no subscribers
      if (this.subscribers.size === 0) {
        this.stop();
      }
    };
  }

  // Add tokens to track
  trackTokens(tokenAddresses: string[]): void {
    const newTokens = tokenAddresses.filter(addr => !this.trackedTokens.has(addr));
    newTokens.forEach(addr => this.trackedTokens.add(addr));
    
    if (newTokens.length > 0) {
      console.log(`📈 Now tracking ${newTokens.length} new tokens:`, newTokens.map(t => t.slice(0, 8) + '...'));
    }
  }

  // Remove tokens from tracking
  untrackTokens(tokenAddresses: string[]): void {
    tokenAddresses.forEach(addr => this.trackedTokens.delete(addr));
    console.log(`📉 Stopped tracking ${tokenAddresses.length} tokens`);
  }

  // Get current price data (synchronous)
  getCurrentData(): PriceData {
    return { ...this.currentData };
  }

  // Regular price updates (SOL price only, every 5 seconds)
  private async updateRegularPrices(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Only update SOL price in regular updates
      const solPriceResult = await fetchSOLPrice();

      const updateData: PriceData = {
        solPrice: solPriceResult,
        tokenPrices: this.currentData.tokenPrices, // Keep existing token prices
        lastUpdate: Date.now()
      };

      // Update cache
      this.currentData = updateData;

      // Notify all subscribers
      this.notifySubscribers(updateData);

      const updateTime = Date.now() - startTime;
      console.log(`💰 Regular price update completed in ${updateTime}ms - SOL: $${updateData.solPrice.toFixed(2)}`);

    } catch (error) {
      console.error('❌ Regular price update failed:', error);
    }
  }

  // Fast updates for high-priority tokens (every 500ms)
  private async updateHighPriorityTokens(): Promise<void> {
    if (this.highPriorityTokens.size === 0) return;
    
    try {
      const startTime = Date.now();
      
      // Fetch only high-priority token prices
      const tokenPrices = await this.fetchSpecificTokenPrices(Array.from(this.highPriorityTokens));

      const updateData: PriceData = {
        solPrice: this.currentData.solPrice, // Keep existing SOL price
        tokenPrices: { ...this.currentData.tokenPrices, ...tokenPrices }, // Merge with existing
        lastUpdate: Date.now()
      };

      // Update cache
      this.currentData = updateData;

      // Notify all subscribers
      this.notifySubscribers(updateData);

      const updateTime = Date.now() - startTime;
      console.log(`⚡ Fast update completed in ${updateTime}ms - ${this.highPriorityTokens.size} priority tokens`);

    } catch (error) {
      console.error('❌ Fast token update failed:', error);
    }
  }

  // Legacy method for compatibility - now calls regular updates
  private async updatePrices(): Promise<void> {
    await this.updateRegularPrices();
  }

  // Fetch all tracked token prices in parallel
  private async fetchAllTokenPrices(): Promise<Record<string, number>> {
    if (this.trackedTokens.size === 0) {
      return {};
    }

    return this.fetchSpecificTokenPrices(Array.from(this.trackedTokens));
  }

  // Fetch specific token prices in parallel
  private async fetchSpecificTokenPrices(tokenAddresses: string[]): Promise<Record<string, number>> {
    if (tokenAddresses.length === 0) {
      return {};
    }
    
    try {
      // Parallel token price fetching
      const pricePromises = tokenAddresses.map(async (tokenAddress) => {
        try {
          const price = await fetchTokenPriceCached(tokenAddress);
          return { address: tokenAddress, price: price || 0 };
        } catch (error) {
          console.error(`Failed to fetch price for ${tokenAddress.slice(0, 8)}:`, error);
          return { address: tokenAddress, price: this.currentData.tokenPrices[tokenAddress] || 0 };
        }
      });

      const results = await Promise.all(pricePromises);
      const tokenPrices: Record<string, number> = {};
      
      results.forEach(({ address, price }) => {
        tokenPrices[address] = price;
      });

      return tokenPrices;
    } catch (error) {
      console.error('❌ Error fetching specific token prices:', error);
      return {};
    }
  }

  // Notify all subscribers of price updates
  private notifySubscribers(data: PriceData): void {
    this.subscribers.forEach(({ id, callback }) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`❌ Error notifying subscriber ${id}:`, error);
      }
    });
  }
}

// Export singleton instance
export const unifiedPriceService = new UnifiedPriceService();
export default unifiedPriceService; 