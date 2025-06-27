import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Share, TrendingUp, TrendingDown, Users, Droplets, Clock, Coins, RefreshCw } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { formatCurrency, formatNumber, formatTokenAmount, formatTimeAgo } from '../utils/formatters';
import { fetchTokenDetail, fetchTokenPriceHistory, TokenDetailData, formatPrice } from '../services/birdeyeApi';
import TradingModal from './TradingModal';

interface TokenDetailProps {
  tokenAddress: string;
  onBack: () => void;
  onBuy: () => void;
  userSOLBalance?: number;
  userUSDBalance?: number;
  walletAddress?: string;
}

interface UserPosition {
  value: number;
  quantity: number;
  type: 'Long' | 'Short' | null;
}

interface HoverData {
  price: number;
  time: number;
  x: number;
  y: number;
}

type ChartPeriod = 'LIVE' | '4H' | '1D' | '1W' | '1M' | 'MAX';

export default function TokenDetail({ tokenAddress, onBack, onBuy, userSOLBalance = 0, userUSDBalance = 0, walletAddress = '' }: TokenDetailProps) {
  const { publicKey } = useWallet();
  const [tokenData, setTokenData] = useState<TokenDetailData | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition>({ value: 0, quantity: 0, type: null });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<ChartPeriod>('1D');
  const [priceHistory, setPriceHistory] = useState<Array<{ time: number; price: number }> | null>(null);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveUpdateInterval, setLiveUpdateInterval] = useState<NodeJS.Timeout | null>(null);
  const [showTradingModal, setShowTradingModal] = useState(false);
  
  // Hover state for chart
  const [hoverData, setHoverData] = useState<HoverData | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const chartRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    loadTokenData();
    if (publicKey) {
      loadUserPosition();
    }
  }, [tokenAddress, publicKey]);

  useEffect(() => {
    // Clear any existing live update interval
    if (liveUpdateInterval) {
      clearInterval(liveUpdateInterval);
      setLiveUpdateInterval(null);
    }

    if (tokenData) {
      loadPriceHistory(selectedPeriod);
      
      // Set up live updates for LIVE chart
      if (selectedPeriod === 'LIVE') {
        console.log('🔴 Setting up LIVE chart updates every 30 seconds');
        const interval = setInterval(() => {
          console.log('🔄 LIVE chart auto-refresh');
          loadPriceHistory('LIVE');
        }, 30000); // Update every 30 seconds for live data
        
        setLiveUpdateInterval(interval);
      }
    }

    // Cleanup interval on unmount or period change
    return () => {
      if (liveUpdateInterval) {
        clearInterval(liveUpdateInterval);
      }
    };
  }, [selectedPeriod, tokenData]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (liveUpdateInterval) {
        clearInterval(liveUpdateInterval);
      }
    };
  }, []);

  const loadTokenData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log(`🔍 Loading token data for: ${tokenAddress}`);
      const data = await fetchTokenDetail(tokenAddress);
      
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

  const loadPriceHistory = async (timeframe: ChartPeriod) => {
    if (!tokenData) return;
    
    setIsLoadingChart(true);
    try {
      console.log(`📈 Loading price history for ${timeframe}`);
      const history = await fetchTokenPriceHistory(tokenAddress, timeframe);
      setPriceHistory(history);
      console.log(`✅ Price history loaded: ${history?.length || 0} points`);
    } catch (error) {
      console.error('💥 Error loading price history:', error);
      setPriceHistory(null);
    } finally {
      setIsLoadingChart(false);
    }
  };

  const loadUserPosition = async () => {
    try {
      // Mock user position - in production, fetch actual position
      setUserPosition({
        value: 0.00,
        quantity: 0,
        type: null // Can be 'Long', 'Short', or null for no position
      });
    } catch (error) {
      console.error('Error loading user position:', error);
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
      loadPriceHistory(selectedPeriod);
    }
  };

  const handleOpenTradingModal = () => {
    setShowTradingModal(true);
  };

  const handleCloseTradingModal = () => {
    setShowTradingModal(false);
  };

  const generateChartData = () => {
    if (priceHistory && priceHistory.length > 0) {
      return priceHistory.map(point => point.price);
    }
    
    return [];
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
    if (!priceHistory || priceHistory.length === 0 || !chartRef.current) return;

    const rect = chartRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const chartWidth = rect.width;
    
    // Calculate which data point we're hovering over
    const dataIndex = Math.round((x / chartWidth) * (priceHistory.length - 1));
    const clampedIndex = Math.max(0, Math.min(dataIndex, priceHistory.length - 1));
    
    if (priceHistory[clampedIndex]) {
      const chartData = generateChartData();
      const minPrice = Math.min(...chartData);
      const maxPrice = Math.max(...chartData);
      const priceRange = maxPrice - minPrice;
      
      // Calculate y position for the hover point
      const y = priceRange > 0 ? 120 - ((priceHistory[clampedIndex].price - minPrice) / priceRange) * 100 : 60;
      
      setHoverData({
        price: priceHistory[clampedIndex].price,
        time: priceHistory[clampedIndex].time,
        x: (clampedIndex / (priceHistory.length - 1)) * 400, // SVG coordinate
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
          <div className="w-20 h-20 mx-auto mb-4">
            <img 
              src="https://i.imgur.com/fWVz5td.png" 
              alt="Loading" 
              className="w-full h-full object-cover rounded-lg animate-pulse"
            />
          </div>
          <p className="text-gray-400">Loading Trading Terminal</p>
        </div>
      </div>
    );
  }

  if (error || !tokenData) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-4">
            <img 
              src="https://i.imgur.com/fWVz5td.png" 
              alt="Error" 
              className="w-full h-full object-cover rounded-lg opacity-50"
            />
          </div>
          <h2 className="text-xl font-bold text-red-400 mb-2">Token Not Found</h2>
          <p className="text-gray-400 mb-4">
            {error || 'Failed to load token data. Please check the contract address and try again.'}
          </p>
          <button
            onClick={onBack}
            className="text-black font-medium py-3 px-6 rounded-lg transition-colors"
            style={{ backgroundColor: '#1e7cfa' }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#1a6ce8';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = '#1e7cfa';
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
      <div className="text-center max-w-md w-full">
        {/* Back Button - positioned absolutely */}
        <button 
          onClick={onBack}
          className="absolute top-6 left-6 flex items-center text-blue-400 hover:text-blue-300 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </button>

        {/* Share Button - positioned absolutely */}
        <button
          onClick={handleShare}
          className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white transition-colors"
        >
          <Share className="w-6 h-6" />
        </button>

        {/* Token Icon */}
        <div className="mb-8">
          <div className="w-20 h-20 mx-auto rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center">
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

        {/* Token Name */}
        <h1 className="text-3xl font-normal mb-2">
          {tokenData.name}
        </h1>

        {/* Token Symbol */}
        <p className="text-gray-400 text-lg mb-2">{tokenData.symbol}</p>

        {/* Price - Enhanced formatting with hover override */}
        <p className="text-5xl font-bold text-white mb-4">
          {isHovering && hoverData ? formatPrice(hoverData.price) : formatPrice(tokenData.price)}
        </p>

        {/* Price Change - Enhanced formatting */}
        <div className="flex items-center justify-center space-x-2 mb-8">
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

        {/* Chart */}
        <div className="mb-6">
          <div className="h-48 mb-4 relative bg-gray-900 rounded-lg p-4">
            {/* Chart Header with Refresh Button and Live Indicator */}
            <div className="absolute top-2 right-2 z-10 flex items-center space-x-2">
              {selectedPeriod === 'LIVE' && (
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-red-400 text-xs font-medium">LIVE</span>
                </div>
              )}
              <button
                onClick={handleRefreshChart}
                disabled={isLoadingChart}
                className="p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                title="Refresh chart data"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingChart ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {isLoadingChart ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-400 text-sm flex items-center space-x-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading {selectedPeriod} chart...</span>
                </div>
              </div>
            ) : chartData.length > 0 ? (
              <div className="h-full">
                {/* Chart Info */}
                <div className="text-left mb-2">
                  <p className="text-gray-400 text-xs">
                    {selectedPeriod} • {chartData.length} data points
                    {selectedPeriod === 'LIVE' && ' • Updates every 30s'}
                  </p>
                </div>

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
                    
                    {/* Chart line */}
                    <polyline
                      fill="none"
                      stroke={tokenData.priceChange24h >= 0 ? "#10b981" : "#ef4444"}
                      strokeWidth="2"
                      points={chartData.map((price, index) => {
                        const x = (index / (chartData.length - 1)) * 400;
                        const minPrice = Math.min(...chartData);
                        const maxPrice = Math.max(...chartData);
                        const priceRange = maxPrice - minPrice;
                        const y = priceRange > 0 ? 120 - ((price - minPrice) / priceRange) * 100 : 60;
                        return `${x},${y}`;
                      }).join(' ')}
                    />
                    
                    {/* Chart area fill */}
                    <polygon
                      fill="url(#chartGradient)"
                      points={`0,120 ${chartData.map((price, index) => {
                        const x = (index / (chartData.length - 1)) * 400;
                        const minPrice = Math.min(...chartData);
                        const maxPrice = Math.max(...chartData);
                        const priceRange = maxPrice - minPrice;
                        const y = priceRange > 0 ? 120 - ((price - minPrice) / priceRange) * 100 : 60;
                        return `${x},${y}`;
                      }).join(' ')} 400,120`}
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
                  <span>Low: {formatPrice(Math.min(...chartData))}</span>
                  <span>High: {formatPrice(Math.max(...chartData))}</span>
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

          {/* Chart Period Selector */}
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

        {/* Trade Button - Now positioned below chart */}
        <button
          onClick={handleOpenTradingModal}
          className="w-full text-black font-bold py-4 px-6 rounded-lg text-lg transition-colors flex items-center justify-center space-x-2 mb-8"
          style={{ backgroundColor: '#1e7cfa' }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#1a6ce8';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#1e7cfa';
          }}
        >
          <span className="text-xl">$</span>
          <span>Trade</span>
        </button>

        {/* Your Position */}
        <div className="mb-8">
          <h3 className="text-xl font-normal mb-4">Your position</h3>
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-gray-400 text-sm mb-1">Value</p>
                <p className="text-2xl font-bold">{formatCurrency(userPosition.value)}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-400 text-sm mb-1">Quantity</p>
                <p className="text-2xl font-bold">{formatNumber(userPosition.quantity)}</p>
              </div>
            </div>
            
            {/* Position Type */}
            <div className="flex justify-center">
              {userPosition.type ? (
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  userPosition.type === 'Long' 
                    ? 'bg-green-900 text-green-300' 
                    : 'bg-red-900 text-red-300'
                }`}>
                  {userPosition.type} Position
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-800 text-gray-400">
                  No Position
                </span>
              )}
            </div>
          </div>
        </div>

        {/* About Section */}
        <div className="mb-8">
          <h3 className="text-xl font-normal mb-4">About</h3>
          <div className="bg-gray-900 rounded-lg p-4 text-left">
            <p className="text-gray-300 text-sm leading-relaxed mb-4">
              {tokenData.description}
            </p>

            {/* Token Stats */}
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <TrendingUp className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-300">Market cap</span>
                </div>
                <span className="text-white font-medium">
                  {tokenData.marketCap > 0 ? formatCurrency(tokenData.marketCap) : 'N/A'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <Droplets className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-300">Volume</span>
                  <span className="text-gray-500 text-sm">Past 24h</span>
                </div>
                <span className="text-white font-medium">
                  {tokenData.volume24h > 0 ? formatCurrency(tokenData.volume24h) : 'N/A'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <Users className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-300">Holders</span>
                </div>
                <span className="text-white font-medium">
                  {tokenData.holders > 0 ? formatNumber(tokenData.holders) : 'N/A'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <Coins className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-300">Circulating supply</span>
                </div>
                <span className="text-white font-medium">
                  {tokenData.circulatingSupply > 0 ? formatNumber(tokenData.circulatingSupply) : 'N/A'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <Clock className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-300">Created</span>
                </div>
                <span className="text-white font-medium" title={tokenData.createdAt}>
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

        {/* Footer text */}
        <p className="text-gray-600 text-xs mt-4">
          By Trading You Agree To Our{' '}
          <span 
            style={{ color: '#1e7cfa' }} 
            className="underline cursor-pointer hover:text-blue-300 transition-colors"
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
        />
      )}
    </div>
  );
}