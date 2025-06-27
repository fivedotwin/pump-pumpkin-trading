import React, { useState, useEffect } from 'react';
import { X, ChevronDown, TrendingUp, TrendingDown, AlertTriangle, Wallet, Calculator, Loader2 } from 'lucide-react';
import { TokenDetailData, formatPrice } from '../services/birdeyeApi';
import { positionService, CreatePositionData } from '../services/positionService';

interface TradingModalProps {
  tokenData: TokenDetailData;
  onClose: () => void;
  userSOLBalance?: number; // Add SOL balance prop
  userUSDBalance?: number; // Add USD balance prop
  walletAddress: string; // Add wallet address for position creation
}

type OrderType = 'Market Order' | 'Limit Order';
type TradeDirection = 'Long' | 'Short';

export default function TradingModal({ tokenData, onClose, userSOLBalance = 0, userUSDBalance = 0, walletAddress }: TradingModalProps) {
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

  // Calculate required collateral in SOL (this is what user needs to put up)
  const calculateRequiredCollateral = (): number => {
    if (!amount || !getReferencePrice()) return 0;
    
    const tokenAmount = parseFloat(amount);
    const tokenPrice = getReferencePrice();
    const positionValue = tokenAmount * tokenPrice;
    
    // Collateral needed = Position Value / Leverage
    const requiredCollateral = positionValue / leverage;
    
    return requiredCollateral;
  };

  // FIXED: Calculate total trade size (position value WITH leverage)
  const calculateTradeSize = (): number => {
    if (!amount || !getReferencePrice()) return 0;
    
    const tokenAmount = parseFloat(amount);
    const tokenPrice = getReferencePrice();
    const basePositionValue = tokenAmount * tokenPrice;
    
    // FIXED: Trade size = Base Position Value × Leverage
    const tradeSize = basePositionValue * leverage;
    
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

  // Calculate liquidation price
  const calculateLiquidationPrice = (): number | null => {
    if (!amount || !getReferencePrice()) return null;

    const entryPrice = getReferencePrice();
    const collateral = calculateRequiredCollateral();
    const tokenAmount = parseFloat(amount);

    if (entryPrice === 0 || tokenAmount === 0) return null;

    // Simplified liquidation calculation (assumes 100% of collateral lost)
    // In reality, this would include fees and be more complex
    const priceChangeForLiquidation = collateral / tokenAmount;

    let liquidationPrice = 0;
    
    if (tradeDirection === 'Long') {
      // Long liquidation: price drops by the collateral amount per token
      liquidationPrice = entryPrice - priceChangeForLiquidation;
    } else {
      // Short liquidation: price rises by the collateral amount per token
      liquidationPrice = entryPrice + priceChangeForLiquidation;
    }

    return Math.max(liquidationPrice, 0); // Ensure non-negative
  };

  // Validate position size against SOL balance
  const validatePositionSize = (): string | null => {
    const requiredCollateral = calculateRequiredCollateral();
    
    if (requiredCollateral === 0) return null;
    
    // Add 5% buffer for fees and slippage
    const requiredWithBuffer = requiredCollateral * 1.05;
    
    if (requiredWithBuffer > userSOLBalance) {
      const shortfall = requiredWithBuffer - userSOLBalance;
      return `Need ${requiredWithBuffer.toFixed(4)} SOL (${shortfall.toFixed(4)} short)`;
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
    if (!isFormValid()) return;
    
    // Final validation before execution
    if (!validateTpSl()) {
      return;
    }
    
    setIsExecutingTrade(true);
    setTradeError(null);
    setTradeSuccess(null);
    
    try {
      const positionData: CreatePositionData = {
        wallet_address: walletAddress,
        token_address: tokenData.address,
        token_symbol: tokenData.symbol,
        direction: tradeDirection,
        order_type: orderType,
        target_price: orderType === 'Limit Order' ? parseFloat(price) : undefined,
        amount: parseFloat(amount),
        leverage: leverage,
        stop_loss: stopLoss ? parseFloat(stopLoss) : undefined,
        take_profit: takeProfit ? parseFloat(takeProfit) : undefined,
      };
      
      console.log('🚀 Creating leveraged position:', {
        token: tokenData.symbol,
        direction: tradeDirection,
        leverage: leverage + 'x',
        amount: amount,
        collateral: calculateRequiredCollateral().toFixed(4) + ' SOL',
        trade_size: '$' + calculateTradeSize().toFixed(2)
      });
      
      const position = await positionService.createPosition(positionData);
      
      setTradeSuccess(`Position created successfully! Position ID: ${position.id}`);
      
      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);
      
    } catch (error: any) {
      console.error('💥 Error creating position:', error);
      setTradeError(error.message || 'Failed to create position. Please try again.');
    } finally {
      setIsExecutingTrade(false);
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
    
    return basicValidation && tpSlValidation && positionValidation;
  };

  const handleStopLossChange = (value: string) => {
    setStopLoss(value);
  };

  const handleTakeProfitChange = (value: string) => {
    setTakeProfit(value);
  };

  const handlePriceChange = (value: string) => {
    setPrice(value);
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
  };

  const handleLeverageChange = (value: number) => {
    setLeverage(value);
  };

  // Calculate max position size based on SOL balance
  const getMaxPositionSize = (): number => {
    if (userSOLBalance === 0) return 0;
    
    const refPrice = getReferencePrice();
    if (refPrice === 0) return 0;
    
    // Use 95% of balance to leave room for fees
    const availableCollateral = userSOLBalance * 0.95;
    const maxPositionValue = availableCollateral * leverage;
    const maxTokenAmount = maxPositionValue / refPrice;
    
    return maxTokenAmount;
  };

  const handleMaxClick = () => {
    const maxAmount = getMaxPositionSize();
    if (maxAmount > 0) {
      setAmount(maxAmount.toFixed(6));
    }
  };

  // Get P&L calculations for display
  const stopLossPnL = calculateStopLossPnL();
  const takeProfitPnL = calculateTakeProfitPnL();
  const liquidationPrice = calculateLiquidationPrice();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 text-white flex items-center justify-center p-2 z-50">
      <div className="bg-black border border-gray-800 rounded-lg w-full max-w-sm max-h-[95vh] overflow-y-auto">
        <div className="p-4">
          {/* Header with close button */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              {/* Token Icon - smaller */}
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center">
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
                <span className={`text-sm font-bold text-white ${tokenData.logoURI ? 'hidden' : 'flex'}`}>
                  {tokenData.symbol.charAt(0)}
                </span>
              </div>
              
              <div>
                <h2 className="text-lg font-semibold">{tokenData.symbol}</h2>
                <p className="text-gray-400 text-sm">{formatPrice(tokenData.price)}</p>
              </div>
            </div>
            
            <button 
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Trade Direction Tabs - smaller */}
          <div className="flex mb-4 bg-gray-900 rounded-lg p-1">
            <button
              onClick={() => setTradeDirection('Long')}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                tradeDirection === 'Long'
                  ? 'text-black bg-green-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-center space-x-1">
                <TrendingUp className="w-3 h-3" />
                <span>Long</span>
              </div>
            </button>
            <button
              onClick={() => setTradeDirection('Short')}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                tradeDirection === 'Short'
                  ? 'text-black bg-red-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-center space-x-1">
                <TrendingDown className="w-3 h-3" />
                <span>Short</span>
              </div>
            </button>
          </div>

          {/* Form - compact spacing */}
          <div className="space-y-3">
            {/* Order Type Dropdown - smaller */}
            <div className="relative">
              <button
                onClick={() => setShowOrderTypeDropdown(!showOrderTypeDropdown)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-left flex items-center justify-between hover:border-gray-600 transition-colors"
              >
                <span className="text-sm">{orderType}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showOrderTypeDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              {showOrderTypeDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-10">
                  {orderTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setOrderType(type);
                        setShowOrderTypeDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-800 transition-colors first:rounded-t-lg last:rounded-b-lg"
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Available Balances - compact */}
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center bg-gray-900 rounded-lg p-2">
                <div className="flex items-center justify-center mb-1">
                  <Wallet className="w-3 h-3 text-gray-400 mr-1" />
                  <p className="text-gray-400 text-xs">SOL</p>
                </div>
                <p className="text-white text-sm font-medium">{userSOLBalance.toFixed(3)}</p>
              </div>
              <div className="text-center bg-gray-900 rounded-lg p-2">
                <p className="text-gray-400 text-xs mb-1">USD</p>
                <p className="text-white text-sm font-medium">{availableUSDBalance.toFixed(2)}</p>
              </div>
            </div>

            {/* Price Input - Only show for Limit Orders */}
            {orderType === 'Limit Order' && (
              <div>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => handlePriceChange(e.target.value)}
                  placeholder="Price (USD)"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all text-center"
                  step="0.000001"
                />
                <p className="text-gray-500 text-xs mt-1 text-center">
                  Market: {formatPrice(tokenData.price)}
                </p>
              </div>
            )}

            {/* Quantity Input with Max Button - compact */}
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder={`Amount (${tokenData.symbol})`}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 pr-12 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all text-center"
                step="0.01"
              />
              <button
                onClick={handleMaxClick}
                className="absolute right-1 top-1/2 transform -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded transition-colors"
              >
                MAX
              </button>
            </div>

            {/* Leverage Slider - moved up before trade size */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Leverage</span>
                <span className="text-white text-lg font-bold">{leverage}x</span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min="2"
                  max="100"
                  value={leverage}
                  onChange={(e) => handleLeverageChange(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>2x</span>
                  <span>50x</span>
                  <span>100x</span>
                </div>
              </div>
            </div>

            {/* Required Collateral Display - compact */}
            <div className="text-center bg-gray-900 rounded-lg p-2">
              <p className="text-gray-400 text-xs">Required Collateral</p>
              <p className="text-white text-lg font-bold">{calculateRequiredCollateral().toFixed(4)} SOL</p>
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

            {/* FIXED: Trade Size Display - now updates with leverage */}
            <div className="text-center bg-blue-900 border border-blue-700 rounded-lg p-2">
              <p className="text-blue-400 text-xs">Trade Size ({leverage}x Leveraged)</p>
              <p className="text-blue-300 text-xl font-bold">${formatTradeSize()}</p>
              <p className="text-blue-500 text-xs">
                Base: ${(calculateTradeSize() / leverage).toFixed(2)} × {leverage}x
              </p>
            </div>

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
                    onChange={(e) => setTpSl(e.target.checked)}
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

            {/* Execute Trade Button - compact */}
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
                  e.target.style.backgroundColor = '#1a6ce8';
                }
              }}
              onMouseLeave={(e) => {
                if (isFormValid()) {
                  e.target.style.backgroundColor = '#1e7cfa';
                }
              }}
            >
              {isExecutingTrade ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Position...</span>
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
    </div>
  );
}