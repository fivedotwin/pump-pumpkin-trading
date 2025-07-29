// Simple WebSocket service for Birdeye data (no complex fallbacks)
// Note: This service is simplified - the main price service handles most price updates

interface PriceUpdateCallback {
  (tokenAddress: string, price: number): void;
}

class SimpleWebSocketService {
  private ws: WebSocket | null = null;
  private priceSubscribers: Map<string, Set<PriceUpdateCallback>> = new Map();
  private isConnected = false;

  // Birdeye WebSocket endpoint
  private readonly WS_URL = 'wss://public-api.birdeye.so/socket/solana';
  private readonly API_KEY = '9a5835740ef1448bafe50f8fbdc519ec';

  constructor() {
    console.log('🔌 Simple WebSocket service initialized');
    this.connect();
  }

  private connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    console.log('🔗 Connecting to Birdeye WebSocket...');

    try {
      const wsUrlWithKey = `${this.WS_URL}?x-api-key=${this.API_KEY}`;
      this.ws = new WebSocket(wsUrlWithKey);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.isConnected = true;
        this.resubscribeAll();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        this.isConnected = false;

        // Simple reconnect after 5 seconds
        setTimeout(() => {
          console.log('🔄 Attempting to reconnect...');
          this.connect();
        }, 5000);
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.isConnected = false;
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.isConnected = false;
    }
  }

  private handleMessage(data: any): void {
    // Handle price updates from WebSocket
    if (data.type === 'price' && data.data) {
      const { address, price } = data.data;
      if (address && typeof price === 'number') {
        this.notifyPriceSubscribers(address, price);
      }
                }
  }

  private notifyPriceSubscribers(tokenAddress: string, price: number): void {
    const callbacks = this.priceSubscribers.get(tokenAddress);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(tokenAddress, price);
        } catch (error) {
          console.error('Error in price callback:', error);
        }
      });
    }
  }

  private resubscribeAll(): void {
    // Resubscribe to all tokens when connection is restored
    const tokens = Array.from(this.priceSubscribers.keys());
    tokens.forEach(tokenAddress => {
      this.subscribeToToken(tokenAddress);
    });
    }

  private subscribeToToken(tokenAddress: string): void {
    if (!this.isConnected || !this.ws) return;

    try {
      const subscribeMessage = {
        type: 'subscribe',
        data: {
          type: 'price',
          address: tokenAddress
        }
      };
      
      this.ws.send(JSON.stringify(subscribeMessage));
      console.log(`📊 Subscribed to WebSocket price updates for: ${tokenAddress.slice(0, 8)}...`);
    } catch (error) {
      console.error(`Failed to subscribe to ${tokenAddress}:`, error);
    }
  }

  // Public API
  subscribeToPrice(tokenAddress: string, callback: PriceUpdateCallback): () => void {
    if (!this.priceSubscribers.has(tokenAddress)) {
      this.priceSubscribers.set(tokenAddress, new Set());
      this.subscribeToToken(tokenAddress);
    }

    this.priceSubscribers.get(tokenAddress)!.add(callback);

    // Return unsubscribe function
    return () => {
    const callbacks = this.priceSubscribers.get(tokenAddress);
    if (callbacks) {
      callbacks.delete(callback);
      
      if (callbacks.size === 0) {
        this.priceSubscribers.delete(tokenAddress);
          // Could add unsubscribe message to WebSocket here if needed
            }
      }
    };
  }

  isWebSocketConnected(): boolean {
    return this.isConnected;
    }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.priceSubscribers.clear();
  }
}

// Export singleton
const webSocketService = new SimpleWebSocketService();
export default webSocketService;

// Legacy exports for compatibility (these now just use the simplified service)
export const jupiterWebSocket = webSocketService;
export const getJupiterPrices = () => ({
  isConnected: webSocketService.isWebSocketConnected()
}); 