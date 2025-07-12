import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { TradingPosition } from '../services/positionService';
import { formatPrice } from '../services/birdeyeApi';
import { subscribeToJupiterPrice, getJupiterPrice } from '../services/birdeyeWebSocket'; // Note: Actually using Birdeye WebSocket
import unifiedPriceService from '../services/unifiedPriceService';
import TradeLoadingModal from './TradeLoadingModal';
import TradeResultsModal from './TradeResultsModal';
import { soundManager } from '../services/soundManager';

interface PositionModalProps {
  position: TradingPosition;
  onClose: () => void;
  onClosePosition: (positionId: number) => void;
  isClosingPosition?: boolean;
  solPrice?: number;
}

// Format numbers with K, M, B prefixes
const formatCompactNumber = (num: number): string => {
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  
  if (absNum >= 1000000000) {
    return `${sign}$${(absNum / 1000000000).toFixed(1)}B`;
  } else if (absNum >= 1000000) {
    return `${sign}$${(absNum / 1000000).toFixed(1)}M`;
  } else if (absNum >= 1000) {
    return `${sign}$${(absNum / 1000).toFixed(1)}K`;
  } else {
    return `${sign}$${absNum.toFixed(2)}`;
  }
};

export default function PositionModal({ position, onClose, onClosePosition, isClosingPosition = false, solPrice = 98.45 }: PositionModalProps) {
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [realtimePrice, setRealtimePrice] = useState<number | null>(null);
  
  // Closing trade loading modal state
  const [showClosingModal, setShowClosingModal] = useState(false);
  
  // Trade results modal state
  const [showTradeResults, setShowTradeResults] = useState(false);
  const [tradeResultsData, setTradeResultsData] = useState<{
    tokenSymbol: string;
    direction: 'Long' | 'Short';
    leverage: number;
    entryPrice: number;
    exitPrice: number;
    positionSize: number;
    collateralAmount: number;
    grossPnL?: number;    // Gross P&L before fees
    profitFee?: number;   // 20% profit fee
    finalPnL: number;     // Net P&L after fees
    pnlPercentage: number;
    totalReturn: number;
  } | null>(null);

  // Subscribe to unified price service for ultra-fast updates
  useEffect(() => {
    console.log(`🚀 PositionModal: Subscribing to ULTRA-FAST unified price service for ${position.token_symbol}`);
    
    // Track this token and subscribe to unified price updates
    const unsubscribe = unifiedPriceService.subscribe(`position-modal-${position.token_address}`, (priceData: { solPrice: number; tokenPrices: Record<string, number>; lastUpdate: number }) => {
      const newPrice = priceData.tokenPrices[position.token_address];
      if (newPrice) {
        console.log(`⚡ PositionModal: ULTRA-FAST price update for ${position.token_symbol}: $${newPrice.toFixed(6)}`);
        setRealtimePrice(newPrice);
      }
    });
    
    // Add to high-priority tokens for 500ms updates
    unifiedPriceService.addHighPriorityToken(position.token_address);
    unifiedPriceService.trackTokens([position.token_address]);
    
    return () => {
      console.log(`🔌 PositionModal: Unsubscribing from unified price service for ${position.token_symbol}`);
      unsubscribe();
      unifiedPriceService.removeHighPriorityToken(position.token_address);
      unifiedPriceService.untrackTokens([position.token_address]);
    };
  }, [position.token_address, position.token_symbol]);

  const isProfit = position.current_pnl >= 0;
  const marginRatio = position.margin_ratio || 0;
  const marginRiskLevel = marginRatio <= 0.5 ? 'safe' : marginRatio <= 0.8 ? 'warning' : 'danger';

  // Check for trade results after closing modal completes
  const checkForTradeResults = async (positionId: number) => {
    try {
      console.log('🔍 PositionModal: Checking for trade results for position', positionId);
      
      // Import supabase dynamically
      const { supabase } = await import('../services/supabaseClient');
      
      // Get the position from database to check for trade results
      const { data: position, error } = await supabase
        .from('trading_positions')
        .select('trade_results')
        .eq('id', positionId)
        .single();
      
      if (error) {
        console.error('PositionModal: Error fetching position for trade results:', error);
        return;
      }
      
      if (position?.trade_results) {
        const tradeResults = JSON.parse(position.trade_results);
        console.log('📊 PositionModal: Found trade results for position', positionId, ':', tradeResults);
        
        setTradeResultsData(tradeResults);
        setShowTradeResults(true);
        
        // Clear trade results from database after displaying
        await supabase
          .from('trading_positions')
          .update({ trade_results: null })
          .eq('id', positionId);
          
        console.log('🧹 PositionModal: Cleared trade results from database for position', positionId);
      } else {
        console.log('⚠️ PositionModal: No trade results found for position', positionId);
      }
    } catch (error) {
      console.error('PositionModal: Error checking for trade results:', error);
    }
  };

  const handleClosePosition = () => {
    // Show closing trade loading modal
    setShowClosingModal(true);
    
    // Auto-close loading modal after 65 seconds, then check for results
    setTimeout(async () => {
      setShowClosingModal(false);
      
      // Check for trade results
      await checkForTradeResults(position.id);
    }, 65000);
    
    onClosePosition(position.id);
    setShowCloseConfirm(false);
    onClose();
  };

  const formatPnL = (pnl: number) => {
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}${formatCompactNumber(Math.abs(pnl))}`;
  };

  const formatPnLPercentage = (pnl: number, collateral: number) => {
    const collateralUSD = collateral * solPrice;
    const percentage = (pnl / collateralUSD) * 100;
    const sign = percentage >= 0 ? '+' : '';
    return `${sign}${percentage.toFixed(1)}%`;
  };

  const getRiskColor = () => {
    switch (marginRiskLevel) {
      case 'safe': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'danger': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getRiskText = () => {
    switch (marginRiskLevel) {
      case 'safe': return 'Safe';
      case 'warning': return 'At Risk';
      case 'danger': return 'High Risk';
      default: return 'Unknown';
    }
  };

  if (showCloseConfirm) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center p-2 z-50">
        <div className="text-center max-w-sm w-full">
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setShowCloseConfirm(false)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-3">
            <div className="w-12 h-12 mx-auto">
              <AlertCircle className="w-full h-full text-yellow-400" />
            </div>
          </div>

          <h1 className="text-lg font-normal mb-1">
            Close <span style={{ color: '#1e7cfa' }}>Position?</span>
          </h1>
          
          <p className="text-gray-400 text-sm mb-1 truncate">
            {position.token_symbol} {position.leverage}x {position.direction}
          </p>
          <p className="text-gray-500 text-xs mb-3">This action cannot be undone</p>

          {/* Current P&L Display */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 mb-3">
            <p className="text-gray-400 text-xs mb-1">Current P&L</p>
            <p className={`text-lg font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
              {formatPnL(position.current_pnl)}
            </p>
            <p className={`text-xs ${isProfit ? 'text-green-300' : 'text-red-300'}`}>
              {formatPnLPercentage(position.current_pnl, position.collateral_sol)}
            </p>
          </div>

          <button
            onClick={handleClosePosition}
            disabled={isClosingPosition}
            className="w-full text-black font-medium py-2 px-3 rounded-lg text-sm transition-colors disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed mb-2 flex items-center justify-center space-x-2"
            style={{ 
              backgroundColor: isClosingPosition ? '#374151' : '#1e7cfa',
              color: isClosingPosition ? '#9ca3af' : 'black'
            }}
          >
            {isClosingPosition ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Close Position</span>
              </>
            ) : (
              <span>Close Position</span>
            )}
          </button>

          <button
            onClick={() => setShowCloseConfirm(false)}
            disabled={isClosingPosition}
            className="w-full bg-transparent border border-gray-600 hover:border-gray-500 text-gray-400 hover:text-gray-300 font-medium py-2 px-3 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center p-2 z-50">
      <div className="text-center max-w-sm w-full">
        <div className="flex justify-between items-center mb-3">
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors flex items-center space-x-1"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </button>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Token Icon */}
        <div className="mb-3">
          <div className="w-12 h-12 mx-auto">
            {position.token_image ? (
              <img 
                src={position.token_image} 
                alt={position.token_symbol}
                className="w-full h-full object-cover rounded-lg"
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
            <div className={`w-full h-full bg-gray-800 rounded-lg flex items-center justify-center ${position.token_image ? 'hidden' : 'flex'}`}>
              <span className="text-white text-lg font-bold">
                {position.token_symbol.charAt(0)}
              </span>
            </div>
          </div>
        </div>

        {/* Title - More Compact */}
        <h1 className="text-lg font-normal mb-1 truncate">
          <span style={{ color: '#1e7cfa' }}>{position.token_symbol}</span> Position
        </h1>
        
        {/* Position Details - More Compact */}
        <div className="flex items-center justify-center space-x-1 mb-1">
          <div className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium ${
            position.direction === 'Long' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
          }`}>
            {position.direction === 'Long' ? 
              <TrendingUp className="w-3 h-3" /> : 
              <TrendingDown className="w-3 h-3" />
            }
            <span>{position.direction} {position.leverage}x</span>
          </div>
        </div>
        
        <p className="text-gray-400 text-xs mb-3">Position #{position.id}</p>

        {/* P&L Display - More Compact */}
        <div className={`border rounded-lg p-2 mb-2 ${
          isProfit ? 'bg-green-900 border-green-700' : 'bg-red-900 border-red-700'
        }`}>
          <p className="text-gray-300 text-xs mb-1">Unrealized P&L</p>
          <p className={`text-xl font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
            {formatPnL(position.current_pnl)}
          </p>
          <p className={`text-xs ${isProfit ? 'text-green-300' : 'text-red-300'}`}>
            {formatPnLPercentage(position.current_pnl, position.collateral_sol)}
          </p>
        </div>

        {/* Price Info - More Compact */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 mb-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center">
              <p className="text-gray-400 text-xs mb-1 flex items-center justify-center space-x-1">
                <span>Current</span>
                {realtimePrice && (
                  <span className="text-green-400 text-xs">●</span>
                )}
              </p>
              <p className="text-white text-sm font-bold truncate">
                {formatPrice(realtimePrice || position.current_price || position.entry_price)}
              </p>
              {realtimePrice && (
                <p className="text-green-400 text-xs">Live</p>
              )}
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-xs mb-1">Entry</p>
              <p className="text-white text-sm font-bold truncate">
                {formatPrice(position.entry_price)}
              </p>
            </div>
          </div>
        </div>

        {/* Risk Level - More Compact */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-gray-400 text-xs">Risk Level</span>
            <span className={`font-medium text-xs ${getRiskColor()}`}>
              {getRiskText()}
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1 mb-1">
            <div 
              className={`h-1 rounded-full transition-all duration-300 ${
                marginRatio >= 0.8 ? 'bg-red-500' : 
                marginRatio >= 0.6 ? 'bg-yellow-500' : 
                'bg-green-500'
              }`}
              style={{ width: `${Math.min(marginRatio * 100, 100)}%` }}
            />
          </div>
          <p className="text-gray-400 text-xs">
            {(marginRatio * 100).toFixed(1)}% margin used
          </p>
        </div>

        {/* Position Details - More Compact */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 mb-3">
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Size:</span>
              <span className="text-white truncate max-w-24">{position.amount.toFixed(3)} {position.token_symbol}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Collateral:</span>
              <span className="text-white">{position.collateral_sol.toFixed(3)} SOL</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Liquidation:</span>
              <span className="text-red-400 truncate max-w-24">{formatPrice(position.liquidation_price)}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons - More Compact */}
        <button
          onClick={() => setShowCloseConfirm(true)}
          disabled={isClosingPosition || position.status === 'closing' || position.status === 'opening'}
          className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white font-medium py-2 px-3 rounded-lg text-sm transition-colors disabled:cursor-not-allowed mb-2"
        >
          Close Position
        </button>
        
        <button
          onClick={onClose}
          className="w-full bg-transparent border border-gray-600 hover:border-gray-500 text-gray-400 hover:text-gray-300 font-medium py-2 px-3 rounded-lg text-sm transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
      
      {/* Closing Trade Loading Modal */}
      <TradeLoadingModal
        isOpen={showClosingModal}
        type="closing"
        tokenSymbol={position.token_symbol}
        direction={position.direction}
        leverage={position.leverage}
        onClose={() => {
          setShowClosingModal(false);
        }}
        canCancel={false} // Don't allow cancelling during anti-gaming delay
      />
      
      {/* Trade Results Modal */}
      <TradeResultsModal
        isOpen={showTradeResults}
        onClose={() => {
          setShowTradeResults(false);
          setTradeResultsData(null);
        }}
        tradeData={tradeResultsData}
      />
    </div>
  );
} 