import { supabase } from './supabaseClient';
import { fetchTokenDetail } from './birdeyeApi';

export interface TradingPosition {
  id: number;
  wallet_address: string;
  token_address: string;
  token_symbol: string;
  direction: 'Long' | 'Short';
  order_type: 'Market Order' | 'Limit Order';
  entry_price: number;
  target_price?: number;
  amount: number;
  leverage: number;
  collateral_sol: number;
  position_value_usd: number;
  stop_loss?: number;
  take_profit?: number;
  status: 'pending' | 'open' | 'closed' | 'liquidated' | 'cancelled';
  current_pnl: number;
  liquidation_price: number;
  margin_call_triggered: boolean;
  margin_call_price?: number;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  close_price?: number;
  close_reason?: string;
}

export interface CreatePositionData {
  wallet_address: string;
  token_address: string;
  token_symbol: string;
  direction: 'Long' | 'Short';
  order_type: 'Market Order' | 'Limit Order';
  target_price?: number; // For limit orders
  amount: number;
  leverage: number;
  stop_loss?: number;
  take_profit?: number;
}

export interface PositionUpdate {
  position_id: number;
  price: number;
  pnl: number;
  margin_ratio: number;
}

export interface MarginCallAlert {
  position: TradingPosition;
  current_price: number;
  required_collateral: number;
  shortfall: number;
}

class PositionService {
  
  // Position size limits based on leverage
  private getMaxPositionSize(leverage: number): number {
    if (leverage >= 50) return 1_000_000; // $1M for 50x-100x
    if (leverage >= 10) return 100_000;   // $100K for 10x-49x
    if (leverage >= 2) return 20_000;     // $20K for 2x-9x
    return 10_000; // Default fallback
  }

  // Calculate liquidation price
  private calculateLiquidationPrice(
    entry_price: number, 
    direction: 'Long' | 'Short', 
    leverage: number
  ): number {
    // Liquidation occurs when losses reach 100% of collateral
    // For Long: price drops by (1/leverage) of entry price
    // For Short: price rises by (1/leverage) of entry price
    
    if (direction === 'Long') {
      return entry_price * (1 - (1 / leverage));
    } else {
      return entry_price * (1 + (1 / leverage));
    }
  }

  // Calculate margin call price (at 80% of liquidation)
  private calculateMarginCallPrice(
    entry_price: number,
    liquidation_price: number,
    direction: 'Long' | 'Short'
  ): number {
    if (direction === 'Long') {
      // Margin call at 80% of the way to liquidation
      return entry_price - ((entry_price - liquidation_price) * 0.8);
    } else {
      return entry_price + ((liquidation_price - entry_price) * 0.8);
    }
  }

  // Validate position size limits
  private validatePositionSize(position_value_usd: number, leverage: number): boolean {
    const maxSize = this.getMaxPositionSize(leverage);
    return position_value_usd <= maxSize;
  }

  // Calculate P&L for a position
  async calculatePositionPnL(position: TradingPosition): Promise<{
    pnl: number;
    margin_ratio: number;
    current_price: number;
  }> {
    try {
      // Get current token price from Birdeye
      const tokenData = await fetchTokenDetail(position.token_address);
      if (!tokenData) {
        throw new Error(`Failed to fetch token data for ${position.token_address}`);
      }
      const current_price = tokenData.price;
      
      const entry_price = position.entry_price;
      const amount = position.amount;
      const leverage = position.leverage;
      
      let pnl = 0;
      
      if (position.direction === 'Long') {
        // Long: Profit when price goes up
        pnl = (current_price - entry_price) * amount * leverage;
      } else {
        // Short: Profit when price goes down
        pnl = (entry_price - current_price) * amount * leverage;
      }
      
      // Calculate margin ratio (how close to liquidation)
      // 0 = safe, 1 = liquidated
      let margin_ratio = 0;
      const max_loss = position.collateral_sol * 95; // SOL price conversion needed
      
      if (pnl < 0) {
        margin_ratio = Math.abs(pnl) / max_loss;
      }
      
      return {
        pnl,
        margin_ratio: Math.min(margin_ratio, 1), // Cap at 1
        current_price
      };
      
    } catch (error) {
      console.error('Error calculating P&L:', error);
      throw error;
    }
  }

  // Create a new trading position
  async createPosition(data: CreatePositionData): Promise<TradingPosition> {
    try {
      // Get current token price for market orders
      let entry_price = data.target_price || 0;
      
      if (data.order_type === 'Market Order') {
        const tokenData = await fetchTokenDetail(data.token_address);
        if (!tokenData) {
          throw new Error(`Failed to fetch token data for ${data.token_address}`);
        }
        entry_price = tokenData.price;
      }
      
      // Calculate position value
      const position_value_usd = data.amount * entry_price * data.leverage;
      
      // Validate position size
      if (!this.validatePositionSize(position_value_usd, data.leverage)) {
        throw new Error(`Position size ${position_value_usd.toFixed(0)} exceeds limit for ${data.leverage}x leverage`);
      }
      
      // Calculate required collateral
      const collateral_sol = position_value_usd / data.leverage; // This needs SOL price conversion
      
      // Calculate liquidation and margin call prices
      const liquidation_price = this.calculateLiquidationPrice(entry_price, data.direction, data.leverage);
      const margin_call_price = this.calculateMarginCallPrice(entry_price, liquidation_price, data.direction);
      
      console.log('💰 Creating position:', {
        token: data.token_symbol,
        direction: data.direction,
        leverage: data.leverage,
        entry_price,
        position_value_usd,
        collateral_sol,
        liquidation_price,
        margin_call_price
      });
      
      // Insert position into database
      const { data: position, error } = await supabase
        .from('trading_positions')
        .insert({
          wallet_address: data.wallet_address,
          token_address: data.token_address,
          token_symbol: data.token_symbol,
          direction: data.direction,
          order_type: data.order_type,
          entry_price,
          target_price: data.target_price,
          amount: data.amount,
          leverage: data.leverage,
          collateral_sol,
          position_value_usd,
          stop_loss: data.stop_loss,
          take_profit: data.take_profit,
          status: data.order_type === 'Market Order' ? 'open' : 'pending',
          liquidation_price,
          margin_call_price
        })
        .select()
        .single();
      
      if (error) {
        console.error('Database error creating position:', error);
        throw new Error(`Failed to create position: ${error.message}`);
      }
      
      console.log('✅ Position created successfully:', position.id);
      return position;
      
    } catch (error) {
      console.error('Error creating position:', error);
      throw error;
    }
  }

  // Get user's positions
  async getUserPositions(wallet_address: string): Promise<TradingPosition[]> {
    try {
      const { data: positions, error } = await supabase
        .from('trading_positions')
        .select('*')
        .eq('wallet_address', wallet_address)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching positions:', error);
        throw error;
      }
      
      return positions || [];
      
    } catch (error) {
      console.error('Error getting user positions:', error);
      throw error;
    }
  }

  // Get open positions (for P&L monitoring)
  async getOpenPositions(): Promise<TradingPosition[]> {
    try {
      const { data: positions, error } = await supabase
        .from('trading_positions')
        .select('*')
        .eq('status', 'open');
      
      if (error) {
        console.error('Error fetching open positions:', error);
        throw error;
      }
      
      return positions || [];
      
    } catch (error) {
      console.error('Error getting open positions:', error);
      throw error;
    }
  }

  // Update position P&L
  async updatePositionPnL(position_id: number, update: PositionUpdate): Promise<void> {
    try {
      // Update position current_pnl
      const { error: positionError } = await supabase
        .from('trading_positions')
        .update({ 
          current_pnl: update.pnl,
          updated_at: new Date().toISOString()
        })
        .eq('id', position_id);
      
      if (positionError) {
        console.error('Error updating position P&L:', positionError);
        throw positionError;
      }
      
      // Insert position update record
      const { error: updateError } = await supabase
        .from('position_updates')
        .insert({
          position_id,
          price: update.price,
          pnl: update.pnl,
          margin_ratio: update.margin_ratio
        });
      
      if (updateError) {
        console.error('Error inserting position update:', updateError);
        throw updateError;
      }
      
    } catch (error) {
      console.error('Error updating position P&L:', error);
      throw error;
    }
  }

  // Check for margin calls
  async checkMarginCalls(): Promise<MarginCallAlert[]> {
    try {
      const openPositions = await this.getOpenPositions();
      const marginCallAlerts: MarginCallAlert[] = [];
      
      for (const position of openPositions) {
        const { pnl, margin_ratio, current_price } = await this.calculatePositionPnL(position);
        
        // Trigger margin call at 80% margin ratio
        if (margin_ratio >= 0.8 && !position.margin_call_triggered) {
          // Calculate how much collateral needed to get back to 50% margin ratio
          const safe_margin_ratio = 0.5;
          const current_loss = Math.abs(pnl);
          const safe_loss = position.collateral_sol * 95 * safe_margin_ratio; // Convert SOL to USD
          const required_additional_collateral = (current_loss - safe_loss) / 95; // Convert back to SOL
          
          marginCallAlerts.push({
            position,
            current_price,
            required_collateral: required_additional_collateral,
            shortfall: required_additional_collateral
          });
          
          // Mark margin call as triggered
          await supabase
            .from('trading_positions')
            .update({ margin_call_triggered: true })
            .eq('id', position.id);
          
          console.log(`⚠️ Margin call triggered for position ${position.id}:`, {
            token: position.token_symbol,
            current_price,
            margin_ratio,
            required_collateral: required_additional_collateral
          });
        }
      }
      
      return marginCallAlerts;
      
    } catch (error) {
      console.error('Error checking margin calls:', error);
      throw error;
    }
  }

  // Liquidate position
  async liquidatePosition(position_id: number, current_price: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('trading_positions')
        .update({
          status: 'liquidated',
          closed_at: new Date().toISOString(),
          close_price: current_price,
          close_reason: 'liquidation'
        })
        .eq('id', position_id);
      
      if (error) {
        console.error('Error liquidating position:', error);
        throw error;
      }
      
      console.log(`🔥 Position ${position_id} liquidated at price ${current_price}`);
      
    } catch (error) {
      console.error('Error liquidating position:', error);
      throw error;
    }
  }

  // Check for liquidations
  async checkLiquidations(): Promise<void> {
    try {
      const openPositions = await this.getOpenPositions();
      
      for (const position of openPositions) {
        const { margin_ratio, current_price } = await this.calculatePositionPnL(position);
        
        // Liquidate at 100% margin ratio
        if (margin_ratio >= 1.0) {
          await this.liquidatePosition(position.id, current_price);
          
          console.log(`🔥 Position liquidated:`, {
            id: position.id,
            token: position.token_symbol,
            direction: position.direction,
            entry_price: position.entry_price,
            liquidation_price: current_price,
            loss: position.collateral_sol
          });
        }
      }
      
    } catch (error) {
      console.error('Error checking liquidations:', error);
      throw error;
    }
  }

  // Close position manually
  async closePosition(position_id: number, close_reason: 'manual' | 'stop_loss' | 'take_profit'): Promise<void> {
    try {
      // Get current price
      const { data: position, error: fetchError } = await supabase
        .from('trading_positions')
        .select('*')
        .eq('id', position_id)
        .single();
      
      if (fetchError) throw fetchError;
      
      const tokenData = await fetchTokenDetail(position.token_address);
      if (!tokenData) {
        throw new Error(`Failed to fetch token data for ${position.token_address}`);
      }
      const current_price = tokenData.price;
      
      const { error } = await supabase
        .from('trading_positions')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          close_price: current_price,
          close_reason
        })
        .eq('id', position_id);
      
      if (error) {
        console.error('Error closing position:', error);
        throw error;
      }
      
      console.log(`✅ Position ${position_id} closed manually:`, {
        close_reason,
        close_price: current_price
      });
      
    } catch (error) {
      console.error('Error closing position:', error);
      throw error;
    }
  }
}

export const positionService = new PositionService(); 