import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Share, TrendingUp, TrendingDown, Users, Droplets, Clock, Coins, RefreshCw } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { formatCurrency, formatNumber, formatTokenAmount, formatTimeAgo } from '../utils/formatters';
import { formatTokenName, formatTokenSymbol, formatDescription, getSmartPriceTextClass } from '../utils/textHelpers';
import { fetchTokenDetailCached, fetchTokenPriceHistory, TokenDetailData, formatPrice } from '../services/birdeyeApi';
import { subscribeToJupiterPrice, subscribeToJupiterChart, getJupiterOHLCV, isJupiterWebSocketConnected, isJupiterUsingFallback, getJupiterConnectionStatus, type BirdeyeOHLCV, type ChartUpdateCallback } from '../services/birdeyeWebSocket';
import TradingModal from './TradingModal';
import unifiedPriceService from '../services/unifiedPriceService';
import { userProfileService } from '../services/supabaseClient';

interface TokenDetailProps {
  tokenAddress: string;
  onBack: () => void;
  onBuy: () => void;
  userSOLBalance?: number;
  userUSDBalance?: number;
  walletAddress?: string;
  onUpdateSOLBalance?: (newBalance: number) => void;
  onShowTerms: () => void;
}



interface HoverData {
  price: number;
  time: number;
  x: number;
  y: number;
}

type ChartPeriod = 'LIVE' | '4H' | '1D' | '1W' | '1M' | 'MAX';

export default function TokenDetail({ tokenAddress, onBack, onBuy, userSOLBalance = 0, userUSDBalance = 0, walletAddress = '', onUpdateSOLBalance, onShowTerms }: TokenDetailProps) {
  const { publicKey } = useWallet();
  const [tokenData, setTokenData] = useState<TokenDetailData | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<ChartPeriod>('LIVE');
  const [priceHistory, setPriceHistory] = useState<Array<{ time: number; price: number }> | null>(null);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTradingModal, setShowTradingModal] = useState(false);
  
  // WebSocket subscriptions - unified real-time data  
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'fallback' | 'disconnected'>('connecting');
  const [liveChartData, setLiveChartData] = useState<Array<{ time: number; price: number; volume?: number }>>([]);
  
  // Hover state for chart
  const [hoverData, setHoverData] = useState<HoverData | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const chartRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    loadTokenData();
  }, [tokenAddress]);

  // Load historical data for non-LIVE periods (WebSocket now handled by unified service)
  useEffect(() => {
    if (!tokenData) return;

    console.log(`📊 Loading data for ${tokenData.symbol} (${selectedPeriod})`);

    // Load historical data for non-LIVE periods
    if (selectedPeriod !== 'LIVE') {
      loadPriceHistory(selectedPeriod);
    }

    // Update connection status based on actual WebSocket state
    const status = getJupiterConnectionStatus();
    setConnectionStatus(status as any);
  }, [selectedPeriod, tokenData, tokenAddress]);

  // Monitor WebSocket connection status
  useEffect(() => {
    const checkConnectionStatus = () => {
      const status = getJupiterConnectionStatus();
      setConnectionStatus(status as any);
    };

    // Check status immediately
    checkConnectionStatus();

    // Check status every 5 seconds for conservative resource usage
    const statusInterval = setInterval(checkConnectionStatus, 5000);

    return () => {
      clearInterval(statusInterval);
    };
  }, []);

  // Subscribe to unified price service for efficient price updates
  useEffect(() => {
    if (!tokenData) return;
    
    console.log(`📡 TokenDetail subscribing to unified price service for ${tokenData.symbol}`);
    
    // Track this token in the unified service
    unifiedPriceService.trackTokens([tokenAddress]);
    
    // Subscribe to price updates
    const unsubscribe = unifiedPriceService.subscribe(`token-detail-${tokenAddress}`, (priceData) => {
      const newPrice = priceData.tokenPrices[tokenAddress];
      if (newPrice && newPrice !== tokenData.price) {
        console.log(`🚀 ULTRA-FAST unified price update for ${tokenData.symbol}: ${newPrice}`);
        setTokenData(prev => prev ? {
          ...prev,
          price: newPrice
        } : null);

        // Also update live chart data if on LIVE period
        if (selectedPeriod === 'LIVE') {
          const newDataPoint = {
            time: Math.floor(Date.now() / 1000),
            price: newPrice,
            volume: tokenData.volume24h || 0
          };

          setLiveChartData(prev => {
            const updated = [...prev, newDataPoint];
            return updated.slice(-100); // Keep last 100 points
          });
        }

        // Update connection status to show fast updates
        setConnectionStatus('connected');
      }
    });
    
    return () => {
      console.log(`🔌 TokenDetail unsubscribing from unified price service for ${tokenData.symbol}`);
      unsubscribe();
      unifiedPriceService.untrackTokens([tokenAddress]);
    };
  }, [tokenAddress, tokenData?.symbol, selectedPeriod]);

  // Set currently viewed token as high-priority for 500ms updates
  useEffect(() => {
    if (!tokenData) return;
    
    console.log(`⚡ Adding ${tokenData.symbol} as high-priority token for 500ms updates`);
    
    // Add this token to high-priority list (doesn't affect position tokens)
    unifiedPriceService.addHighPriorityToken(tokenAddress);
    
    return () => {
      console.log(`🔇 Removing ${tokenData.symbol} from high-priority tokens`);
      // Remove this token from high-priority list
      unifiedPriceService.removeHighPriorityToken(tokenAddress);
    };
  }, [tokenAddress, tokenData?.symbol]);

  // Note: Price updates now handled by unified service - no separate API calls

  const loadTokenData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log(`🔍 Loading token data for: ${tokenAddress}`);
      const data = await fetchTokenDetailCached(tokenAddress);
      
      if (data) {
        setTokenData(data);
        console.log('✅ Token data loaded successfully:', data.symbol);
      } else {
        setError('Token not found or invalid contract address');
        console.error('❌ Failed to load token data');
      }
    } catch (error) {
      console.error('💥 Error loading token data:', error);
      setError('Failed to load token data. Please check the contract address.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPriceHistory = async (timeframe: ChartPeriod, showLoading: boolean = true) => {
    if (!tokenData) return;
    
    // Only show loading animation for initial loads and manual refreshes
    if (showLoading) {
      setIsLoadingChart(true);
    }
    
    try {
      if (showLoading) {
        console.log(`📈 Loading price history for ${timeframe}`);
      }
      const history = await fetchTokenPriceHistory(tokenAddress, timeframe);
      setPriceHistory(history);
      if (showLoading) {
        console.log(`✅ Price history loaded: ${history?.length || 0} points`);
      }
    } catch (error) {
      console.error('💥 Error loading price history:', error);
      setPriceHistory(null);
    } finally {
      if (showLoading) {
        setIsLoadingChart(false);
      }
    }
  };



  const handleShare = () => {
    if (navigator.share && tokenData) {
      navigator.share({
        title: `${tokenData.name} (${tokenData.symbol})`,
        text: `Check out ${tokenData.name} on Pump Pumpkin`,
        url: window.location.href,
      });
    } else {
      // Fallback to clipboard
      navigator.clipboard.writeText(window.location.href);
    }
  };

  const handleRefreshChart = () => {
    if (tokenData) {
      // Manual refresh - show loading animation
      loadPriceHistory(selectedPeriod, true);
    }
  };

  const handleOpenTradingModal = async () => {
    // ADDED: Refresh SOL balance before opening trading modal to prevent stale balance issues
    if (walletAddress && onUpdateSOLBalance) {
      try {
        console.log('🔄 Refreshing SOL balance before opening trading modal...');
        const profile = await userProfileService.getProfile(walletAddress);
        if (profile) {
          console.log('💰 Pre-trade SOL balance refresh:', {
            current_ui_balance: userSOLBalance,
            fresh_db_balance: profile.sol_balance
          });
          onUpdateSOLBalance(profile.sol_balance);
        }
      } catch (error) {
        console.error('Failed to refresh SOL balance before trading:', error);
      }
    }
    
    setShowTradingModal(true);
  };

  const handleCloseTradingModal = () => {
    setShowTradingModal(false);
  };

  const generateChartData = () => {
    // Use WebSocket live data for LIVE period, REST API data for historical periods
    if (selectedPeriod === 'LIVE' && liveChartData.length > 0) {
      return liveChartData.map(point => point.price);
    } else if (priceHistory && priceHistory.length > 0) {
      return priceHistory.map(point => point.price);
    }
    
    return [];
  };

  const getCurrentPriceHistory = () => {
    // Return appropriate data source for current period
    if (selectedPeriod === 'LIVE' && liveChartData.length > 0) {
      return liveChartData;
    }
    return priceHistory || [];
  };

  const formatPriceChange = (price: number, changePercent: number) => {
    const changeAmount = Math.abs(price * changePercent / 100);
    const sign = changePercent >= 0 ? '+' : '';
    
    return {
      amount: `${sign}${formatPrice(changeAmount).replace('$', '$')}`,
      percent: `${sign}${changePercent.toFixed(1)}%`
    };
  };

  const formatTimeForHover = (timestamp: number, period: ChartPeriod): string => {
    const date = new Date(timestamp * 1000);
    
    switch (period) {
      case 'LIVE':
      case '4H':
        return date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        });
      case '1D':
        return date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        });
      case '1W':
        return date.toLocaleDateString('en-US', { 
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
      case '1M':
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          hour12: true
        });
      case 'MAX':
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: 'numeric'
        });
      default:
        return date.toLocaleString('en-US');
    }
  };

  const handleChartMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const currentData = getCurrentPriceHistory();
    if (!currentData || currentData.length === 0 || !chartRef.current) return;

    const rect = chartRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const chartWidth = rect.width;
    
    // Calculate which data point we're hovering over
    const dataIndex = Math.round((x / chartWidth) * (currentData.length - 1));
    const clampedIndex = Math.max(0, Math.min(dataIndex, currentData.length - 1));
    
    if (currentData[clampedIndex]) {
      const chartData = generateChartData();
      const minPrice = Math.min(...chartData);
      const maxPrice = Math.max(...chartData);
      const priceRange = maxPrice - minPrice;
      
      // Calculate y position for the hover point
      const y = priceRange > 0 ? 120 - ((currentData[clampedIndex].price - minPrice) / priceRange) * 100 : 60;
      
      setHoverData({
        price: currentData[clampedIndex].price,
        time: currentData[clampedIndex].time,
        x: (clampedIndex / (currentData.length - 1)) * 400, // SVG coordinate
        y: y
      });
      setIsHovering(true);
    }
  };

  const handleChartMouseLeave = () => {
    setIsHovering(false);
    setHoverData(null);
  };

  const chartData = generateChartData();
  const periods: ChartPeriod[] = ['LIVE', '4H', '1D', '1W', '1M', 'MAX'];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4">
            <img 
              src="https://i.imgur.com/fWVz5td.png" 
              alt="Loading" 
              className="w-full h-full object-cover rounded-lg animate-pulse"
            />
          </div>
          <p className="text-gray-400 text-sm">Loading Trading Terminal</p>
        </div>
      </div>
    );
  }

  if (error || !tokenData) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm mx-auto">
          <div className="w-16 h-16 mx-auto mb-4">
            <img 
              src="https://i.imgur.com/fWVz5td.png" 
              alt="Error" 
              className="w-full h-full object-cover rounded-lg opacity-50"
            />
          </div>
          <h2 className="text-lg font-bold text-red-400 mb-3">Token Not Found</h2>
          <p className="text-gray-400 mb-4 text-sm">
            {error || 'Failed to load token data. Please check the contract address and try again.'}
          </p>
          <button
            onClick={onBack}
            className="text-black font-medium py-3 px-6 rounded-lg transition-colors text-base min-h-[48px]"
            style={{ backgroundColor: '#1e7cfa' }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.backgroundColor = '#1a6ce8';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.backgroundColor = '#1e7cfa';
            }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const priceChangeData = formatPriceChange(tokenData.price, tokenData.priceChange24h);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="text-center max-w-sm w-full mx-auto">
        {/* Back Button - positioned absolutely - Properly sized */}
        <button 
          onClick={onBack}
          className="absolute top-6 left-6 flex items-center text-blue-400 hover:text-blue-300 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          <span className="text-sm">Back</span>
        </button>

        {/* Share Button - positioned absolutely - Properly sized */}
        <button
          onClick={handleShare}
          className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors"
        >
          <Share className="w-5 h-5" />
        </button>

        {/* Token Icon - Properly sized for mobile */}
        <div className="mb-6">
          <div className="w-16 h-16 mx-auto rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center">
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
            <span className={`text-2xl font-bold text-white ${tokenData.logoURI ? 'hidden' : 'flex'}`}>
              {tokenData.symbol.charAt(0)}
            </span>
          </div>
        </div>

        {/* Token Name - Smart responsive sizing with truncation */}
        <h1 className="text-2xl font-normal mb-2 px-4 max-w-full truncate">
          {formatTokenName(tokenData.name)}
        </h1>

        {/* Token Symbol - Smart responsive sizing */}
        <p className="text-gray-400 text-base mb-4 truncate max-w-full px-4">
          {formatTokenSymbol(tokenData.symbol)}
        </p>

        {/* Price - Smart responsive sizing with live indicator */}
        <div className="flex flex-col items-center space-y-2 mb-4 px-4">
          <div className="flex items-center space-x-2">
            <p className={`font-bold text-white break-all text-center ${
              getSmartPriceTextClass(
                isHovering && hoverData 
                  ? formatPrice(hoverData.price) 
                  : formatPrice(tokenData.price)
              )
            }`}>
              {isHovering && hoverData ? formatPrice(hoverData.price) : formatPrice(tokenData.price)}
            </p>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-green-400 text-xs font-medium">LIVE</span>
            </div>
          </div>
        </div>

        {/* Price Change - Responsive formatting */}
        <div className="flex items-center justify-center space-x-2 mb-6 px-4">
          {tokenData.priceChange24h >= 0 ? (
            <TrendingUp className="w-5 h-5 text-green-500" />
          ) : (
            <TrendingDown className="w-5 h-5 text-red-500" />
          )}
          <span className={`text-lg font-medium ${
            tokenData.priceChange24h >= 0 ? 'text-green-500' : 'text-red-500'
          }`}>
            {priceChangeData.amount} ({priceChangeData.percent})
          </span>
          <span className="text-gray-400 text-sm">
            {isHovering && hoverData ? formatTimeForHover(hoverData.time, selectedPeriod) : 'Past day'}
          </span>
        </div>

        {/* Chart - Properly sized for mobile */}
        <div className="mb-6">
          <div className="h-40 mb-4 relative bg-gray-900 rounded-lg p-4">
            {/* Chart Header with WebSocket Status and Live Indicator */}
            <div className="absolute top-2 right-2 z-10 flex items-center space-x-2">
              {selectedPeriod === 'LIVE' && (
                <div className="flex items-center space-x-1">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${
                    connectionStatus === 'connected' ? 'bg-green-500' : 
                    connectionStatus === 'fallback' ? 'bg-blue-500' : 'bg-yellow-500'
                  }`}></div>
                  <span className={`text-xs font-medium ${
                    connectionStatus === 'connected' ? 'text-green-400' : 
                    connectionStatus === 'fallback' ? 'text-blue-400' : 'text-yellow-400'
                  }`}>
                    {connectionStatus === 'connected' ? 'LIVE' : 
                     connectionStatus === 'fallback' ? 'FAST' : 'CONNECTING'}
                  </span>
                </div>
              )}
              <button
                onClick={handleRefreshChart}
                disabled={isLoadingChart || (selectedPeriod === 'LIVE' && connectionStatus !== 'disconnected')}
                className="p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                title={selectedPeriod === 'LIVE' ? 
                  connectionStatus === 'connected' ? 'Live data via WebSocket' :
                  connectionStatus === 'fallback' ? 'Fast polling via REST API' : 'Loading live data...' 
                  : 'Refresh chart data'}
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingChart ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {isLoadingChart && selectedPeriod !== 'LIVE' ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-400 text-sm flex items-center space-x-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading {selectedPeriod} chart...</span>
                </div>
              </div>
            ) : generateChartData().length > 0 ? (
              <div className="h-full">


                {/* Interactive Chart with Hover */}
                <div className="relative">
                  <svg 
                    ref={chartRef}
                    className="w-full h-32 cursor-crosshair" 
                    viewBox="0 0 400 120"
                    onMouseMove={handleChartMouseMove}
                    onMouseLeave={handleChartMouseLeave}
                  >
                    <defs>
                      <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={tokenData.priceChange24h >= 0 ? "#10b981" : "#ef4444"} stopOpacity="0.3"/>
                        <stop offset="100%" stopColor={tokenData.priceChange24h >= 0 ? "#10b981" : "#ef4444"} stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    
                    {/* Chart line with smooth transitions */}
                    <polyline
                      fill="none"
                      stroke={tokenData.priceChange24h >= 0 ? "#10b981" : "#ef4444"}
                      strokeWidth="2"
                      points={(() => {
                        const chartData = generateChartData();
                        return chartData.map((price, index) => {
                          const x = (index / (chartData.length - 1)) * 400;
                          const minPrice = Math.min(...chartData);
                          const maxPrice = Math.max(...chartData);
                          const priceRange = maxPrice - minPrice;
                          const y = priceRange > 0 ? 120 - ((price - minPrice) / priceRange) * 100 : 60;
                          return `${x},${y}`;
                        }).join(' ');
                      })()}
                      style={{
                        transition: selectedPeriod === 'LIVE' ? 'none' : 'all 0.3s ease-in-out'
                      }}
                    />
                    
                    {/* Chart area fill with smooth transitions */}
                    <polygon
                      fill="url(#chartGradient)"
                      points={(() => {
                        const chartData = generateChartData();
                        return `0,120 ${chartData.map((price, index) => {
                          const x = (index / (chartData.length - 1)) * 400;
                          const minPrice = Math.min(...chartData);
                          const maxPrice = Math.max(...chartData);
                          const priceRange = maxPrice - minPrice;
                          const y = priceRange > 0 ? 120 - ((price - minPrice) / priceRange) * 100 : 60;
                          return `${x},${y}`;
                        }).join(' ')} 400,120`;
                      })()}
                      style={{
                        transition: selectedPeriod === 'LIVE' ? 'none' : 'all 0.3s ease-in-out'
                      }}
                    />

                    {/* Hover Elements */}
                    {isHovering && hoverData && (
                      <g>
                        {/* Vertical line at hover point */}
                        <line
                          x1={hoverData.x}
                          y1="0"
                          x2={hoverData.x}
                          y2="120"
                          stroke="#6b7280"
                          strokeWidth="1"
                          strokeDasharray="2,2"
                          opacity="0.7"
                        />
                        
                        {/* Horizontal line at hover point */}
                        <line
                          x1="0"
                          y1={hoverData.y}
                          x2="400"
                          y2={hoverData.y}
                          stroke="#6b7280"
                          strokeWidth="1"
                          strokeDasharray="2,2"
                          opacity="0.7"
                        />
                        
                        {/* Hover point circle */}
                        <circle
                          cx={hoverData.x}
                          cy={hoverData.y}
                          r="4"
                          fill={tokenData.priceChange24h >= 0 ? "#10b981" : "#ef4444"}
                          stroke="#ffffff"
                          strokeWidth="2"
                        />
                        
                        {/* Price label background */}
                        <rect
                          x={Math.max(5, Math.min(hoverData.x - 40, 320))}
                          y={Math.max(5, hoverData.y - 25)}
                          width="80"
                          height="20"
                          fill="#1f2937"
                          stroke="#374151"
                          strokeWidth="1"
                          rx="4"
                          opacity="0.95"
                        />
                        
                        {/* Price label text */}
                        <text
                          x={Math.max(45, Math.min(hoverData.x, 360))}
                          y={Math.max(18, hoverData.y - 10)}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="10"
                          fontWeight="bold"
                        >
                          {formatPrice(hoverData.price)}
                        </text>
                      </g>
                    )}

                    {/* Invisible overlay for better mouse interaction */}
                    <rect
                      x="0"
                      y="0"
                      width="400"
                      height="120"
                      fill="transparent"
                      style={{ pointerEvents: 'all' }}
                    />
                  </svg>

                  {/* Hover tooltip positioned outside SVG */}
                  {isHovering && hoverData && (
                    <div 
                      className="absolute bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm pointer-events-none z-20"
                      style={{
                        left: `${Math.min(Math.max((hoverData.x / 400) * 100, 10), 70)}%`,
                        top: '-45px',
                        transform: 'translateX(-50%)'
                      }}
                    >
                      <div className="text-white font-medium">
                        {formatPrice(hoverData.price)}
                      </div>
                      <div className="text-gray-400 text-xs">
                        {formatTimeForHover(hoverData.time, selectedPeriod)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Price Range Info */}
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Low: {formatPrice(Math.min(...generateChartData()))}</span>
                  <span>High: {formatPrice(Math.max(...generateChartData()))}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-gray-400 text-sm mb-2">Chart data unavailable</div>
                  <button
                    onClick={handleRefreshChart}
                    className="text-blue-400 hover:text-blue-300 text-xs"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Chart Period Selector - Compact for mobile */}
          <div className="flex items-center justify-center space-x-1 mb-6">
            {periods.map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                disabled={isLoadingChart}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedPeriod === period
                    ? 'text-black font-medium'
                    : 'bg-gray-800 text-gray-400 hover:text-white disabled:opacity-50'
                }`}
                style={{ 
                  backgroundColor: selectedPeriod === period ? '#1e7cfa' : undefined
                }}
              >
                {period}
              </button>
            ))}
          </div>
        </div>

        {/* Trade Button - Properly sized for mobile */}
        <button
          onClick={handleOpenTradingModal}
          className="w-full text-black font-bold py-4 px-6 rounded-lg text-lg transition-colors flex items-center justify-center space-x-2 mb-6 min-h-[56px]"
          style={{ backgroundColor: '#1e7cfa' }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.backgroundColor = '#1a6ce8';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.backgroundColor = '#1e7cfa';
          }}
        >
          <span className="text-lg">$</span>
          <span>Trade</span>
        </button>



        {/* About Section - Properly sized for mobile */}
        <div className="mb-6">
          <h3 className="text-lg font-normal mb-4">About</h3>
          <div className="bg-gray-900 rounded-lg p-4 text-left">
            <p className="text-gray-300 text-sm leading-relaxed mb-4 break-words">
              {formatDescription(tokenData.description || 'No description available.', true)}
            </p>

            {/* Token Stats - Properly sized for mobile */}
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <TrendingUp className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-300 text-sm">Market cap</span>
                </div>
                <span className="text-white font-medium text-sm break-all">
                  {tokenData.marketCap > 0 ? formatCurrency(tokenData.marketCap) : 'N/A'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <Droplets className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-300 text-sm">Volume</span>
                  <span className="text-gray-500 text-xs">Past 24h</span>
                </div>
                <span className="text-white font-medium text-sm break-all">
                  {tokenData.volume24h > 0 ? formatCurrency(tokenData.volume24h) : 'N/A'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-300 text-sm">Holders</span>
                </div>
                <span className="text-white font-medium text-sm break-all">
                  {tokenData.holders > 0 ? formatNumber(tokenData.holders) : 'N/A'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <Coins className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-300 text-sm">Circulating supply</span>
                </div>
                <span className="text-white font-medium text-sm break-all">
                  {tokenData.circulatingSupply > 0 ? formatNumber(tokenData.circulatingSupply) : 'N/A'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-300 text-sm">Created</span>
                </div>
                <span className="text-white font-medium text-sm break-all" title={tokenData.createdAt}>
                  {/* ENHANCED: Show relative time with fallback to absolute */}
                  {tokenData.createdAtTimestamp && tokenData.createdAtTimestamp > 0 
                    ? formatTimeAgo(tokenData.createdAtTimestamp * 1000)
                    : tokenData.createdAt
                  }
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer text - Properly sized for mobile */}
        <p className="text-gray-600 text-xs mt-4 px-4 text-center">
          By Trading You Agree To Our{' '}
          <span 
            style={{ color: '#1e7cfa' }} 
            className="underline cursor-pointer hover:text-blue-300 transition-colors"
            onClick={onShowTerms}
          >
            Terms Of Service
          </span>
        </p>
      </div>

      {/* Trading Modal */}
      {showTradingModal && tokenData && (
        <TradingModal
          tokenData={tokenData}
          onClose={handleCloseTradingModal}
          userSOLBalance={userSOLBalance}
          userUSDBalance={userUSDBalance}
          walletAddress={walletAddress || publicKey?.toString() || ''}
          onUpdateSOLBalance={onUpdateSOLBalance}
          onShowTerms={onShowTerms}
        />
      )}
    </div>
  );
}