import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Move, RotateCcw, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { formatPrice, fetchTokenPriceHistory } from '../services/birdeyeApi';
import { jupiterWebSocket, BirdeyeOHLCV } from '../services/birdeyeWebSocket';

interface CandlestickDataPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

type TimeFrame = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1M';

interface EnhancedTokenChartProps {
  tokenAddress: string;
  tokenSymbol: string;
  priceChangePercent: number;
  className?: string;
  height?: number;
  onPriceUpdate?: (price: number) => void;
}

interface ViewState {
  startIndex: number;
  endIndex: number;
  zoom: number;
  panOffset: number;
}

export default function EnhancedTokenChart({ 
  tokenAddress, 
  tokenSymbol, 
  priceChangePercent,
  className = '',
  height = 300,
  onPriceUpdate 
}: EnhancedTokenChartProps) {
  const [chartData, setChartData] = useState<CandlestickDataPoint[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'fallback' | 'disconnected'>('connecting');
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeFrame>('15m');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [viewState, setViewState] = useState<ViewState>({
    startIndex: 0,
    endIndex: 100,
    zoom: 1,
    panOffset: 0
  });
  
  // Interaction states
  const [hoverData, setHoverData] = useState<{
    price: number;
    time: number;
    x: number;
    y: number;
    ohlc?: {
      open: number;
      high: number;
      low: number;
      close: number;
    };
  } | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; startIndex: number } | null>(null);
  
  const chartRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Helper function to get timeframe duration in seconds
  const getTimeframeSeconds = useCallback((): number => {
    const timeframeMap: Record<TimeFrame, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '1h': 3600,
      '4h': 14400,
      '1d': 86400,
      '1w': 604800,
      '1M': 2592000
    };
    return timeframeMap[selectedTimeframe] || 900;
  }, [selectedTimeframe]);

  // Load historical data for selected timeframe
  const loadHistoricalData = useCallback(async () => {
    if (!tokenAddress) return;
    
    setIsLoadingHistory(true);
    console.log(`📊 Loading historical data for ${tokenSymbol} (${selectedTimeframe})`);
    
    try {
      // Map our timeframes to Birdeye API format
      const birdeyeTimeframe = selectedTimeframe === '1M' ? 'MAX' : 
                              selectedTimeframe === '1w' ? '1W' : 
                              selectedTimeframe === '1d' ? '1D' : 
                              selectedTimeframe === '4h' ? '4H' : '1D';
                              
      const history = await fetchTokenPriceHistory(tokenAddress, birdeyeTimeframe);
      
      if (history && history.length > 0) {
        // Convert price history to candlestick data
        const candlesticks: CandlestickDataPoint[] = history.map((point, index) => {
          const price = point.price;
          // Create synthetic OHLC data from price points
          const prevPrice = index > 0 ? history[index - 1].price : price;
          const volatility = Math.abs(price - prevPrice) * 0.1; // 10% of price movement as volatility
          
          return {
            time: point.time,
            open: index === 0 ? price : prevPrice,
            high: price + volatility * Math.random(),
            low: price - volatility * Math.random(),
            close: price,
            volume: Math.random() * 1000000 // Synthetic volume
          };
        });
        
        setChartData(candlesticks);
        setViewState({
          startIndex: Math.max(0, candlesticks.length - 100),
          endIndex: candlesticks.length,
          zoom: 1,
          panOffset: 0
        });
        
        console.log(`✅ Loaded ${candlesticks.length} candlesticks for ${selectedTimeframe}`);
      } else {
        console.warn('⚠️ No historical data available');
        setChartData([]);
      }
    } catch (error) {
      console.error('❌ Failed to load historical data:', error);
      setChartData([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [tokenAddress, tokenSymbol, selectedTimeframe]);

  // Load historical data when timeframe changes
  useEffect(() => {
    loadHistoricalData();
  }, [loadHistoricalData]);

  // Subscribe to real-time WebSocket updates
  useEffect(() => {
    console.log(`🚀 Enhanced Chart: Subscribing to WebSocket for ${tokenSymbol}`);
    
    // Subscribe to real-time chart data
    const unsubscribeChart = jupiterWebSocket.subscribeToChart(
      tokenAddress,
      (address: string, ohlcv: BirdeyeOHLCV) => {
        const newDataPoint: CandlestickDataPoint = {
          time: ohlcv.timestamp,
          open: ohlcv.open,
          high: ohlcv.high,
          low: ohlcv.low,
          close: ohlcv.close,
          volume: ohlcv.volume
        };

        setChartData(prev => {
          const updated = [...prev];
          
          // Find if we need to update existing candle or add new one
          const existingIndex = updated.findIndex(candle => 
            Math.abs(candle.time - newDataPoint.time) < getTimeframeSeconds() / 2
          );
          
          if (existingIndex >= 0) {
            // Update existing candle
            updated[existingIndex] = {
              ...updated[existingIndex],
              high: Math.max(updated[existingIndex].high, newDataPoint.high),
              low: Math.min(updated[existingIndex].low, newDataPoint.low),
              close: newDataPoint.close,
              volume: newDataPoint.volume
            };
          } else {
            // Add new candle
            updated.push(newDataPoint);
          }
          
          // Keep last 1000 points for better performance
          const trimmed = updated.slice(-1000);
          
          // Auto-adjust view to show latest data if user is viewing recent data
          setViewState(prevView => {
            if (prevView.endIndex >= prev.length - 10) {
              return {
                ...prevView,
                startIndex: Math.max(0, trimmed.length - 100),
                endIndex: trimmed.length
              };
            }
            return prevView;
          });
          
          return trimmed;
        });

        // Notify parent component of price update
        if (onPriceUpdate) {
          onPriceUpdate(ohlcv.close);
        }

        setConnectionStatus('connected');
      }
    );

    // Also subscribe to price updates for immediate feedback
    const unsubscribePrice = jupiterWebSocket.subscribeToToken(
      tokenAddress,
      (address: string, price: number) => {
        // Update the latest candlestick's close price if it's very recent
        setChartData(prev => {
          if (prev.length === 0) return prev;
          
          const now = Math.floor(Date.now() / 1000);
          const latest = prev[prev.length - 1];
          
          // If the latest candle is within the current timeframe, update its close price
          if (now - latest.time < getTimeframeSeconds()) {
            const updated = [...prev];
            updated[updated.length - 1] = { 
              ...latest, 
              close: price,
              high: Math.max(latest.high, price),
              low: Math.min(latest.low, price)
            };
            return updated;
          }
          
          return prev;
        });

        if (onPriceUpdate) {
          onPriceUpdate(price);
        }
      }
    );

    return () => {
      console.log(`🔌 Enhanced Chart: Unsubscribing from WebSocket for ${tokenSymbol}`);
      unsubscribeChart();
      unsubscribePrice();
    };
  }, [tokenAddress, tokenSymbol, onPriceUpdate, selectedTimeframe]);

  // Get visible chart data based on current view state
  const getVisibleData = useCallback(() => {
    const { startIndex, endIndex } = viewState;
    return chartData.slice(
      Math.max(0, startIndex),
      Math.min(chartData.length, endIndex)
    );
  }, [chartData, viewState]);

  // Chart interaction handlers
  const handleChartInteraction = useCallback((clientX: number) => {
    if (!chartRef.current) return;
    
    const rect = chartRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const chartWidth = rect.width;
    const visibleData = getVisibleData();
    
    if (visibleData.length === 0) return;
    
    const dataIndex = Math.round((x / chartWidth) * (visibleData.length - 1));
    const clampedIndex = Math.max(0, Math.min(dataIndex, visibleData.length - 1));
    const dataPoint = visibleData[clampedIndex];
    
    if (dataPoint) {
      const prices = visibleData.map(d => d.close);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice;
      
      const y = priceRange > 0 
        ? height - 40 - ((dataPoint.close - minPrice) / priceRange) * (height - 80)
        : height / 2;
      
      setHoverData({
        price: dataPoint.close,
        time: dataPoint.time,
        x: (clampedIndex / (visibleData.length - 1)) * 400,
        y: (y / height) * 200, // Normalize to SVG coordinates
        ohlc: {
          open: dataPoint.open,
          high: dataPoint.high,
          low: dataPoint.low,
          close: dataPoint.close
        }
      });
      setIsHovering(true);
    }
  }, [getVisibleData, height]);

  // Mouse event handlers
  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging && dragStart) {
      const deltaX = event.clientX - dragStart.x;
      const sensitivity = 0.5;
      const indexDelta = Math.round(deltaX * sensitivity);
      
      setViewState(prev => {
        const newStartIndex = Math.max(0, dragStart.startIndex - indexDelta);
        const viewWidth = prev.endIndex - prev.startIndex;
        const newEndIndex = Math.min(chartData.length, newStartIndex + viewWidth);
        
        return {
          ...prev,
          startIndex: newStartIndex,
          endIndex: newEndIndex
        };
      });
    } else {
      handleChartInteraction(event.clientX);
    }
  };

  const handleMouseDown = (event: React.MouseEvent<SVGSVGElement>) => {
    setIsDragging(true);
    setDragStart({
      x: event.clientX,
      startIndex: viewState.startIndex
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setHoverData(null);
    setIsDragging(false);
    setDragStart(null);
  };

  // Zoom and pan controls
  const handleZoomIn = () => {
    setViewState(prev => {
      const currentWidth = prev.endIndex - prev.startIndex;
      const newWidth = Math.max(20, currentWidth * 0.7);
      const center = (prev.startIndex + prev.endIndex) / 2;
      
      return {
        ...prev,
        startIndex: Math.max(0, Math.round(center - newWidth / 2)),
        endIndex: Math.min(chartData.length, Math.round(center + newWidth / 2)),
        zoom: prev.zoom * 1.4
      };
    });
  };

  const handleZoomOut = () => {
    setViewState(prev => {
      const currentWidth = prev.endIndex - prev.startIndex;
      const newWidth = Math.min(chartData.length, currentWidth * 1.4);
      const center = (prev.startIndex + prev.endIndex) / 2;
      
      return {
        ...prev,
        startIndex: Math.max(0, Math.round(center - newWidth / 2)),
        endIndex: Math.min(chartData.length, Math.round(center + newWidth / 2)),
        zoom: prev.zoom * 0.7
      };
    });
  };

  const handleResetView = () => {
    setViewState({
      startIndex: Math.max(0, chartData.length - 100),
      endIndex: chartData.length,
      zoom: 1,
      panOffset: 0
    });
  };

  // Generate candlestick chart elements
  const generateCandlesticks = () => {
    const visibleData = getVisibleData();
    if (visibleData.length === 0) return [];
    
    const allPrices = visibleData.flatMap(d => [d.open, d.high, d.low, d.close]);
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice;
    
    const candleWidth = Math.max(2, 400 / visibleData.length * 0.8);
    
    return visibleData.map((candle, index) => {
      const x = (index / (visibleData.length - 1)) * 400;
      const openY = priceRange > 0 ? 200 - ((candle.open - minPrice) / priceRange) * 160 : 100;
      const highY = priceRange > 0 ? 200 - ((candle.high - minPrice) / priceRange) * 160 : 100;
      const lowY = priceRange > 0 ? 200 - ((candle.low - minPrice) / priceRange) * 160 : 100;
      const closeY = priceRange > 0 ? 200 - ((candle.close - minPrice) / priceRange) * 160 : 100;
      
      const isGreen = candle.close > candle.open;
      const bodyHeight = Math.abs(closeY - openY);
      const bodyY = Math.min(openY, closeY);
      
      return {
        x,
        openY,
        highY,
        lowY,
        closeY,
        bodyY,
        bodyHeight,
        candleWidth,
        isGreen,
        candle
      };
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMinutes = (now.getTime() - date.getTime()) / (1000 * 60);
    
    if (diffMinutes < 60) {
      return `${Math.round(diffMinutes)}m ago`;
    } else if (diffMinutes < 1440) {
      return `${Math.round(diffMinutes / 60)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const visibleData = getVisibleData();
  const hasData = visibleData.length > 0;

  return (
    <div ref={containerRef} className={`relative ${className}`} style={{ height }}>
      {/* Chart Header with Status and Controls */}
      <div className="absolute top-2 left-2 right-2 z-10 flex items-center justify-between">
        {/* Connection Status */}
        <div className="flex items-center space-x-2">
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

        {/* Chart Controls */}
        <div className="flex items-center space-x-1">
          <button
            onClick={handleZoomIn}
            disabled={!hasData}
            className="p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            disabled={!hasData}
            className="p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetView}
            disabled={!hasData}
            className="p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Timeframe Selector */}
      <div className="absolute top-12 left-2 right-2 z-10 flex items-center justify-center">
        <div className="flex items-center space-x-1 bg-gray-800/80 rounded-lg p-1 backdrop-blur-sm">
          {(['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'] as TimeFrame[]).map((timeframe) => (
            <button
              key={timeframe}
              onClick={() => setSelectedTimeframe(timeframe)}
              disabled={isLoadingHistory}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                selectedTimeframe === timeframe
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-50'
              }`}
            >
              {timeframe}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Container */}
      <div className="h-full bg-gray-900 rounded-lg overflow-hidden">
        {isLoadingHistory ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-gray-400 text-sm mb-2">
                Loading {selectedTimeframe} chart data...
              </div>
              <div className="w-8 h-8 mx-auto">
                <div className="w-full h-full border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            </div>
          </div>
        ) : hasData ? (
          <div className="relative h-full">
            <svg
              ref={chartRef}
              className="w-full h-full cursor-move"
              viewBox="0 0 400 200"
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              style={{ touchAction: 'none' }}
            >
              {/* Render Candlesticks */}
              {generateCandlesticks().map((candlestick, index) => (
                <g key={`candle-${index}`}>
                  {/* High-Low Wick */}
                  <line
                    x1={candlestick.x}
                    y1={candlestick.highY}
                    x2={candlestick.x}
                    y2={candlestick.lowY}
                    stroke={candlestick.isGreen ? "#10b981" : "#ef4444"}
                    strokeWidth="1"
                  />
                  
                  {/* Candle Body */}
                  <rect
                    x={candlestick.x - candlestick.candleWidth / 2}
                    y={candlestick.bodyY}
                    width={candlestick.candleWidth}
                    height={Math.max(1, candlestick.bodyHeight)}
                    fill={candlestick.isGreen ? "#10b981" : "#ef4444"}
                    stroke={candlestick.isGreen ? "#10b981" : "#ef4444"}
                    strokeWidth="1"
                  />
                </g>
              ))}

              {/* Hover Elements */}
              {isHovering && hoverData && (
                <g>
                  {/* Crosshair */}
                  <line
                    x1={hoverData.x}
                    y1="0"
                    x2={hoverData.x}
                    y2="200"
                    stroke="#6b7280"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                    opacity="0.7"
                  />
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
                  
                  {/* Price Point */}
                  <circle
                    cx={hoverData.x}
                    cy={hoverData.y}
                    r="6"
                    fill={priceChangePercent >= 0 ? "#10b981" : "#ef4444"}
                    stroke="#ffffff"
                    strokeWidth="3"
                  />
                </g>
              )}
            </svg>

            {/* Enhanced Hover Tooltip */}
            {isHovering && hoverData && (
              <div 
                className="absolute bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm pointer-events-none z-20 min-w-[140px]"
                style={{
                  left: `${Math.min(Math.max((hoverData.x / 400) * 100, 10), 60)}%`,
                  top: hoverData.y < 100 ? '20px' : 'auto',
                  bottom: hoverData.y >= 100 ? '20px' : 'auto',
                  transform: 'translateX(-50%)'
                }}
              >
                <div className="text-gray-400 text-xs mb-1">
                  {formatTime(hoverData.time)}
                </div>
                {hoverData.ohlc ? (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-400">O:</span>
                      <span className="text-white">{formatPrice(hoverData.ohlc.open)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">H:</span>
                      <span className="text-green-400">{formatPrice(hoverData.ohlc.high)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">L:</span>
                      <span className="text-red-400">{formatPrice(hoverData.ohlc.low)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">C:</span>
                      <span className="text-white font-medium">{formatPrice(hoverData.ohlc.close)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-white font-medium">
                    {formatPrice(hoverData.price)}
                  </div>
                )}
              </div>
            )}

            {/* Chart Info Bar */}
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs text-gray-400">
              <span>
                {visibleData.length > 0 && `${selectedTimeframe} • ${visibleData.length} candles`}
              </span>
              <span className="flex items-center space-x-2">
                {connectionStatus === 'connected' && (
                  <span className="flex items-center space-x-1">
                    <div className="w-1 h-1 bg-green-500 rounded-full"></div>
                    <span>Live</span>
                  </span>
                )}
                {viewState.zoom !== 1 && <span>Zoom: {viewState.zoom.toFixed(1)}x</span>}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-gray-400 text-sm mb-2">
                {connectionStatus === 'connecting' ? 'Connecting to live data...' : 'No chart data available'}
              </div>
              <div className="w-8 h-8 mx-auto">
                <div className="w-full h-full border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 