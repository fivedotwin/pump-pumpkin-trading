import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Move, RotateCcw, TrendingUp, TrendingDown } from 'lucide-react';
import { formatPrice } from '../services/birdeyeApi';
import { jupiterWebSocket, BirdeyeOHLCV } from '../services/birdeyeWebSocket';

interface ChartDataPoint {
  time: number;
  price: number;
  volume?: number;
}

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
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'fallback' | 'disconnected'>('connecting');
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
  } | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; startIndex: number } | null>(null);
  
  const chartRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Subscribe to real-time WebSocket price updates
  useEffect(() => {
    console.log(`🚀 Enhanced Chart: Subscribing to WebSocket for ${tokenSymbol}`);
    
    // Subscribe to real-time chart data
    const unsubscribeChart = jupiterWebSocket.subscribeToChart(
      tokenAddress,
      (address: string, ohlcv: BirdeyeOHLCV) => {
        const newDataPoint: ChartDataPoint = {
          time: ohlcv.timestamp,
          price: ohlcv.close,
          volume: ohlcv.volume
        };

        setChartData(prev => {
          const updated = [...prev, newDataPoint];
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
        // Update the latest data point if it's very recent
        setChartData(prev => {
          if (prev.length === 0) return prev;
          
          const now = Math.floor(Date.now() / 1000);
          const latest = prev[prev.length - 1];
          
          // If the latest point is within 30 seconds, update its price
          if (now - latest.time < 30) {
            const updated = [...prev];
            updated[updated.length - 1] = { ...latest, price };
            return updated;
          }
          
          // Otherwise, add a new point
          const newPoint: ChartDataPoint = {
            time: now,
            price,
            volume: latest.volume || 0
          };
          
          const updated = [...prev, newPoint];
          return updated.slice(-1000);
        });

        if (onPriceUpdate) {
          onPriceUpdate(price);
        }
      }
    );

    // Monitor connection status
    const statusInterval = setInterval(() => {
      // You'd get this from the WebSocket service
      setConnectionStatus('connected'); // Simplified for now
    }, 5000);

    return () => {
      console.log(`🔌 Enhanced Chart: Unsubscribing from WebSocket for ${tokenSymbol}`);
      unsubscribeChart();
      unsubscribePrice();
      clearInterval(statusInterval);
    };
  }, [tokenAddress, tokenSymbol, onPriceUpdate]);

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
      const prices = visibleData.map(d => d.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice;
      
      const y = priceRange > 0 
        ? height - 40 - ((dataPoint.price - minPrice) / priceRange) * (height - 80)
        : height / 2;
      
      setHoverData({
        price: dataPoint.price,
        time: dataPoint.time,
        x: (clampedIndex / (visibleData.length - 1)) * 400,
        y: (y / height) * 200 // Normalize to SVG coordinates
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

  // Generate SVG path for chart line
  const generateChartPath = () => {
    const visibleData = getVisibleData();
    if (visibleData.length === 0) return '';
    
    const prices = visibleData.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    
    return visibleData.map((point, index) => {
      const x = (index / (visibleData.length - 1)) * 400;
      const y = priceRange > 0 
        ? 200 - ((point.price - minPrice) / priceRange) * 160
        : 100;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  const generateAreaPath = () => {
    const visibleData = getVisibleData();
    if (visibleData.length === 0) return '';
    
    const prices = visibleData.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    
    const linePath = visibleData.map((point, index) => {
      const x = (index / (visibleData.length - 1)) * 400;
      const y = priceRange > 0 
        ? 200 - ((point.price - minPrice) / priceRange) * 160
        : 100;
      return `${x},${y}`;
    }).join(' ');
    
    return `0,200 ${linePath} 400,200`;
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

      {/* Chart Container */}
      <div className="h-full bg-gray-900 rounded-lg overflow-hidden">
        {hasData ? (
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
              <defs>
                <linearGradient id={`chartGradient-${tokenAddress}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={priceChangePercent >= 0 ? "#10b981" : "#ef4444"} stopOpacity="0.3"/>
                  <stop offset="100%" stopColor={priceChangePercent >= 0 ? "#10b981" : "#ef4444"} stopOpacity="0"/>
                </linearGradient>
              </defs>
              
              {/* Chart Area Fill */}
              <polygon
                fill={`url(#chartGradient-${tokenAddress})`}
                points={generateAreaPath()}
              />
              
              {/* Chart Line */}
              <path
                d={generateChartPath()}
                fill="none"
                stroke={priceChangePercent >= 0 ? "#10b981" : "#ef4444"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

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

            {/* Hover Tooltip */}
            {isHovering && hoverData && (
              <div 
                className="absolute bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm pointer-events-none z-20"
                style={{
                  left: `${Math.min(Math.max((hoverData.x / 400) * 100, 10), 70)}%`,
                  top: hoverData.y < 100 ? '20px' : 'auto',
                  bottom: hoverData.y >= 100 ? '20px' : 'auto',
                  transform: 'translateX(-50%)'
                }}
              >
                <div className="text-white font-medium">
                  {formatPrice(hoverData.price)}
                </div>
                <div className="text-gray-400 text-xs">
                  {formatTime(hoverData.time)}
                </div>
              </div>
            )}

            {/* Chart Info Bar */}
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs text-gray-400">
              <span>
                {visibleData.length > 0 && `Showing ${visibleData.length} points`}
              </span>
              <span>
                {viewState.zoom !== 1 && `Zoom: ${viewState.zoom.toFixed(1)}x`}
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