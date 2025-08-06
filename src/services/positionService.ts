import { supabase, userProfileService } from './supabaseClient';
import { fetchTokenDetailCached, fetchSOLPrice } from './birdeyeApi';

// Add crypto for request hash generation
const crypto = typeof window !== 'undefined' ? window.crypto : require('crypto');

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
  // HIDDEN: Trading fee tracking (not exposed to users)
  trading_fee_usd?: number;
  trading_fee_sol?: number;
  trading_fee_percentage?: number;
  stop_loss?: number;
  take_profit?: number;
  status: 'pending' | 'opening' | 'open' | 'closing' | 'closed' | 'liquidated' | 'cancelled';
  current_pnl: number;
  liquidation_price: number;
  margin_call_triggered: boolean;
  margin_call_price?: number;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  close_price?: number;
  close_reason?: string;
  trade_results?: string; // JSON string containing trade results
  // Runtime properties added during P&L calculation
  current_price?: number;
  margin_ratio?: number;
  token_image?: string | null;
}

export interface CreatePositionData {
  wallet_address: string;
  token_address: string;
  token_symbol: string;
  direction: 'Long' | 'Short';
  order_type: 'Market Order' | 'Limit Order';
  target_price?: number; // For limit orders
  fresh_market_price?: number; // ADDED: For market orders - the absolute latest price from frontend
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

// Request hash generation for deduplication
function generateRequestHash(data: CreatePositionData, timestamp: number): string {
  const requestData = {
    wallet_address: data.wallet_address,
    token_address: data.token_address,
    direction: data.direction,
    order_type: data.order_type,
    amount: data.amount,
    leverage: data.leverage,
    // Round timestamp to 5-second window to allow minor timing differences
    time_window: Math.floor(timestamp / 5000) * 5000
  };
  
  const jsonString = JSON.stringify(requestData);
  
  if (typeof window !== 'undefined') {
    // Browser environment
    const encoder = new TextEncoder();
    const data = encoder.encode(jsonString);
    return btoa(String.fromCharCode(...new Uint8Array(data))).slice(0, 32);
  } else {
    // Node environment
    return crypto.createHash('sha256').update(jsonString).digest('hex').slice(0, 32);
  }
}

class PositionService {
  
  // Position size limits based on leverage
  private getMaxPositionSize(leverage: number): number {
    if (leverage >= 50) return 100_000_000; // $100M for 50x-100x
    if (leverage >= 10) return 50_000_000;  // $50M for 10x-49x
    if (leverage >= 2) return 10_000_000;   // $10M for 2x-9x
    return 5_000_000; // $5M default fallback
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

  // REMOVED: Hidden trading fee calculation - no longer needed
  // All fees are now consolidated into a single 20% fee on total return when closing positions

  // Calculate P&L for a position
  async calculatePositionPnL(position: TradingPosition): Promise<{
    pnl: number;
    margin_ratio: number;
    current_price: number;
  }> {
    try {
      // Get current token price and SOL price from Birdeye
      const [tokenData, sol_price] = await Promise.all([
        fetchTokenDetailCached(position.token_address),
        fetchSOLPrice()
      ]);
      
      if (!tokenData) {
        throw new Error(`Failed to fetch token data for ${position.token_address}`);
      }
      const current_price = tokenData.price;
      
      const entry_price = position.entry_price;
      const amount = position.amount;
      const leverage = position.leverage;
      
      // Calculate P&L in USD
      // amount = base token amount from user input
      // For leveraged trading, P&L should be calculated on the full leveraged exposure
      let pnl_usd = 0;
      
      console.log(`🧮 P&L DEBUG for position ${position.id}:`, {
        token: position.token_symbol,
        amount: amount,
        leverage: leverage, 
        entry_price: entry_price,
        current_price: current_price,
        direction: position.direction
      });
      
      if (position.direction === 'Long') {
        // Long: Profit when price goes up
        pnl_usd = (current_price - entry_price) * amount * leverage;
      } else {
        // Short: Profit when price goes down
        pnl_usd = (entry_price - current_price) * amount * leverage;
      }
      
      console.log(`💰 P&L Result: $${pnl_usd.toFixed(2)} USD`);
      
      // Calculate margin ratio in SOL terms (FIXED)
      const max_loss_sol = position.collateral_sol; // Max loss is the collateral in SOL
      const pnl_sol = pnl_usd / sol_price; // Convert P&L from USD to SOL
      
      let margin_ratio = 0;
      if (pnl_sol < 0) {
        margin_ratio = Math.abs(pnl_sol) / max_loss_sol;
      }
      
      return {
        pnl: pnl_usd, // Return P&L in USD for display
        margin_ratio: Math.min(margin_ratio, 1), // Cap at 1
        current_price
      };
      
    } catch (error) {
      console.error('Error calculating P&L:', error);
      throw error;
    }
  }

  // Create a new trading position using atomic database function
  async createPosition(data: CreatePositionData): Promise<TradingPosition> {
    try {
      console.log('🔒 SECURE POSITION CREATION STARTED (ATOMIC) 🔒');
      console.log('📥 RECEIVED DATA FROM FRONTEND:', data);
      
      // Generate request hash for deduplication
      const timestamp = Date.now();
      const requestHash = generateRequestHash(data, timestamp);
      console.log('🔑 Request hash generated:', requestHash);

      // Get current token price for market orders
      console.log('📊 STEP 1: DETERMINING ENTRY PRICE');
      let entry_price = data.target_price || 0;
      
      if (data.order_type === 'Market Order') {
        if (data.fresh_market_price) {
          entry_price = data.fresh_market_price;
          console.log('💰 MARKET ORDER - USING FRESH PRICE FROM FRONTEND:', entry_price);
        } else {
          const tokenData = await fetchTokenDetailCached(data.token_address);
          if (!tokenData) {
            throw new Error(`Failed to fetch token data for ${data.token_address}`);
          }
          entry_price = tokenData.price;
          console.log('💰 MARKET ORDER - FALLBACK ENTRY PRICE FROM API:', entry_price);
        }
      } else {
        console.log('🎯 LIMIT ORDER - ENTRY PRICE FROM USER:', entry_price);
      }
      
      // Get SOL price for calculations
      console.log('📊 STEP 2: FETCHING SOL PRICE');
      const sol_price = await fetchSOLPrice();
      console.log('💰 SOL PRICE:', sol_price);
      
      // Calculate position values
      console.log('📊 STEP 3: CALCULATING POSITION VALUES');
      const position_value_usd = data.amount * entry_price;
      const leveraged_exposure = position_value_usd * data.leverage;
      
      // Validate position size
      if (!this.validatePositionSize(leveraged_exposure, data.leverage)) {
        throw new Error(`Position size ${leveraged_exposure.toFixed(0)} exceeds limit for ${data.leverage}x leverage`);
      }
      
      // Calculate collateral and prices
      const collateral_usd = position_value_usd / data.leverage;
      const collateral_sol = collateral_usd / sol_price;
      const liquidation_price = this.calculateLiquidationPrice(entry_price, data.direction, data.leverage);
      const margin_call_price = this.calculateMarginCallPrice(entry_price, liquidation_price, data.direction);
      
      console.log('🔒 CALLING ATOMIC DATABASE FUNCTION');
      console.log('📊 Parameters:', {
        wallet: data.wallet_address,
        token: data.token_symbol,
        direction: data.direction,
        collateral_sol: collateral_sol,
        position_value_usd: position_value_usd,
        request_hash: requestHash
      });
      
      // Call atomic database function
      const { data: result, error } = await supabase.rpc('create_position_atomic', {
        p_wallet_address: data.wallet_address,
        p_token_address: data.token_address,
        p_token_symbol: data.token_symbol,
        p_direction: data.direction,
        p_order_type: data.order_type,
        p_entry_price: entry_price,
        p_target_price: data.target_price || null,
        p_amount: data.amount,
        p_leverage: data.leverage,
        p_collateral_sol: collateral_sol,
        p_position_value_usd: position_value_usd,
        p_stop_loss: data.stop_loss || null,
        p_take_profit: data.take_profit || null,
        p_liquidation_price: liquidation_price,
        p_margin_call_price: margin_call_price,
        p_request_hash: requestHash
      });
      
      if (error) {
        console.error('💥 ATOMIC FUNCTION ERROR:', error);
        
        // Handle specific error types
        if (error.message?.includes('Duplicate request detected')) {
          throw new Error('Request already in progress. Please wait before retrying.');
        } else if (error.message?.includes('already have an active position')) {
          throw new Error('You already have an active position for this token. Please close it first.');
        } else if (error.message?.includes('Insufficient SOL balance')) {
          throw new Error(error.message);
        } else {
        throw new Error(`Failed to create position: ${error.message}`);
      }
      }
      
      if (!result || !result.success) {
        throw new Error('Position creation failed - invalid response from database');
      }
      
      const positionId = result.position_id;
      console.log('✅ POSITION CREATED ATOMICALLY:', {
        position_id: positionId,
        previous_balance: result.previous_balance,
        new_balance: result.new_balance,
        collateral_deducted: result.collateral_deducted
      });
      
      // Fetch the created position
      const { data: position, error: fetchError } = await supabase
          .from('trading_positions')
        .select('*')
        .eq('id', positionId)
        .single();
        
      if (fetchError || !position) {
        console.error('💥 ERROR FETCHING CREATED POSITION:', fetchError);
        throw new Error('Position created but failed to fetch details');
      }

      console.log('🎉 SECURE POSITION CREATION COMPLETED 🎉');
      return position;
      
    } catch (error) {
      console.error('💥 SECURE POSITION CREATION ERROR 💥');
      console.error('Error message:', (error as any)?.message);
      console.error('Error details:', error);
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
        .in('status', ['open']); // Only include fully opened positions for liquidation monitoring
      
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
      const sol_price = await fetchSOLPrice(); // Get SOL price for conversions
      
      for (const position of openPositions) {
        const { pnl, margin_ratio, current_price } = await this.calculatePositionPnL(position);
        
        // Trigger margin call at 80% margin ratio
        if (margin_ratio >= 0.8 && !position.margin_call_triggered) {
          // Calculate how much collateral needed to get back to 50% margin ratio (in SOL terms)
          const safe_margin_ratio = 0.5;
          const current_loss_sol = Math.abs(pnl) / sol_price; // Convert USD loss to SOL using SOL price
          const safe_loss_sol = position.collateral_sol * safe_margin_ratio; // Safe loss in SOL
          const required_additional_collateral = current_loss_sol - safe_loss_sol; // Additional SOL needed
          
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
      // STEP 1: Get the position details first
      const { data: position, error: fetchError } = await supabase
        .from('trading_positions')
        .select('*')
        .eq('id', position_id)
        .single();
      
      if (fetchError) {
        console.error('Error fetching position for liquidation:', fetchError);
        throw fetchError;
      }

      // STEP 2: Calculate final P&L for the liquidated position
      const finalPnL = await this.calculatePositionPnL(position);
      const sol_price = await fetchSOLPrice();
      
      // STEP 3: Calculate amount to return to user (in liquidation, user typically loses most/all collateral)
      // In liquidation, user loses the full collateral amount (this is the risk of leverage trading)
      // NOTE: No profit fees charged on liquidations since they're always losses
      const collateralToReturn = 0; // In liquidation, user gets nothing back
      
      console.log('🔥 Liquidating position with collateral loss:', {
        position_id,
        token: position.token_symbol,
        collateral_lost: `${position.collateral_sol.toFixed(4)} SOL`,
        final_pnl: `$${finalPnL.pnl.toFixed(2)}`,
        liquidation_price: current_price
      });

      // STEP 4: Update position status to liquidated
      const { error } = await supabase
        .from('trading_positions')
        .update({
          status: 'liquidated',
          closed_at: new Date().toISOString(),
          close_price: current_price,
          close_reason: 'liquidation',
          current_pnl: finalPnL.pnl // Store final P&L
        })
        .eq('id', position_id);
      
      if (error) {
        console.error('Error liquidating position:', error);
        throw error;
      }
      
      console.log(`🔥 Position ${position_id} liquidated at price ${current_price} - Collateral lost: ${position.collateral_sol.toFixed(4)} SOL`);
      
    } catch (error) {
      console.error('Error liquidating position:', error);
      throw error;
    }
  }

  // Check for liquidations
  async checkLiquidations(): Promise<{ liquidatedCount: number; checkedCount: number }> {
    try {
      const openPositions = await this.getOpenPositions();
      let liquidatedCount = 0;
      
      console.log(`🔍 Checking ${openPositions.length} open positions for liquidation...`);
      
      for (const position of openPositions) {
        try {
        const { margin_ratio, current_price } = await this.calculatePositionPnL(position);
        
        // Liquidate at 100% margin ratio
        if (margin_ratio >= 1.0) {
          await this.liquidatePosition(position.id, current_price);
            liquidatedCount++;
          
            console.log(`🔥 AUTOMATIC LIQUIDATION:`, {
            id: position.id,
            token: position.token_symbol,
            direction: position.direction,
            entry_price: position.entry_price,
            liquidation_price: current_price,
              margin_ratio: `${(margin_ratio * 100).toFixed(1)}%`,
              collateral_lost: `${position.collateral_sol.toFixed(4)} SOL`
          });
        }
        } catch (error) {
          console.error(`Error checking position ${position.id} for liquidation:`, error);
          // Continue checking other positions
        }
      }
      
      if (liquidatedCount > 0) {
        console.log(`🚨 LIQUIDATION SUMMARY: ${liquidatedCount} positions liquidated out of ${openPositions.length} checked`);
      }
      
      return { liquidatedCount, checkedCount: openPositions.length };
      
    } catch (error) {
      console.error('Error checking liquidations:', error);
      throw error;
    }
  }

  // Close a position immediately
  async closePosition(position_id: number, close_reason: 'manual' | 'stop_loss' | 'take_profit'): Promise<void> {
    try {
      console.log(`🔒 CLOSING POSITION ${position_id} IMMEDIATELY 🔒`);
      
      // STEP 1: Get the position details
      const { data: position, error: fetchError } = await supabase
        .from('trading_positions')
        .select('*')
        .eq('id', position_id)
        .single();
      
      if (fetchError) throw fetchError;
      
      // STEP 2: Get current token price
      const tokenData = await fetchTokenDetailCached(position.token_address);
      if (!tokenData) {
        throw new Error(`Failed to fetch current price for ${position.token_symbol}`);
      }
      
      const close_price = tokenData.price;
      console.log(`💰 Closing position at current market price: $${close_price}`);
      
      // STEP 3: Calculate final P&L
      const finalPnL = await this.calculatePositionPnLWithPrice(position, close_price);
      
      // STEP 4: Calculate returns and fees - FIXED LOGIC
      const sol_price = await fetchSOLPrice();
      const pnlSOL = finalPnL.pnl / sol_price;
      
      // Calculate return amount: original collateral + P&L
      const totalReturnSOL = position.collateral_sol + pnlSOL;
      
      let actualReturnAmount: number;
      let platformFeeSOL = 0;
      
      if (pnlSOL > 0) {
        // User made profit - take 20% fee on profit only
        platformFeeSOL = pnlSOL * 0.20;
        actualReturnAmount = position.collateral_sol + (pnlSOL - platformFeeSOL);
      } else {
        // User made loss - no platform fee, return remaining collateral
        actualReturnAmount = Math.max(0, totalReturnSOL);
        platformFeeSOL = 0;
      }
      
      const pnlPercentage = (pnlSOL / position.collateral_sol) * 100;
      
      console.log(`💰 Position ${position_id} closing:`, {
        entry_price: position.entry_price,
        close_price: close_price,
        pnl_usd: finalPnL.pnl,
        pnl_sol: pnlSOL,
        original_collateral: position.collateral_sol,
        total_return_before_fees: totalReturnSOL,
        platform_fee_sol: platformFeeSOL,
        actual_return_sol: actualReturnAmount,
        pnl_percentage: pnlPercentage
      });
      
      // STEP 5: Always return remaining balance to user (even if small amount)
      const userProfile = await userProfileService.getProfile(position.wallet_address);
      if (userProfile && actualReturnAmount >= 0) {
        const newSOLBalance = userProfile.sol_balance + actualReturnAmount;
        const updateSuccess = await userProfileService.updateSOLBalance(position.wallet_address, newSOLBalance);
        
        if (updateSuccess) {
          console.log(`💰 Amount returned: ${userProfile.sol_balance.toFixed(6)} + ${actualReturnAmount.toFixed(6)} = ${newSOLBalance.toFixed(6)} SOL`);
        } else {
          console.error(`❌ CRITICAL: Failed to return ${actualReturnAmount.toFixed(6)} SOL to user ${position.wallet_address}`);
          throw new Error('Balance return failed - position closing aborted');
        }
      }

      // STEP 6: Update position status to closed
      const { error } = await supabase
        .from('trading_positions')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          close_price: close_price,
          current_pnl: finalPnL.pnl,
          close_reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', position_id);
      
      if (error) {
        console.error('Error finalizing position close:', error);
        throw error;
      }
      
      // STEP 7: Create trade results for the frontend
      const tradeResults = {
        tokenSymbol: position.token_symbol,
        direction: position.direction as 'Long' | 'Short',
        leverage: position.leverage,
        entryPrice: position.entry_price,
        exitPrice: close_price,
        positionSize: position.amount,
        collateralAmount: position.collateral_sol,
        grossPnL: finalPnL.pnl,
        platformFee: platformFeeSOL * sol_price,
        finalPnL: (actualReturnAmount * sol_price) - (position.collateral_sol * sol_price),
        pnlPercentage: pnlPercentage,
        totalReturn: actualReturnAmount
      };
      
      // Store results in the position record
      const { error: resultsError } = await supabase
        .from('trading_positions')
        .update({
          trade_results: JSON.stringify(tradeResults)
        })
        .eq('id', position_id);
      
      if (resultsError) {
        console.error('Error storing trade results:', resultsError);
      }
      
      console.log(`✅ Position ${position_id} closed immediately`);
      console.log('📊 Trade Results:', tradeResults);
      
    } catch (error) {
      console.error('Error closing position:', error);
      throw error;
    }
  }

  // Calculate P&L with a specific price
  private async calculatePositionPnLWithPrice(position: any, price: number): Promise<{ pnl: number; margin_ratio: number }> {
    const entry_price = position.entry_price;
    const amount = position.amount;
    const leverage = position.leverage;
    
    // Calculate P&L in USD
    // FIXED: Don't multiply by leverage - amount already represents the leveraged position
    let pnl_usd = 0;
    if (position.direction === 'Long') {
      pnl_usd = (price - entry_price) * amount;
    } else {
      pnl_usd = (entry_price - price) * amount;
    }
    
    // Get REAL-TIME SOL price instead of hardcoded value
    const sol_price = await fetchSOLPrice();
    
    // Calculate margin ratio using real SOL price
    const max_loss_sol = position.collateral_sol;
    const pnl_sol = pnl_usd / sol_price; // Use real-time SOL price
    let margin_ratio = 0;
    if (pnl_sol < 0) {
      margin_ratio = Math.abs(pnl_sol) / max_loss_sol;
    }
    
    console.log('📊 P&L Calculation:', {
      token: position.token_symbol,
      price_used: price,
      entry_price: entry_price,
      pnl_usd: pnl_usd,
      sol_price_real_time: sol_price,
      pnl_sol: pnl_sol,
      collateral_sol: max_loss_sol,
      margin_ratio: margin_ratio
    });
    
    return {
      pnl: pnl_usd,
      margin_ratio: Math.min(margin_ratio, 1)
    };
  }
}

export const positionService = new PositionService(); 