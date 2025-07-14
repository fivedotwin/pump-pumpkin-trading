// Simplified Price Service - Single REST API polling system
// Replaces: WebSocket service, unified price service, and individual component polling

import { fetchSOLPrice, fetchTokenPriceCached } from './birdeyeApi';

interface PriceData {
  solPrice: number;
  tokenPrices: Record<string, number>;
  lastUpdate: number;
}

type PriceCallback = (data: PriceData) => void;

class SimplifiedPriceService {
  private subscribers: Map<string, PriceCallback> = new Map();
  private trackedTokens: Set<string> = new Set();
  private currentData: PriceData = { solPrice: 0, tokenPrices: {}, lastUpdate: 0 };
  private updateInterval: NodeJS.Timeout | null = null;

  // Single update frequency - keep it simple
  private readonly UPDATE_INTERVAL = 3000; // 3 seconds for everything

  start(): void {
    if (this.updateInterval) return;
    
    console.log('Starting simplified price service (3-second updates)');
    
    // Initial fetch
    this.updatePrices();
    
    // Regular updates
    this.updateInterval = setInterval(() => {
      this.updatePrices();
    }, this.UPDATE_INTERVAL);
  }

  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    console.log('Simplified price service stopped');
  }

  subscribe(id: string, callback: PriceCallback): () => void {
    console.log(`SimplifiedPriceService: New subscriber ${id} (total: ${this.subscribers.size + 1})`);
    this.subscribers.set(id, callback);
    
    // Send current data immediately
    if (this.currentData.lastUpdate > 0) {
      console.log(`Sending existing data to ${id}:`, this.currentData);
      callback(this.currentData);
    }
    
    this.start();
    
    return () => {
      console.log(`SimplifiedPriceService: Unsubscribing ${id}`);
      this.subscribers.delete(id);
      if (this.subscribers.size === 0) {
        console.log('No more subscribers, stopping price service');
        this.stop();
      }
    };
  }

  trackTokens(addresses: string[]): void {
    const newTokens = addresses.filter(addr => !this.trackedTokens.has(addr));
    addresses.forEach(addr => this.trackedTokens.add(addr));
    console.log(`SimplifiedPriceService: Tracking ${newTokens.length} new tokens (total: ${this.trackedTokens.size})`, newTokens);
  }

  untrackTokens(addresses: string[]): void {
    addresses.forEach(addr => this.trackedTokens.delete(addr));
    console.log(`SimplifiedPriceService: Untracked ${addresses.length} tokens (total: ${this.trackedTokens.size})`);
  }

  getCurrentData(): PriceData {
    return { ...this.currentData };
  }

  private async updatePrices(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Fetch SOL price and all token prices in parallel
      const [solPrice, tokenPrices] = await Promise.all([
        fetchSOLPrice(),
        this.fetchAllTokenPrices()
      ]);

      this.currentData = {
        solPrice,
        tokenPrices,
        lastUpdate: Date.now()
      };

      // Notify all subscribers
      console.log(`Notifying ${this.subscribers.size} subscribers with new price data`);
      this.subscribers.forEach((callback, id) => {
        try {
          console.log(`Notifying subscriber: ${id}`);
          callback(this.currentData);
        } catch (error) {
          console.error(`Error in price callback for ${id}:`, error);
        }
      });

      const updateTime = Date.now() - startTime;
      console.log(`Prices updated in ${updateTime}ms - SOL: $${solPrice.toFixed(2)}, ${Object.keys(tokenPrices).length} tokens`);

    } catch (error) {
      console.error('Price update failed:', error);
    }
  }

  private async fetchAllTokenPrices(): Promise<Record<string, number>> {
    if (this.trackedTokens.size === 0) return {};
    
    const pricePromises = Array.from(this.trackedTokens).map(async (address) => {
      try {
        const price = await fetchTokenPriceCached(address);
        return { address, price: price || 0 };
      } catch (error) {
        return { address, price: this.currentData.tokenPrices[address] || 0 };
      }
    });

    const results = await Promise.all(pricePromises);
    const prices: Record<string, number> = {};
    
    results.forEach(({ address, price }) => {
      prices[address] = price;
    });

    return prices;
  }
}

// Export singleton
export const simplifiedPriceService = new SimplifiedPriceService();
export default simplifiedPriceService; 