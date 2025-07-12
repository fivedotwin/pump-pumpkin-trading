import React, { useState, useEffect } from 'react';
import { X, ChevronDown, TrendingUp, TrendingDown, AlertTriangle, Wallet, Calculator, Loader2 } from 'lucide-react';
import { formatPrice, fetchSOLPrice, fetchTokenDetailCached, TokenDetailData } from '../services/birdeyeApi';
import { positionService, CreatePositionData } from '../services/positionService';
import { userProfileService } from '../services/supabaseClient';
import { subscribeToJupiterPrice, getJupiterPrice } from '../services/birdeyeWebSocket'; // Note: Actually using Birdeye WebSocket
import unifiedPriceService from '../services/unifiedPriceService';
import TradeLoadingModal from './TradeLoadingModal';
import TradeSuccessModal from './TradeSuccessModal';
import { soundManager } from '../services/soundManager';

interface TradingModalProps {
  tokenData: TokenDetailData;
  onClose: () => void;
  userSOLBalance?: number; // Add SOL balance prop
  userUSDBalance?: number; // Add USD balance prop
  walletAddress: string; // Add wallet address for position creation
  onUpdateSOLBalance?: (newBalance: number) => void; // Add callback for SOL balance updates
  onShowTerms: () => void;
  onNavigateToPositions?: () => void; // Add callback to navigate to positions tab
}

type OrderType = 'Market Order' | 'Limit Order';
type TradeDirection = 'Long' | 'Short';

export default function TradingModal({ tokenData, onClose, userSOLBalance = 0, userUSDBalance = 0, walletAddress, onUpdateSOLBalance, onShowTerms, onNavigateToPositions }: TradingModalProps) {
  const [tradeDirection, setTradeDirection] = useState<TradeDirection>('Long');
  const [orderType, setOrderType] = useState<OrderType>('Market Order');
  const [price, setPrice] = useState(tokenData.price.toString());
  const [amount, setAmount] = useState('');
  const [leverage, setLeverage] = useState(2);
  const [tpSl, setTpSl] = useState(false);
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [showOrderTypeDropdown, setShowOrderTypeDropdown] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{
    stopLoss?: string;
    takeProfit?: string;
    position?: string;
  }>({});
  const [isExecutingTrade, setIsExecutingTrade] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);
  
  // Trade loading modal state
  const [showTradeLoading, setShowTradeLoading] = useState(false);
  const [loadingTradeData, setLoadingTradeData] = useState<{
    type: 'opening' | 'closing';
    tokenSymbol: string;
    direction: 'Long' | 'Short';
    leverage: number;
  } | null>(null);
  
  // Trade success modal state
  const [showTradeSuccess, setShowTradeSuccess] = useState(false);
  
  // CRITICAL: SOL price state for live trading - NO FALLBACK ALLOWED
  const [solPrice, setSolPrice] = useState<number | null>(null); // null = price not loaded yet
  const [isPriceLoading, setIsPriceLoading] = useState<boolean>(true);
  const [priceError, setPriceError] = useState<string | null>(null);
  

  
  // Subscribe to unified price service for ultra-fast token price updates
  useEffect(() => {
    console.log(`🚀 TradingModal: Subscribing to ULTRA-FAST unified price service for ${tokenData.symbol}`);
    
    // Add to high-priority tokens for 500ms updates since user is actively trading
    unifiedPriceService.addHighPriorityToken(tokenData.address);
    unifiedPriceService.trackTokens([tokenData.address]);
    
    return () => {
      console.log(`🔌 TradingModal: Removing ${tokenData.symbol} from high-priority trading tokens`);
      unifiedPriceService.removeHighPriorityToken(tokenData.address);
      unifiedPriceService.untrackTokens([tokenData.address]);
    };
  }, [tokenData.address, tokenData.symbol]);

  // Load SOL price on component mount - CRITICAL FOR LIVE TRADING
  useEffect(() => {
    const loadSOLPrice = async () => {
      setIsPriceLoading(true);
      setPriceError(null);
      
      try {
        const price = await fetchSOLPrice();
        setSolPrice(price);
        console.log('💰 SOL price loaded in TradingModal:', `$${price.toFixed(2)}`);
      } catch (error) {
        console.error('❌ CRITICAL: Failed to load SOL price in TradingModal:', error);
        setPriceError('Prices updating, try again in a moment');
        setSolPrice(null);
      } finally {
        setIsPriceLoading(false);
      }
    };
    
    loadSOLPrice();
    
    // Refresh SOL price every 2 minutes for conservative rate limiting
    const priceInterval = setInterval(loadSOLPrice, 120000);
    
    return () => clearInterval(priceInterval);
  }, []);





  // Retry price loading function
  const retryPriceLoad = () => {
    const loadSOLPrice = async () => {
      setIsPriceLoading(true);
      setPriceError(null);
      
      try {
        const price = await fetchSOLPrice();
        setSolPrice(price);
        console.log('💰 SOL price retry successful:', `$${price.toFixed(2)}`);
      } catch (error) {
        console.error('❌ SOL price retry failed:', error);
        setPriceError('Prices updating, try again in a moment');
        setSolPrice(null);
      } finally {
        setIsPriceLoading(false);
      }
    };
    
    loadSOLPrice();
  };

  // Use real USD balance from props
  const availableUSDBalance = userUSDBalance;

  const orderTypes: OrderType[] = ['Market Order', 'Limit Order'];

  // Get the reference price for validation
  const getReferencePrice = (): number => {
    if (orderType === 'Market Order') {
      return tokenData.price;
    } else {
      return parseFloat(price) || tokenData.price;
    }
  };

  // FIXED: Calculate position value and collateral directly in SOL (no USD conversion)
  const calculatePositionInSOL = (): {
    tokenPriceInSOL: number;
    positionValueSOL: number;
    collateralSOL: number;
    tradingFeeSOL: number;
    totalRequiredSOL: number;
  } => {
    if (!amount || !getReferencePrice() || !solPrice) {
      return {
        tokenPriceInSOL: 0,
        positionValueSOL: 0,
        collateralSOL: 0,
        tradingFeeSOL: 0,
        totalRequiredSOL: 0
      };
    }
    
    const tokenAmount = parseFloat(amount);
    const tokenPriceUSD = getReferencePrice();
    
    // Convert token price from USD to SOL
    const tokenPriceInSOL = tokenPriceUSD / solPrice;
    
    // Calculate position value in SOL (base position without leverage)
    const positionValueSOL = tokenAmount * tokenPriceInSOL;
    
    // Collateral needed in SOL = Position Value / Leverage
    const collateralSOL = positionValueSOL / leverage;
    
    // HIDDEN: Calculate trading fee in SOL
    let feePercentage: number;
    if (leverage < 10) {
      feePercentage = 0.003; // 0.3%
    } else if (leverage >= 10 && leverage <= 30) {
      feePercentage = 0.002; // 0.2%
    } else {
      feePercentage = 0.003; // 0.3%
    }
    
    // Fee calculated on base position value (not leveraged)
    const tradingFeeSOL = positionValueSOL * feePercentage;
    
    // Total requirement = Collateral + Fee
    const totalRequiredSOL = collateralSOL + tradingFeeSOL;
    
    // Fee calculated on base position value, leverage applied only to trade size display
    
    return {
      tokenPriceInSOL,
      positionValueSOL,
      collateralSOL,
      tradingFeeSOL,
      totalRequiredSOL
    };
  };

  // Update the old function to use SOL-based calculation
  const calculateRequiredCollateral = (): number => {
    const solCalculation = calculatePositionInSOL();
    return solCalculation.totalRequiredSOL;
  };

  // FIXED: Trade size = Position value (NO additional leverage multiplication)
  const calculateTradeSizeInSOL = (): number => {
    const solCalculation = calculatePositionInSOL();
    // Trade size should be the same as position value - leverage is already applied in token amount calculation
    const tradeSizeSOL = solCalculation.positionValueSOL;
    
    return tradeSizeSOL;
  };

  // Keep USD trade size for comparison
  const calculateTradeSize = (): number => {
    if (!amount || !getReferencePrice()) return 0;
    
    const tokenAmount = parseFloat(amount);
    const tokenPrice = getReferencePrice();
    const basePositionValue = tokenAmount * tokenPrice;
    
    // FIXED: Trade size = Base Position Value (leverage is already applied in position calculation)
    const tradeSize = basePositionValue;
    
    return tradeSize;
  };

  // Calculate P&L for Stop Loss - FIXED to use trade size
  const calculateStopLossPnL = (): { amount: number; percentage: number } | null => {
    if (!stopLoss || !amount || isNaN(parseFloat(stopLoss)) || isNaN(parseFloat(amount))) {
      return null;
    }

    const entryPrice = getReferencePrice();
    const slPrice = parseFloat(stopLoss);
    const tokenAmount = parseFloat(amount);
    const tradeSize = calculateTradeSize(); // Use leveraged trade size

    if (entryPrice === 0 || tradeSize === 0) return null;

    let pnlAmount = 0;
    
    if (tradeDirection === 'Long') {
      // Long: Loss when price goes down
      // FIXED: P&L amount should also be leveraged
      pnlAmount = (slPrice - entryPrice) * tokenAmount * leverage;
    } else {
      // Short: Loss when price goes up
      // FIXED: P&L amount should also be leveraged
      pnlAmount = (entryPrice - slPrice) * tokenAmount * leverage;
    }

    // Calculate percentage based on leveraged trade size
    const pnlPercentage = (pnlAmount / tradeSize) * 100;

    return {
      amount: pnlAmount,
      percentage: pnlPercentage
    };
  };

  // Calculate P&L for Take Profit - FIXED to use trade size
  const calculateTakeProfitPnL = (): { amount: number; percentage: number } | null => {
    if (!takeProfit || !amount || isNaN(parseFloat(takeProfit)) || isNaN(parseFloat(amount))) {
      return null;
    }

    const entryPrice = getReferencePrice();
    const tpPrice = parseFloat(takeProfit);
    const tokenAmount = parseFloat(amount);
    const tradeSize = calculateTradeSize(); // Use leveraged trade size

    if (entryPrice === 0 || tradeSize === 0) return null;

    let pnlAmount = 0;
    
    if (tradeDirection === 'Long') {
      // Long: Profit when price goes up
      // FIXED: P&L amount should also be leveraged
      pnlAmount = (tpPrice - entryPrice) * tokenAmount * leverage;
    } else {
      // Short: Profit when price goes down
      // FIXED: P&L amount should also be leveraged
      pnlAmount = (entryPrice - tpPrice) * tokenAmount * leverage;
    }

    // Calculate percentage based on leveraged trade size
    const pnlPercentage = (pnlAmount / tradeSize) * 100;

    return {
      amount: pnlAmount,
      percentage: pnlPercentage
    };
  };

  // Calculate liquidation price - FIXED to match backend formula
  const calculateLiquidationPrice = (): number | null => {
    if (!amount || !getReferencePrice()) return null;

    const entryPrice = getReferencePrice();
    
    // Use same leverage-based formula as backend (positionService.ts)
    // Liquidation occurs when losses reach 100% of collateral
    // For Long: price drops by (1/leverage) of entry price
    // For Short: price rises by (1/leverage) of entry price
    
    if (tradeDirection === 'Long') {
      return entryPrice * (1 - (1 / leverage));
    } else {
      return entryPrice * (1 + (1 / leverage));
    }
  };

  // FIXED: Validate position size against SOL balance with hidden fees included
  const validatePositionSize = (): string | null => {
    const totalRequiredSOL = calculateRequiredCollateral();
    
    if (totalRequiredSOL === 0) return null;
    
    console.log('✅ FIXED Validation - Total SOL Requirement (Hidden Fee):', {
      userSOLBalance,
      totalRequiredSOL, // Includes collateral + hidden fees
      validationPassed: userSOLBalance >= totalRequiredSOL,
      shortfall: Math.max(0, totalRequiredSOL - userSOLBalance)
    });
    
    if (totalRequiredSOL > userSOLBalance) {
      const shortfall = totalRequiredSOL - userSOLBalance;
      // User sees this as "collateral" requirement (fees are hidden)
      return `Need ${shortfall.toFixed(3)} more SOL to place this trade`;
    }
    
    return null;
  };

  // Validate stop loss and take profit
  const validateTpSl = () => {
    const errors: { stopLoss?: string; takeProfit?: string; position?: string } = {};
    const refPrice = getReferencePrice();

    // Position size validation
    const positionError = validatePositionSize();
    if (positionError) {
      errors.position = positionError;
    }

    if (tpSl) {
      const slValue = parseFloat(stopLoss);
      const tpValue = parseFloat(takeProfit);

      // Stop Loss validation
      if (stopLoss && !isNaN(slValue)) {
        if (tradeDirection === 'Long') {
          // For Long positions: Stop Loss must be BELOW reference price
          if (slValue >= refPrice) {
            errors.stopLoss = `SL must be below ${formatPrice(refPrice)}`;
          }
        } else {
          // For Short positions: Stop Loss must be ABOVE reference price
          if (slValue <= refPrice) {
            errors.stopLoss = `SL must be above ${formatPrice(refPrice)}`;
          }
        }
      }

      // Take Profit validation
      if (takeProfit && !isNaN(tpValue)) {
        if (tradeDirection === 'Long') {
          // For Long positions: Take Profit must be ABOVE reference price
          if (tpValue <= refPrice) {
            errors.takeProfit = `TP must be above ${formatPrice(refPrice)}`;
          }
        } else {
          // For Short positions: Take Profit must be BELOW reference price
          if (tpValue >= refPrice) {
            errors.takeProfit = `TP must be below ${formatPrice(refPrice)}`;
          }
        }
      }

      // Cross validation: Stop Loss and Take Profit shouldn't be on wrong sides
      if (stopLoss && takeProfit && !isNaN(slValue) && !isNaN(tpValue)) {
        if (tradeDirection === 'Long') {
          if (slValue >= tpValue) {
            errors.stopLoss = 'SL must be below TP';
          }
        } else {
          if (slValue <= tpValue) {
            errors.stopLoss = 'SL must be above TP';
          }
        }
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Run validation whenever relevant values change
  useEffect(() => {
    validateTpSl();
  }, [tradeDirection, orderType, price, amount, leverage, stopLoss, takeProfit, tpSl, userSOLBalance]);

  const handleExecuteTrade = async () => {
    console.log('🚀🚀🚀 TRADE EXECUTION STARTED 🚀🚀🚀');
    
    // Trade execution is now silent for better UX
    
    // 🚨 CRITICAL: Get FRESH price from Birdeye WebSocket for maximum accuracy
    console.log('⚡ GETTING FRESH PRICE FROM BIRDEYE WEBSOCKET FOR TRADE EXECUTION...');
    let freshPrice = tokenData.price; // Fallback to cached price
    
    // Try Birdeye WebSocket first (lightning fast)
    const birdeyePrice = getJupiterPrice(tokenData.address);
    if (birdeyePrice) {
      freshPrice = birdeyePrice;
      console.log('💰 BIRDEYE WEBSOCKET PRICE USED FOR TRADE:', {
        cached_price: tokenData.price,
        birdeye_fresh_price: freshPrice,
        price_difference: freshPrice - tokenData.price,
        price_change_percent: ((freshPrice - tokenData.price) / tokenData.price * 100).toFixed(4) + '%',
        source: 'Birdeye WebSocket'
      });
    } else {
      // Fallback to Birdeye REST API if WebSocket price not available
      console.log('⚠️ Birdeye WebSocket price not available, falling back to REST API...');
      try {
        const freshTokenData = await fetchTokenDetailCached(tokenData.address);
        if (freshTokenData) {
          freshPrice = freshTokenData.price;
          console.log('💰 BIRDEYE REST API PRICE USED FOR TRADE:', {
            cached_price: tokenData.price,
            birdeye_rest_price: freshPrice,
            price_difference: freshPrice - tokenData.price,
            price_change_percent: ((freshPrice - tokenData.price) / tokenData.price * 100).toFixed(4) + '%',
            source: 'Birdeye REST API'
          });
        } else {
          console.log('⚠️ Both Birdeye WebSocket and REST API failed, using cached price:', tokenData.price);
        }
      } catch (error) {
        console.log('⚠️ Error fetching REST API price, using cached price:', error);
      }
    }
    
    console.log('📋 Initial Trade Parameters:', {
      wallet_address: walletAddress,
      token_symbol: tokenData.symbol,
      token_address: tokenData.address,
      cached_price_usd: tokenData.price,
      fresh_execution_price_usd: freshPrice,
      direction: tradeDirection,
      order_type: orderType,
      amount_input: amount,
      leverage: leverage,
      user_sol_balance: userSOLBalance,
      sol_price: solPrice,
      stop_loss: stopLoss || 'None',
      take_profit: takeProfit || 'None'
    });

    if (!isFormValid()) {
      console.log('❌ Form validation failed');
      return;
    }
    
    // Final validation before execution
    if (!validateTpSl()) {
      console.log('❌ TP/SL validation failed');
      return;
    }
    
    setIsExecutingTrade(true);
    setTradeError(null);
    setTradeSuccess(null);
    
    try {
      // Step 1: Calculate all required values
      console.log('📊 STEP 1: CALCULATING ALL VALUES');
      
      const solCalculation = calculatePositionInSOL();
      const requiredCollateral = calculateRequiredCollateral();
      const tradeSizeSOL = calculateTradeSizeInSOL();
      const tradeSizeUSD = calculateTradeSize();
      
      console.log('🔢 ALL CALCULATIONS COMPLETE:', {
        'RAW_INPUTS': {
          tokenAmount: parseFloat(amount),
          tokenPriceUSD: getReferencePrice(),
          solPrice: solPrice,
          leverage: leverage
        },
        'SOL_CALCULATION': solCalculation,
        'COLLATERAL_REQUIRED': requiredCollateral,
        'TRADE_SIZE_SOL': tradeSizeSOL,
        'TRADE_SIZE_USD': tradeSizeUSD,
        'VALIDATION': {
          user_balance: userSOLBalance,
          required: requiredCollateral,
          sufficient: userSOLBalance >= requiredCollateral,
          shortfall: Math.max(0, requiredCollateral - userSOLBalance)
        }
      });
      
      // Step 2: Build position data for database
      console.log('📊 STEP 2: BUILDING POSITION DATA FOR DATABASE');
      
      const positionData: CreatePositionData = {
        wallet_address: walletAddress,
        token_address: tokenData.address,
        token_symbol: tokenData.symbol,
        direction: tradeDirection,
        order_type: orderType,
        target_price: orderType === 'Limit Order' ? parseFloat(price) : undefined,
        fresh_market_price: orderType === 'Market Order' ? freshPrice : undefined, // PASS THE ULTRA-FRESH PRICE
        amount: parseFloat(amount),
        leverage: leverage,
        stop_loss: stopLoss ? parseFloat(stopLoss) : undefined,
        take_profit: takeProfit ? parseFloat(takeProfit) : undefined,
      };
      
      console.log('📤 EXACT DATA BEING SENT TO DATABASE:', {
        'POSITION_DATA': positionData,
        'ULTRA_FRESH_PRICE_DETAILS': {
          cached_price: tokenData.price,
          fresh_price_sent_to_backend: freshPrice,
          price_source: birdeyePrice ? 'Birdeye WebSocket' : 'Birdeye REST API Fallback',
          price_difference: freshPrice - tokenData.price,
          price_improvement: ((freshPrice - tokenData.price) / tokenData.price * 100).toFixed(4) + '%'
        },
        'EXPECTED_BACKEND_CALCULATIONS': {
          entry_price: orderType === 'Market Order' ? freshPrice : parseFloat(price),
          position_value_usd: parseFloat(amount) * (orderType === 'Market Order' ? freshPrice : parseFloat(price)),
          collateral_requirement_sol: requiredCollateral,
          'NOTE': 'Backend will use the ULTRA-FRESH price we just fetched instead of refetching'
        }
      });
      
      // Step 3: Send to backend
      console.log('📊 STEP 3: SENDING TO BACKEND (positionService.createPosition)');
      
      const position = await positionService.createPosition(positionData);
      
      console.log('✅ BACKEND RESPONSE:', {
        'POSITION_CREATED': position,
        'POSITION_ID': position.id,
        'ALL_FIELDS': position
      });
      
      // Step 4: Check balance update
      console.log('📊 STEP 4: CHECKING BALANCE UPDATES');
      
      // Get the updated user profile to get the actual new SOL balance after collateral deduction
      const updatedProfile = await userProfileService.getProfile(walletAddress);
      if (updatedProfile && onUpdateSOLBalance) {
        const actualDeduction = userSOLBalance - updatedProfile.sol_balance;
        const calculationMatch = Math.abs(actualDeduction - requiredCollateral) < 0.001;
        
        console.log('💰 BALANCE UPDATE ANALYSIS:', {
          'BEFORE_TRADE': {
            ui_balance: userSOLBalance,
            ui_predicted_requirement: requiredCollateral
          },
          'AFTER_TRADE': {
            new_db_balance: updatedProfile.sol_balance,
            actual_deduction: actualDeduction
          },
          'MATCH_ANALYSIS': {
            calculation_matches: calculationMatch,
            difference: actualDeduction - requiredCollateral,
            percentage_difference: ((actualDeduction - requiredCollateral) / requiredCollateral * 100).toFixed(2) + '%'
          }
        });
        
        onUpdateSOLBalance(updatedProfile.sol_balance);
      }
      
      console.log('🎉🎉🎉 TRADE EXECUTION COMPLETED SUCCESSFULLY 🎉🎉🎉');
      
      // Trade execution success is now silent
      
      // Show loading modal for Market Orders (which start in 'opening' status)
      if (orderType === 'Market Order') {
        setLoadingTradeData({
          type: 'opening',
          tokenSymbol: tokenData.symbol,
          direction: tradeDirection,
          leverage: leverage
        });
        setShowTradeLoading(true);
        
        // Auto-close loading modal after 65 seconds and show success modal
        setTimeout(() => {
          setShowTradeLoading(false);
          setLoadingTradeData(null);
          setShowTradeSuccess(true); // Show success modal instead of closing
        }, 65000);
      } else {
        // For limit orders, show success message and close normally
        setTradeSuccess(`Limit order placed successfully! Order ID: ${position.id}`);
        // Limit order success is now silent
        
        // Close modal after 2 seconds
        setTimeout(() => {
          onClose();
        }, 2000);
      }
      
    } catch (error: any) {
      console.error('💥💥💥 TRADE EXECUTION ERROR 💥💥💥');
      console.error('Error details:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      setTradeError('Trade failed, please check your details and try again');
      // Trade errors are now silent
    } finally {
      setIsExecutingTrade(false);
      console.log('🏁 TRADE EXECUTION PROCESS ENDED 🏁');
    }
  };

  const formatTradeSize = () => {
    const tradeSize = calculateTradeSize();
    return tradeSize.toFixed(2);
  };

  const isFormValid = () => {
    const basicValidation = orderType === 'Market Order' 
      ? amount && parseFloat(amount) > 0
      : amount && price && parseFloat(amount) > 0 && parseFloat(price) > 0;
    
    const tpSlValidation = !tpSl || (Object.keys(validationErrors).length === 0 || (Object.keys(validationErrors).length === 1 && validationErrors.position));
    const positionValidation = !validationErrors.position;
    
    // CRITICAL: SOL price must be available for live trading
    const priceValidation = solPrice !== null && !isPriceLoading && !priceError;
    
    return basicValidation && tpSlValidation && positionValidation && priceValidation;
  };

  const handleStopLossChange = (value: string) => {
    setStopLoss(value);
    // 🎵 Sound for TP/SL adjustments
    if (value.length > 0) {
      soundManager.playInputChange();
    }
  };

  const handleTakeProfitChange = (value: string) => {
    setTakeProfit(value);
    // 🎵 Sound for TP/SL adjustments
    if (value.length > 0) {
      soundManager.playInputChange();
    }
  };

  const handlePriceChange = (value: string) => {
    setPrice(value);
    // 🎵 Sound for price adjustments
    if (value.length > 0) {
      soundManager.playInputChange();
    }
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    // 🎵 Sound for amount input - this is important!
    if (value.length > 0) {
      soundManager.playAmountInput();
    }
  };

  const handleLeverageChange = (value: number) => {
    if (value !== leverage) {
      setLeverage(value);
      // Leverage adjustment is now silent for better UX
    }
  };

  // FIXED: Calculate max position size based on SOL balance directly
  const getMaxPositionSize = (): number => {
    if (userSOLBalance === 0 || !solPrice) return 0; // CRITICAL: No trading without SOL price
    
    const refPrice = getReferencePrice();
    if (refPrice === 0) return 0;

    // Convert token price to SOL terms
    const tokenPriceInSOL = refPrice / solPrice;
    
    // Use 95% of balance to leave room for calculations
    const availableSOL = userSOLBalance * 0.95;
    
    // Account for hidden trading fee in max position calculation
    let feePercentage: number;
    if (leverage < 10) {
      feePercentage = 0.003; // 0.3%
    } else if (leverage >= 10 && leverage <= 30) {
      feePercentage = 0.002; // 0.2%
    } else {
      feePercentage = 0.003; // 0.3%
    }
    
    // Calculate max position considering collateral + fee requirement in SOL
    // Available SOL = (Position Value SOL / Leverage) + (Position Value SOL * Fee)
    // Available SOL = Position Value SOL * (1/Leverage + Fee)
    const positionCostFactor = (1 / leverage) + feePercentage;
    const maxPositionValueSOL = availableSOL / positionCostFactor;
    
    // Calculate max token amount
    const maxTokenAmount = maxPositionValueSOL / tokenPriceInSOL;
    
    // DEBUG: Let's trace exactly what should happen
    const expectedPositionValueUSD = maxPositionValueSOL * solPrice;
    const expectedLeveragedSizeUSD = expectedPositionValueUSD * leverage;
    const expectedLeveragedSizeSOL = expectedLeveragedSizeUSD / solPrice;
    
    console.log('🚨 MAX CALCULATION DEBUG - FINDING THE BUG:', {
      userSOLBalance,
      availableSOL,
      leverage,
      tokenPriceUSD: refPrice,
      solPrice,
      tokenPriceInSOL,
      feePercentage: `${(feePercentage * 100).toFixed(1)}%`,
      positionCostFactor,
      maxPositionValueSOL,
      maxTokenAmount,
      'EXPECTED_RESULTS': {
        positionValueUSD: expectedPositionValueUSD,
        leveragedSizeUSD: expectedLeveragedSizeUSD,
        leveragedSizeSOL: expectedLeveragedSizeSOL,
        'SHOULD_BE_AROUND_1300_SOL': expectedLeveragedSizeSOL
      }
    });
    
    return Math.max(0, maxTokenAmount);
  };

  const handleMaxClick = () => {
    const maxAmount = getMaxPositionSize();
    if (maxAmount > 0) {
      setAmount(maxAmount.toFixed(6));
      // MAX button is now silent for better UX
    }
  };

  // Get P&L calculations for display
  const stopLossPnL = calculateStopLossPnL();
  const takeProfitPnL = calculateTakeProfitPnL();
  const liquidationPrice = calculateLiquidationPrice();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 text-white flex items-center justify-center p-4 z-50">
      <div className="bg-black border border-gray-800 rounded-xl w-full max-w-lg max-h-[95vh] overflow-y-auto">
        <div className="p-6">
          {/* Header with close button - Much larger */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              {/* Token Icon - Much larger */}
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-800 flex items-center justify-center">
                {tokenData.logoURI ? (
                  <img 
                    src={tokenData.logoURI} 
                    alt={tokenData.symbol}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = 'none';
                      const fallback = target.nextElementSibling as HTMLElement;
                      if (fallback) {
                        fallback.style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <span className={`text-lg font-bold text-white ${tokenData.logoURI ? 'hidden' : 'flex'}`}>
                  {tokenData.symbol.charAt(0)}
                </span>
              </div>
              
              <div>
                <h2 className="text-2xl font-bold">{tokenData.symbol}</h2>
                <p className="text-gray-400 text-lg">{formatPrice(tokenData.price)}</p>
              </div>
            </div>
            
            <button 
              onClick={() => {
                soundManager.playModalClose();
                onClose();
              }}
              onMouseEnter={() => {}}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-7 h-7" />
            </button>
          </div>

          {/* Trade Direction Tabs - Much larger */}
          <div className="flex mb-6 bg-gray-900 rounded-xl p-2">
            <button
              onClick={() => {
                if (tradeDirection !== 'Long') {
                  soundManager.playDirectionSelect();
                  setTradeDirection('Long');
                }
              }}
              onMouseEnter={() => {}}
              className={`flex-1 py-4 px-4 text-lg font-bold rounded-xl transition-colors ${
                tradeDirection === 'Long'
                  ? 'text-black bg-green-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <TrendingUp className="w-5 h-5" />
                <span>Long</span>
              </div>
            </button>
            <button
              onClick={() => {
                if (tradeDirection !== 'Short') {
                  soundManager.playDirectionSelect();
                  setTradeDirection('Short');
                }
              }}
              onMouseEnter={() => {}}
              className={`flex-1 py-4 px-4 text-lg font-bold rounded-xl transition-colors ${
                tradeDirection === 'Short'
                  ? 'text-black bg-red-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <TrendingDown className="w-5 h-5" />
                <span>Short</span>
              </div>
            </button>
          </div>

          {/* Form - Much larger spacing */}
          <div className="space-y-5">
            {/* Order Type Dropdown - Much larger */}
            <div className="relative">
              <button
                onClick={() => {
                  soundManager.play('dropdown_open', 'ui');
                  setShowOrderTypeDropdown(!showOrderTypeDropdown);
                }}
                onMouseEnter={() => {}}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 text-white text-lg text-left flex items-center justify-between hover:border-gray-600 transition-colors"
              >
                <span>{orderType}</span>
                <ChevronDown className={`w-6 h-6 transition-transform ${showOrderTypeDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              {showOrderTypeDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-lg z-10">
                  {orderTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        soundManager.playSwitch();
                        setOrderType(type);
                        setShowOrderTypeDropdown(false);
                      }}
                      onMouseEnter={() => {}}
                      className="w-full px-4 py-4 text-left text-lg text-white hover:bg-gray-800 transition-colors first:rounded-t-xl last:rounded-b-xl"
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Available Balances - Much larger */}
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center bg-gray-900 rounded-xl p-4">
                <div className="flex items-center justify-center mb-2">
                  <Wallet className="w-5 h-5 text-gray-400 mr-2" />
                  <p className="text-gray-400 text-sm">SOL</p>
                </div>
                <p className="text-white text-lg font-bold">{userSOLBalance.toFixed(3)}</p>
              </div>
              <div className="text-center bg-gray-900 rounded-xl p-4">
                <p className="text-gray-400 text-sm mb-2">USD</p>
                <p className="text-white text-lg font-bold">{availableUSDBalance.toFixed(2)}</p>
              </div>
            </div>

            {/* Price Input - Only show for Limit Orders - Much larger */}
            {orderType === 'Limit Order' && (
              <div>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => handlePriceChange(e.target.value)}
                  placeholder="Price (USD)"
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 text-white text-lg placeholder-gray-500 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400 transition-all text-center"
                  step="0.000001"
                />
                <p className="text-gray-500 text-sm mt-2 text-center">
                  Market: {formatPrice(tokenData.price)}
                </p>
              </div>
            )}

            {/* Quantity Input with Max Button - Much larger */}
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder={`Amount (${tokenData.symbol})`}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 pr-20 text-white text-lg placeholder-gray-500 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400 transition-all text-center"
                step="0.01"
              />
              <button
                onClick={handleMaxClick}
                onMouseEnter={() => {}}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded-lg transition-colors font-bold"
              >
                MAX
              </button>
            </div>

            {/* Leverage Slider - Much larger */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400 text-lg">Leverage</span>
                <span className="text-white text-2xl font-bold">{leverage}x</span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min="2"
                  max="100"
                  value={leverage}
                  onChange={(e) => handleLeverageChange(parseInt(e.target.value))}
                  className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-2">
                  <span>2x</span>
                  <span>50x</span>
                  <span>100x</span>
                </div>
              </div>
            </div>

            {/* Trade Size Display - Shows leveraged position value */}
            {amount && parseFloat(amount) > 0 && solPrice && (
              <div className="text-center bg-blue-900 border border-blue-700 rounded-lg p-2">
                <p className="text-blue-400 text-xs">Trade Size ({leverage}x Leveraged)</p>
                <p className="text-blue-300 text-xl font-bold">
                  {calculateTradeSizeInSOL().toFixed(4)} SOL
                </p>
                <p className="text-blue-500 text-xs">
                  ≈ ${(calculateTradeSizeInSOL() * solPrice).toFixed(2)} USD
                </p>
              </div>
            )}

            {/* Required Collateral Display - INCLUDES HIDDEN FEES */}
            <div className="text-center bg-gray-900 rounded-lg p-2">
              <p className="text-gray-400 text-xs">Required Collateral</p>
              {!solPrice ? (
                <p className="text-red-400 text-lg font-bold">Price Loading...</p>
              ) : (
                <>
                  <p className="text-white text-lg font-bold">{calculateRequiredCollateral().toFixed(4)} SOL</p>
                  <p className="text-gray-500 text-xs">
                    ≈ ${(calculateRequiredCollateral() * solPrice).toFixed(2)} USD
                  </p>
                </>
              )}
            </div>

            {/* Position Size Validation Error - compact */}
            {validationErrors.position && (
              <div className="bg-red-900 border border-red-700 rounded-lg p-2">
                <div className="flex items-center text-red-400 text-xs">
                  <AlertTriangle className="w-3 h-3 mr-1 flex-shrink-0" />
                  <span>{validationErrors.position}</span>
                </div>
              </div>
            )}

            {/* Liquidation Price Display */}
            {liquidationPrice && amount && (
              <div className="bg-orange-900 border border-orange-700 rounded-lg p-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <AlertTriangle className="w-3 h-3 text-orange-400 mr-1" />
                    <span className="text-orange-400 text-xs">Liquidation Price</span>
                  </div>
                  <span className="text-orange-300 text-sm font-bold">
                    {formatPrice(liquidationPrice)}
                  </span>
                </div>
              </div>
            )}

            {/* TP/SL Checkbox - compact */}
            <div className="space-y-3">
                              <label className="flex items-center justify-center space-x-2 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={tpSl}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setTpSl(isChecked);
                      // 🎵 Epic toggle sound!
                      if (isChecked) {
                        soundManager.playToggleOn();
                      } else {
                        soundManager.playToggleOff();
                      }
                    }}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    tpSl ? 'bg-green-600 border-green-600' : 'border-gray-600'
                  }`}>
                    {tpSl && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-white text-sm">Take Profit / Stop Loss</span>
              </label>

              {/* TP/SL Inputs - compact */}
              {tpSl && (
                <div className="space-y-2">
                  {/* Stop Loss Input */}
                  <div>
                    <input
                      type="number"
                      value={stopLoss}
                      onChange={(e) => handleStopLossChange(e.target.value)}
                      placeholder="Stop Loss (USD)"
                      className={`w-full bg-gray-900 border rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none transition-all text-center ${
                        validationErrors.stopLoss 
                          ? 'border-red-500 focus:border-red-400 focus:ring-1 focus:ring-red-400' 
                          : 'border-red-700 focus:border-red-400 focus:ring-1 focus:ring-red-400'
                      }`}
                      step="0.000001"
                    />
                    {validationErrors.stopLoss && (
                      <div className="flex items-center mt-1 text-red-400 text-xs">
                        <AlertTriangle className="w-3 h-3 mr-1 flex-shrink-0" />
                        <span>{validationErrors.stopLoss}</span>
                      </div>
                    )}
                    {/* Stop Loss P&L Display - FIXED to show leveraged amounts */}
                    {stopLossPnL && !validationErrors.stopLoss && (
                      <div className="mt-1 bg-red-900 border border-red-700 rounded p-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center">
                            <Calculator className="w-3 h-3 text-red-400 mr-1" />
                            <span className="text-red-400">Loss ({leverage}x):</span>
                          </div>
                          <div className="text-right">
                            <div className="text-red-300 font-medium">
                              {formatPrice(Math.abs(stopLossPnL.amount))}
                            </div>
                            <div className="text-red-400 text-xs">
                              {Math.abs(stopLossPnL.percentage).toFixed(1)}% of trade
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Take Profit Input */}
                  <div>
                    <input
                      type="number"
                      value={takeProfit}
                      onChange={(e) => handleTakeProfitChange(e.target.value)}
                      placeholder="Take Profit (USD)"
                      className={`w-full bg-gray-900 border rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none transition-all text-center ${
                        validationErrors.takeProfit 
                          ? 'border-red-500 focus:border-red-400 focus:ring-1 focus:ring-red-400' 
                          : 'border-green-700 focus:border-green-400 focus:ring-1 focus:ring-green-400'
                      }`}
                      step="0.000001"
                    />
                    {validationErrors.takeProfit && (
                      <div className="flex items-center mt-1 text-red-400 text-xs">
                        <AlertTriangle className="w-3 h-3 mr-1 flex-shrink-0" />
                        <span>{validationErrors.takeProfit}</span>
                      </div>
                    )}
                    {/* Take Profit P&L Display - FIXED to show leveraged amounts */}
                    {takeProfitPnL && !validationErrors.takeProfit && (
                      <div className="mt-1 bg-green-900 border border-green-700 rounded p-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center">
                            <Calculator className="w-3 h-3 text-green-400 mr-1" />
                            <span className="text-green-400">Profit ({leverage}x):</span>
                          </div>
                          <div className="text-right">
                            <div className="text-green-300 font-medium">
                              +{formatPrice(takeProfitPnL.amount)}
                            </div>
                            <div className="text-green-400 text-xs">
                              +{takeProfitPnL.percentage.toFixed(1)}% of trade
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {tradeError && (
              <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-3">
                <p className="text-red-300 text-sm">{tradeError}</p>
              </div>
            )}

            {/* Success Message */}
            {tradeSuccess && (
              <div className="bg-green-900 border border-green-700 rounded-lg p-3 mb-3">
                <p className="text-green-300 text-sm">{tradeSuccess}</p>
              </div>
            )}

            {/* SOL Price Status - CRITICAL FOR LIVE TRADING (Hidden Display) */}
            {isPriceLoading && (
              <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-2 mb-3">
                <div className="flex items-center text-yellow-400 text-xs">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  <span>Loading price data for live trading...</span>
                </div>
              </div>
            )}
            
            {priceError && (
              <div className="bg-red-900 border border-red-700 rounded-lg p-2 mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-red-400 text-xs">
                    <AlertTriangle className="w-3 h-3 mr-1 flex-shrink-0" />
                    <span>{priceError}</span>
                  </div>
                  <button
                    onClick={retryPriceLoad}
                    className="text-red-300 hover:text-red-100 text-xs underline"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {/* Execute Trade Button - CRITICAL SAFETY FOR LIVE TRADING */}
            <button
              onClick={handleExecuteTrade}
              disabled={!isFormValid() || isExecutingTrade}
              className="w-full text-black font-medium py-3 px-4 rounded-lg text-base transition-colors disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              style={{ 
                backgroundColor: !isFormValid() ? '#374151' : '#1e7cfa',
                color: !isFormValid() ? '#9ca3af' : 'black'
              }}
              onMouseEnter={(e) => {
                if (isFormValid()) {
                  (e.target as HTMLElement).style.backgroundColor = '#1a6ce8';
                }
              }}
              onMouseLeave={(e) => {
                if (isFormValid()) {
                  (e.target as HTMLElement).style.backgroundColor = '#1e7cfa';
                }
              }}
            >
              {isExecutingTrade ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Position...</span>
                </>
              ) : isPriceLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading SOL Price...</span>
                </>
              ) : priceError ? (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  <span>Price Error - Trading Disabled</span>
                </>
              ) : !solPrice ? (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  <span>No Price Data - Trading Disabled</span>
                </>
              ) : (
                <span>Execute Trade</span>
              )}
            </button>
          </div>

          {/* Terms - compact */}
          <p className="text-gray-600 text-xs mt-3 text-center">
            By Trading You Agree To Our{' '}
            <span 
              style={{ color: '#1e7cfa' }} 
              className="underline cursor-pointer hover:text-blue-300 transition-colors"
              onClick={onShowTerms}
            >
              Terms Of Service
            </span>
          </p>

                    {/* Custom Styles for Slider */}
          <style>{`
            .slider::-webkit-slider-thumb {
              appearance: none;
              height: 16px;
              width: 16px;
              border-radius: 50%;
              background: #1e7cfa;
              cursor: pointer;
              border: 2px solid #ffffff;
            }
            
            .slider::-moz-range-thumb {
              height: 16px;
              width: 16px;
              border-radius: 50%;
              background: #1e7cfa;
              cursor: pointer;
              border: 2px solid #ffffff;
            }
          `}</style>
        </div>
      </div>
      
      {/* Trade Loading Modal - shown during 1-minute delays */}
      <TradeLoadingModal
        isOpen={showTradeLoading}
        type={loadingTradeData?.type || 'opening'}
        tokenSymbol={loadingTradeData?.tokenSymbol || ''}
        direction={loadingTradeData?.direction}
        leverage={loadingTradeData?.leverage}
        onClose={() => {
          setShowTradeLoading(false);
          setLoadingTradeData(null);
          onClose(); // Also close the main trading modal
        }}
        canCancel={false} // Don't allow cancelling during anti-gaming delay
      />

      {/* Trade Success Modal - shown after successful trade execution */}
      <TradeSuccessModal
        isOpen={showTradeSuccess}
        tokenSymbol={tokenData.symbol}
        direction={tradeDirection}
        leverage={leverage}
        amount={amount}
        onManagePosition={() => {
          setShowTradeSuccess(false);
          onClose(); // Close the trading modal
          if (onNavigateToPositions) {
            onNavigateToPositions(); // Navigate to positions tab
          }
        }}
        onClose={() => {
          setShowTradeSuccess(false);
          onClose(); // Close the trading modal
        }}
      />
    </div>
  );
}