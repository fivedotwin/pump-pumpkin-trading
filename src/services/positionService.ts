import { supabase } from './supabaseClient';
import { fetchTokenDetailCached, fetchTokenPriceCached, fetchSOLPrice } from './birdeyeApi';
import { userProfileService } from './supabaseClient'; // Import userProfileService

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
      let pnl_usd = 0;
      if (position.direction === 'Long') {
        // Long: Profit when price goes up
        pnl_usd = (current_price - entry_price) * amount * leverage;
      } else {
        // Short: Profit when price goes down
        pnl_usd = (entry_price - current_price) * amount * leverage;
      }
      
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

  // Create a new trading position
  async createPosition(data: CreatePositionData): Promise<TradingPosition> {
    try {
      console.log('🏦🏦🏦 BACKEND POSITION CREATION STARTED 🏦🏦🏦');
      console.log('📥 RECEIVED DATA FROM FRONTEND:', data);
      
      // STEP 1: Get current user profile to check SOL balance
      console.log('📊 BACKEND STEP 1: FETCHING USER PROFILE');
      const userProfile = await userProfileService.getProfile(data.wallet_address);
      if (!userProfile) {
        throw new Error('User profile not found. Please create a profile first.');
      }
      console.log('👤 USER PROFILE:', {
        wallet_address: userProfile.wallet_address,
        username: userProfile.username,
        sol_balance: userProfile.sol_balance
      });

      // Get current token price for market orders - USE FRESH PRICE FROM FRONTEND IF PROVIDED
      console.log('📊 BACKEND STEP 2: DETERMINING ENTRY PRICE');
      let entry_price = data.target_price || 0;
      
      if (data.order_type === 'Market Order') {
        if (data.fresh_market_price) {
          // USE THE ULTRA-FRESH PRICE FROM FRONTEND (Birdeye WebSocket/REST)
          entry_price = data.fresh_market_price;
          console.log('💰 MARKET ORDER - USING ULTRA-FRESH PRICE FROM FRONTEND:', entry_price);
          console.log('⚡ This price was just fetched from Birdeye WebSocket/REST in frontend for maximum accuracy');
        } else {
          // Fallback to backend API call if fresh price not provided
          const tokenData = await fetchTokenDetailCached(data.token_address);
          if (!tokenData) {
            throw new Error(`Failed to fetch token data for ${data.token_address}`);
          }
          entry_price = tokenData.price;
          console.log('💰 MARKET ORDER - FALLBACK ENTRY PRICE FROM BACKEND API:', entry_price);
        }
      } else {
        console.log('🎯 LIMIT ORDER - ENTRY PRICE FROM USER:', entry_price);
      }
      
      // Get current SOL price for collateral calculation
      console.log('📊 BACKEND STEP 3: FETCHING SOL PRICE');
      const sol_price = await fetchSOLPrice();
      console.log('💰 SOL PRICE FROM API:', sol_price);
      
      // FIXED: Calculate position value correctly (without leverage multiplication)
      console.log('📊 BACKEND STEP 4: CALCULATING POSITION VALUES');
      const position_value_usd = data.amount * entry_price; // Base position value in USD
      console.log('🔢 BASE POSITION VALUE CALCULATION:', {
        token_amount: data.amount,
        entry_price: entry_price,
        position_value_usd: position_value_usd,
        'FORMULA': 'token_amount × entry_price = position_value_usd'
      });
      
      // Validate position size (check leveraged exposure)
      const leveraged_exposure = position_value_usd * data.leverage;
      console.log('🔢 LEVERAGED EXPOSURE CALCULATION:', {
        position_value_usd: position_value_usd,
        leverage: data.leverage,
        leveraged_exposure: leveraged_exposure,
        'FORMULA': 'position_value_usd × leverage = leveraged_exposure'
      });
      
      if (!this.validatePositionSize(leveraged_exposure, data.leverage)) {
        throw new Error(`Position size ${leveraged_exposure.toFixed(0)} exceeds limit for ${data.leverage}x leverage`);
      }
      
      // FIXED: Calculate required collateral in SOL
      console.log('📊 BACKEND STEP 5: CALCULATING COLLATERAL REQUIREMENTS');
      const collateral_usd = position_value_usd / data.leverage; // Collateral needed in USD
      const collateral_sol = collateral_usd / sol_price; // Convert to SOL
      
      console.log('🔢 COLLATERAL CALCULATION:', {
        position_value_usd: position_value_usd,
        leverage: data.leverage,
        collateral_usd: collateral_usd,
        sol_price: sol_price,
        collateral_sol: collateral_sol,
        'FORMULA_1': 'position_value_usd ÷ leverage = collateral_usd',
        'FORMULA_2': 'collateral_usd ÷ sol_price = collateral_sol'
      });

      // REMOVED: Calculate trading fee on base position value (matches frontend)
      // console.log('📊 BACKEND STEP 6: CALCULATING HIDDEN TRADING FEES');
      // const tradingFee = this.calculateTradingFee(data.leverage, position_value_usd, sol_price);
      // console.log('💰 HIDDEN TRADING FEE CALCULATION:', {
      //   leverage: data.leverage,
      //   position_value_usd: position_value_usd,
      //   fee_percentage: `${(tradingFee.fee_percentage * 100).toFixed(1)}%`,
      //   fee_usd: tradingFee.fee_usd,
      //   fee_sol: tradingFee.fee_sol,
      //   'NOTE': 'FEE CALCULATED ON BASE POSITION VALUE AND HIDDEN FROM USERS'
      // });
      
      // Total SOL requirement = Collateral + Trading Fee (hidden from user)
      // const total_required_sol = collateral_sol + tradingFee.fee_sol;
      // console.log('🔢 TOTAL SOL REQUIREMENT CALCULATION:', {
      //   collateral_sol: collateral_sol,
      //   trading_fee_sol: tradingFee.fee_sol,
      //   total_required_sol: total_required_sol,
      //   'FORMULA': 'collateral_sol + trading_fee_sol = total_required_sol'
      // });

      // STEP 2: Check if user has sufficient SOL balance for collateral + fee
      console.log('📊 BACKEND STEP 7: VALIDATING SOL BALANCE');
      console.log('🔍 BACKEND SOL-BASED VALIDATION:', {
        wallet_address: data.wallet_address,
        token: data.token_symbol,
        base_position_value_usd: position_value_usd,
        leveraged_exposure_usd: leveraged_exposure,
        db_sol_balance: userProfile.sol_balance,
        collateral_sol: collateral_sol,
        // trading_fee_sol: tradingFee.fee_sol, // Hidden from UI
        // total_required_sol: total_required_sol,
        validation_will_pass: userProfile.sol_balance >= collateral_sol, // Only collateral is required
        shortfall: Math.max(0, collateral_sol - userProfile.sol_balance),
        sol_price: sol_price
      });
      
      if (userProfile.sol_balance < collateral_sol) {
        const shortfall = collateral_sol - userProfile.sol_balance;
        console.log('❌ VALIDATION FAILED - INSUFFICIENT SOL BALANCE');
        // User sees this as "insufficient collateral" without knowing about fees
        throw new Error(`Insufficient SOL balance. Need ${collateral_sol.toFixed(4)} SOL collateral, but only have ${userProfile.sol_balance.toFixed(4)} SOL. Shortfall: ${shortfall.toFixed(4)} SOL`);
      }
      console.log('✅ VALIDATION PASSED - SUFFICIENT SOL BALANCE');
      
      // Calculate liquidation and margin call prices
      console.log('📊 BACKEND STEP 8: CALCULATING LIQUIDATION PRICES');
      const liquidation_price = this.calculateLiquidationPrice(entry_price, data.direction, data.leverage);
      const margin_call_price = this.calculateMarginCallPrice(entry_price, liquidation_price, data.direction);
      
      console.log('⚠️ LIQUIDATION PRICE CALCULATION:', {
        entry_price: entry_price,
        direction: data.direction,
        leverage: data.leverage,
        liquidation_price: liquidation_price,
        margin_call_price: margin_call_price
      });

      // STEP 3: Create position in database first
      console.log('📊 BACKEND STEP 9: INSERTING POSITION INTO DATABASE');
      const positionDbData = {
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
        // REMOVED: Store trading fee information (not exposed to users)
        // trading_fee_usd: tradingFee.fee_usd,
        // trading_fee_sol: tradingFee.fee_sol,
        // trading_fee_percentage: tradingFee.fee_percentage,
        stop_loss: data.stop_loss,
        take_profit: data.take_profit,
        status: data.order_type === 'Market Order' ? 'opening' : 'pending',
        liquidation_price,
        margin_call_price
      };
      
      console.log('📤 EXACT DATABASE INSERT DATA:', positionDbData);
      
      const { data: position, error } = await supabase
        .from('trading_positions')
        .insert(positionDbData)
        .select()
        .single();
      
      if (error) {
        console.error('💥 DATABASE ERROR CREATING POSITION:', error);
        throw new Error(`Failed to create position: ${error.message}`);
      }
      
      console.log('✅ POSITION SUCCESSFULLY INSERTED INTO DATABASE:', {
        position_id: position.id,
        database_record: position
      });

      // STEP 4: Deduct collateral from user's SOL balance
      console.log('📊 BACKEND STEP 10: UPDATING USER SOL BALANCE');
      const newSOLBalance = userProfile.sol_balance - collateral_sol;
      
      console.log('💰 SOL BALANCE UPDATE CALCULATION:', {
        previous_balance: userProfile.sol_balance,
        total_deduction: collateral_sol,
        new_balance: newSOLBalance,
        'FORMULA': 'previous_balance - total_deduction = new_balance'
      });
      
      const balanceUpdated = await userProfileService.updateSOLBalance(data.wallet_address, newSOLBalance);
      
      if (!balanceUpdated) {
        // ROLLBACK: If balance update fails, delete the position we just created
        console.error('❌ FAILED TO UPDATE SOL BALANCE - ROLLING BACK POSITION');
        await supabase
          .from('trading_positions')
          .delete()
          .eq('id', position.id);
        
        throw new Error('Failed to deduct collateral from SOL balance. Position creation cancelled.');
      }

      console.log('✅ SOL BALANCE SUCCESSFULLY UPDATED');
      
      // STEP 5: Start delayed opening for Market Orders
      if (data.order_type === 'Market Order') {
        console.log(`⏳ Starting 1-minute delayed opening for Market Order ${position.id} - Anti-Gaming Protection Active`);
        this.startDelayedOpening(position.id);
      }
      
      console.log('🎉🎉🎉 BACKEND POSITION CREATION COMPLETED 🎉🎉🎉');
      console.log('📊 FINAL SUMMARY:', {
        position_id: position.id,
        token: data.token_symbol,
        direction: data.direction,
        leverage: `${data.leverage}x`,
        entry_price: entry_price,
        position_value_usd: position_value_usd,
        collateral_sol: collateral_sol,
        // trading_fee_sol: tradingFee.fee_sol,
        total_deducted_sol: collateral_sol,
        new_sol_balance: newSOLBalance,
        status: position.status
      });
      
      return position;
      
    } catch (error) {
      console.error('💥💥💥 BACKEND POSITION CREATION ERROR 💥💥💥');
      console.error('Error type:', typeof error);
      console.error('Error message:', (error as any)?.message);
      console.error('Error details:', error);
      console.error('Stack trace:', (error as any)?.stack);
      console.log('🏁 BACKEND POSITION CREATION PROCESS ENDED WITH ERROR 🏁');
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

  // Initiate position closing (starts 1-minute delay with worst-price selection)
  async closePosition(position_id: number, close_reason: 'manual' | 'stop_loss' | 'take_profit'): Promise<void> {
    try {
      console.log(`🔄 INITIATING 1-MINUTE DELAYED CLOSE for position ${position_id} - Anti-Gaming Protection Active`);
      
      // STEP 1: Get the position details first
      const { data: position, error: fetchError } = await supabase
        .from('trading_positions')
        .select('*')
        .eq('id', position_id)
        .single();
      
      if (fetchError) throw fetchError;
      
      // STEP 2: Set position status to 'closing' and record close initiation time
      const { error } = await supabase
        .from('trading_positions')
        .update({
          status: 'closing',
          close_reason,
          updated_at: new Date().toISOString(),
          // Store when close was initiated for the 1-minute timer
          close_initiated_at: new Date().toISOString()
        })
        .eq('id', position_id);
      
      if (error) {
        console.error('Error initiating position close:', error);
        throw error;
      }
      
      console.log(`⏳ Position ${position_id} marked as CLOSING - Will execute in 1 minute with WORST price to prevent gaming`);
      
      // STEP 3: Start the 1-minute delayed closing process
      this.startDelayedClosing(position_id);
      
    } catch (error) {
      console.error('Error initiating position close:', error);
      throw error;
    }
  }

  // Execute delayed closing with worst-price selection (anti-gaming)
  private async startDelayedClosing(position_id: number): Promise<void> {
    console.log(`🎯 Starting 1-minute price sampling for position ${position_id} - Will pick WORST price for user`);
    
    // Get position details
    const { data: position, error: fetchError } = await supabase
      .from('trading_positions')
      .select('*')
      .eq('id', position_id)
      .single();
    
    if (fetchError || !position) {
      console.error('Failed to fetch position for delayed closing:', fetchError);
      return;
    }
    
    const priceSamples: { price: number; timestamp: number }[] = [];
    const sampleInterval = 5000; // Sample every 5 seconds
    const totalDuration = 60000; // 1 minute total
    
    // Sample prices every 5 seconds for 1 minute
    const samplePrices = async () => {
      try {
        const tokenData = await fetchTokenDetailCached(position.token_address);
        if (tokenData) {
          const sample = {
            price: tokenData.price,
            timestamp: Date.now()
          };
          priceSamples.push(sample);
          
          console.log(`📊 Price sample ${priceSamples.length}/12 for position ${position_id}: $${sample.price.toFixed(6)}`);
        }
      } catch (error) {
        console.error('Error sampling price:', error);
      }
    };
    
    // Start sampling immediately
    await samplePrices();
    
    // Continue sampling every 5 seconds
    const sampleIntervalId = setInterval(samplePrices, sampleInterval);
    
    // After 1 minute, execute the closing with worst price
    setTimeout(async () => {
      clearInterval(sampleIntervalId);
      
      // Get final sample
      await samplePrices();
      
      if (priceSamples.length === 0) {
        console.error(`❌ No price samples collected for position ${position_id}, cancelling close`);
        return;
      }
      
      // Find the WORST price for the user (closest to liquidation)
      const worstPrice = this.findWorstPriceForUser(position, priceSamples);
      
      console.log(`🎯 EXECUTING DELAYED CLOSE for position ${position_id}:`, {
        samples_collected: priceSamples.length,
        price_range: `$${Math.min(...priceSamples.map(s => s.price)).toFixed(6)} - $${Math.max(...priceSamples.map(s => s.price)).toFixed(6)}`,
        worst_price_selected: `$${worstPrice.toFixed(6)}`,
        reason: 'Anti-gaming protection - worst price selected'
      });
      
      // Execute the actual closing with the worst price
      await this.executeDelayedClose(position_id, worstPrice);
      
    }, totalDuration);
  }

  // Find the worst price for the user (closest to liquidation)
  private findWorstPriceForUser(position: any, priceSamples: { price: number; timestamp: number }[]): number {
    const liquidationPrice = position.liquidation_price;
    
    // For Long positions: worst price is the LOWEST price (closest to liquidation)
    // For Short positions: worst price is the HIGHEST price (closest to liquidation)
    
    if (position.direction === 'Long') {
      // For Long: lower price = worse for user (closer to liquidation)
      const worstPrice = Math.min(...priceSamples.map(s => s.price));
      console.log(`📉 Long position - selecting LOWEST price: $${worstPrice.toFixed(6)} (liquidation at $${liquidationPrice.toFixed(6)})`);
      return worstPrice;
    } else {
      // For Short: higher price = worse for user (closer to liquidation)  
      const worstPrice = Math.max(...priceSamples.map(s => s.price));
      console.log(`📈 Short position - selecting HIGHEST price: $${worstPrice.toFixed(6)} (liquidation at $${liquidationPrice.toFixed(6)})`);
      return worstPrice;
    }
  }

  // Execute the actual closing with the selected worst price
  private async executeDelayedClose(position_id: number, close_price: number): Promise<void> {
    try {
      // Get fresh position data
      const { data: position, error: fetchError } = await supabase
        .from('trading_positions')
        .select('*')
        .eq('id', position_id)
        .single();
      
      if (fetchError || !position) {
        console.error('Failed to fetch position for delayed close execution:', fetchError);
        return;
      }
      
      // Check if position is still in 'closing' status
      if (position.status !== 'closing') {
        console.log(`⚠️ Position ${position_id} is no longer in closing status (${position.status}), skipping delayed close`);
        return;
      }
      
      // Calculate P&L with the selected worst price
      const finalPnL = this.calculatePositionPnLWithPrice(position, close_price);
      const sol_price = await fetchSOLPrice();
      
      // Calculate total return amount (collateral + P&L)
      const pnl_in_sol = finalPnL.pnl / sol_price;
      const totalReturnAmount = position.collateral_sol + pnl_in_sol;
      
      // NEW FEE STRUCTURE: 20% fee on ALL returns (profit OR loss)
      let platformFeeSOL = 0;
      let actualReturnAmount = 0;
      
      if (totalReturnAmount > 0) {
        // Always charge 20% fee on any positive return amount
        platformFeeSOL = totalReturnAmount * 0.20;
        actualReturnAmount = totalReturnAmount - platformFeeSOL;
        
        console.log('💰 PLATFORM FEE CALCULATION (20% on all returns):', {
          collateral_sol: position.collateral_sol.toFixed(4),
          pnl_sol: pnl_in_sol.toFixed(4),
          total_return_sol: totalReturnAmount.toFixed(4),
          platform_fee_sol: platformFeeSOL.toFixed(4),
          user_receives_sol: actualReturnAmount.toFixed(4),
          fee_percentage: '20% on ALL returns (profit or loss)'
        });
      } else {
        // If total return is zero or negative, user gets nothing
        actualReturnAmount = 0;
        platformFeeSOL = 0;
        
        console.log('💰 TOTAL LIQUIDATION - NO RETURN:', {
          collateral_sol: position.collateral_sol.toFixed(4),
          pnl_sol: pnl_in_sol.toFixed(4),
          total_return_sol: totalReturnAmount.toFixed(4),
          user_receives_sol: '0.0000',
          platform_fee_sol: '0.0000',
          note: 'Complete loss - liquidated'
        });
      }
      
      // Calculate percentage return for display
      const pnlPercentage = (finalPnL.pnl / (position.collateral_sol * sol_price)) * 100;
      
      console.log('🎯 DELAYED CLOSE EXECUTION with new fee structure:', {
        position_id,
        token: position.token_symbol,
        close_reason: position.close_reason,
        original_collateral: `${position.collateral_sol.toFixed(4)} SOL`,
        pnl_usd: `$${finalPnL.pnl.toFixed(2)}`,
        total_return: `${totalReturnAmount.toFixed(4)} SOL`,
        platform_fee: `${platformFeeSOL.toFixed(4)} SOL`,
        user_receives: `${actualReturnAmount.toFixed(4)} SOL`,
        close_price: close_price,
        fee_note: '20% charged on ALL returns (profit or loss)',
        worst_price_protection: 'ACTIVE'
      });

      // Return amount to user's SOL balance
      if (actualReturnAmount > 0) {
        const userProfile = await userProfileService.getProfile(position.wallet_address);
        if (userProfile) {
          const newSOLBalance = userProfile.sol_balance + actualReturnAmount;
          await userProfileService.updateSOLBalance(position.wallet_address, newSOLBalance);
          
          console.log(`💰 Amount returned: ${userProfile.sol_balance.toFixed(4)} + ${actualReturnAmount.toFixed(4)} = ${newSOLBalance.toFixed(4)} SOL`);
        }
      }

      // Update position status to closed
      const { error } = await supabase
        .from('trading_positions')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          close_price: close_price,
          current_pnl: finalPnL.pnl // Store gross P&L before fees
        })
        .eq('id', position_id);
      
      if (error) {
        console.error('Error finalizing delayed close:', error);
        throw error;
      }
      
      // Create trade results for the frontend
      const tradeResults = {
        tokenSymbol: position.token_symbol,
        direction: position.direction as 'Long' | 'Short',
        leverage: position.leverage,
        entryPrice: position.entry_price,
        exitPrice: close_price,
        positionSize: position.amount,
        collateralAmount: position.collateral_sol,
        grossPnL: finalPnL.pnl,           // Gross P&L before fees
        platformFee: platformFeeSOL * sol_price, // Platform fee in USD for display
        finalPnL: (actualReturnAmount * sol_price) - (position.collateral_sol * sol_price), // Net P&L after fees
        pnlPercentage: pnlPercentage,
        totalReturn: actualReturnAmount
      };
      
      // Store results in the position record itself for frontend pickup
      const { error: resultsError } = await supabase
        .from('trading_positions')
        .update({
          trade_results: JSON.stringify(tradeResults)
        })
        .eq('id', position_id);
      
      if (resultsError) {
        console.error('Error storing trade results:', resultsError);
      }
      
      console.log(`✅ Position ${position_id} closed with new fee structure - 20% on ALL returns`);
      console.log('📊 Trade Results saved for frontend:', tradeResults);
      
    } catch (error) {
      console.error('Error executing delayed close:', error);
    }
  }

  // Execute delayed opening with worst-price selection (anti-gaming)
  private async startDelayedOpening(position_id: number): Promise<void> {
    console.log(`🎯 Starting 1-minute price sampling for opening position ${position_id} - Will pick WORST price for user`);
    
    // Get position details
    const { data: position, error: fetchError } = await supabase
      .from('trading_positions')
      .select('*')
      .eq('id', position_id)
      .single();
    
    if (fetchError || !position) {
      console.error('Failed to fetch position for delayed opening:', fetchError);
      return;
    }
    
    const priceSamples: { price: number; timestamp: number }[] = [];
    const sampleInterval = 5000; // Sample every 5 seconds
    const totalDuration = 60000; // 1 minute total
    
    // Sample prices every 5 seconds for 1 minute
    const samplePrices = async () => {
      try {
        const tokenData = await fetchTokenDetailCached(position.token_address);
        if (tokenData) {
          const sample = {
            price: tokenData.price,
            timestamp: Date.now()
          };
          priceSamples.push(sample);
          
          console.log(`📊 Opening price sample ${priceSamples.length}/12 for position ${position_id}: $${sample.price.toFixed(6)}`);
        }
      } catch (error) {
        console.error('Error sampling opening price:', error);
      }
    };
    
    // Start sampling immediately
    await samplePrices();
    
    // Continue sampling every 5 seconds
    const sampleIntervalId = setInterval(samplePrices, sampleInterval);
    
    // After 1 minute, execute the opening with worst price
    setTimeout(async () => {
      clearInterval(sampleIntervalId);
      
      // Get final sample
      await samplePrices();
      
      if (priceSamples.length === 0) {
        console.error(`❌ No price samples collected for opening position ${position_id}, cancelling open`);
        return;
      }
      
      // Find the WORST price for opening (opposite logic from closing)
      const worstOpeningPrice = this.findWorstOpeningPrice(position, priceSamples);
      
      console.log(`🎯 EXECUTING DELAYED OPENING for position ${position_id}:`, {
        samples_collected: priceSamples.length,
        price_range: `$${Math.min(...priceSamples.map(s => s.price)).toFixed(6)} - $${Math.max(...priceSamples.map(s => s.price)).toFixed(6)}`,
        worst_opening_price: `$${worstOpeningPrice.toFixed(6)}`,
        reason: 'Anti-gaming protection - worst opening price selected'
      });
      
      // Execute the actual opening with the worst price
      await this.executeDelayedOpening(position_id, worstOpeningPrice);
      
    }, totalDuration);
  }

  // Find the worst opening price for the user
  private findWorstOpeningPrice(position: any, priceSamples: { price: number; timestamp: number }[]): number {
    // For OPENING positions:
    // Long positions (buying): HIGHEST price is worst for user
    // Short positions (selling): LOWEST price is worst for user
    
    if (position.direction === 'Long') {
      // For Long opening: higher price = worse for user (paying more to buy)
      const worstPrice = Math.max(...priceSamples.map(s => s.price));
      console.log(`📈 Long opening - selecting HIGHEST price: $${worstPrice.toFixed(6)} (user pays more)`);
      return worstPrice;
    } else {
      // For Short opening: lower price = worse for user (receiving less when selling)
      const worstPrice = Math.min(...priceSamples.map(s => s.price));
      console.log(`📉 Short opening - selecting LOWEST price: $${worstPrice.toFixed(6)} (user receives less)`);
      return worstPrice;
    }
  }

  // Execute the actual opening with the selected worst price
  private async executeDelayedOpening(position_id: number, entry_price: number): Promise<void> {
    try {
      // Get fresh position data
      const { data: position, error: fetchError } = await supabase
        .from('trading_positions')
        .select('*')
        .eq('id', position_id)
        .single();
      
      if (fetchError || !position) {
        console.error('Failed to fetch position for delayed opening execution:', fetchError);
        return;
      }
      
      // Check if position is still in 'opening' status
      if (position.status !== 'opening') {
        console.log(`⚠️ Position ${position_id} is no longer in opening status (${position.status}), skipping delayed opening`);
        return;
      }
      
      // Recalculate liquidation price with the new entry price
      const liquidation_price = this.calculateLiquidationPrice(entry_price, position.direction, position.leverage);
      const margin_call_price = this.calculateMarginCallPrice(entry_price, liquidation_price, position.direction);
      
      console.log('🎯 DELAYED OPENING EXECUTION with worst price:', {
        position_id,
        token: position.token_symbol,
        direction: position.direction,
        leverage: position.leverage,
        original_entry_price: position.entry_price,
        final_entry_price: entry_price,
        liquidation_price: liquidation_price,
        worst_price_protection: 'ACTIVE'
      });

      // Update position with final entry price and set to open
      const { error } = await supabase
        .from('trading_positions')
        .update({
          status: 'open',
          entry_price: entry_price,
          liquidation_price: liquidation_price,
          margin_call_price: margin_call_price,
          updated_at: new Date().toISOString()
        })
        .eq('id', position_id);
      
      if (error) {
        console.error('Error finalizing delayed opening:', error);
        throw error;
      }
      
      console.log(`✅ Position ${position_id} opened with 1-minute delay - Anti-gaming protection successful`);
      
    } catch (error) {
      console.error('Error executing delayed opening:', error);
    }
  }

  // Calculate P&L with a specific price
  private calculatePositionPnLWithPrice(position: any, price: number): { pnl: number; margin_ratio: number } {
    const entry_price = position.entry_price;
    const amount = position.amount;
    const leverage = position.leverage;
    
    // Calculate P&L in USD
    let pnl_usd = 0;
    if (position.direction === 'Long') {
      pnl_usd = (price - entry_price) * amount * leverage;
    } else {
      pnl_usd = (entry_price - price) * amount * leverage;
    }
    
    // Calculate margin ratio
    const max_loss_sol = position.collateral_sol;
    const pnl_sol = pnl_usd / 98.45; // Using average SOL price
    let margin_ratio = 0;
    if (pnl_sol < 0) {
      margin_ratio = Math.abs(pnl_sol) / max_loss_sol;
    }
    
    return {
      pnl: pnl_usd,
      margin_ratio: Math.min(margin_ratio, 1)
    };
  }
}

export const positionService = new PositionService(); 