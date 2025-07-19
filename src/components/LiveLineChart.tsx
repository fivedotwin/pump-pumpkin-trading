import React, { useState, useEffect, useRef, useCallback } from 'react';
import businessPlanPriceService from '../services/businessPlanPriceService';

interface PricePoint {
  time: number;
  price: number;
}

interface LiveLineChartProps {
  tokenAddress: string;
  tokenSymbol: string;
  className?: string;
  height?: number;
  onPriceUpdate?: (price: number) => void;
}

export default function LiveLineChart({ 
  tokenAddress, 
  tokenSymbol, 
  className = '',
  height = 300,
  onPriceUpdate 
}: LiveLineChartProps) {
  const [priceData, setPriceData] = useState<PricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<number>(0);
  const chartRef = useRef<SVGSVGElement>(null);

  // Subscribe to 20Hz price updates
  useEffect(() => {
    if (!tokenAddress) return;

    console.log(`📈 LIVE CHART: Starting 20Hz updates for ${tokenSymbol}`);
    
    const unsubscribe = businessPlanPriceService.subscribeToPrice(tokenAddress, (newPrice: number) => {
      if (!newPrice || newPrice <= 0) return;
      
      const now = Date.now();
      
      setPriceData(prev => {
        const newPoint: PricePoint = { time: now, price: newPrice };
        
        // Keep last 100 points for smooth visualization (about 5 seconds at 20Hz)
        const updated = [...prev, newPoint];
        const maxPoints = 100;
        
        if (updated.length > maxPoints) {
          return updated.slice(-maxPoints);
        }
        return updated;
      });
      
      // Calculate price change from first data point
      setPriceData(prev => {
        if (prev.length > 1) {
          const change = ((newPrice - prev[0].price) / prev[0].price) * 100;
          setPriceChange(change);
        }
        return prev;
      });
      
      setCurrentPrice(newPrice);
      
      // Notify parent component
      if (onPriceUpdate) {
        onPriceUpdate(newPrice);
      }
    });

    return () => {
      console.log(`📈 LIVE CHART: Unsubscribing from 20Hz updates for ${tokenSymbol}`);
      unsubscribe();
    };
  }, [tokenAddress, tokenSymbol, onPriceUpdate]);

  // Generate SVG path for the line chart
  const generatePath = useCallback(() => {
    if (priceData.length < 2) return '';
    
    const padding = 20;
    const chartWidth = 400 - (padding * 2);
    const chartHeight = 200 - (padding * 2);
    
    const prices = priceData.map(point => point.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1; // Avoid division by zero
    
    const points = priceData.map((point, index) => {
      const x = padding + (index / (priceData.length - 1)) * chartWidth;
      const y = padding + ((maxPrice - point.price) / priceRange) * chartHeight;
      return `${x},${y}`;
    });
    
    return `M ${points.join(' L ')}`;
  }, [priceData]);

  // Get chart color based on price change
  const getChartColor = useCallback(() => {
    if (priceChange > 0) return '#10b981'; // Green for positive
    if (priceChange < 0) return '#ef4444'; // Red for negative
    return '#6b7280'; // Gray for neutral
  }, [priceChange]);

  // Format price for display
  const formatPrice = (price: number): string => {
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(8)}`;
  };

  return (
    <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
      {/* Chart Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-white font-medium">Live Price Chart</h3>
          <p className="text-gray-400 text-sm">Real-time 20Hz updates</p>
        </div>
        <div className="text-right">
          <div className="text-white font-bold text-lg">
            {formatPrice(currentPrice)}
          </div>
          <div className={`text-sm font-medium ${
            priceChange >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative">
        <svg
          ref={chartRef}
          className="w-full transition-all duration-100 ease-out"
          style={{ height: `${height}px` }}
          viewBox="0 0 400 200"
        >
          {/* Background Grid */}
          <defs>
            <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 20" fill="none" stroke="#374151" strokeWidth="0.5" opacity="0.3"/>
            </pattern>
          </defs>
          <rect width="400" height="200" fill="url(#grid)" />
          
          {/* Price Line */}
          {priceData.length > 1 && (
            <path
              d={generatePath()}
              fill="none"
              stroke={getChartColor()}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transition: 'stroke 0.1s ease-out',
                filter: 'drop-shadow(0 0 4px currentColor)',
              }}
            />
          )}
          
          {/* Current Price Dot */}
          {priceData.length > 0 && (
            <circle
              cx={380} // Right side of chart
              cy={priceData.length > 1 ? (() => {
                const prices = priceData.map(p => p.price);
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                const priceRange = maxPrice - minPrice || 1;
                return 20 + ((maxPrice - currentPrice) / priceRange) * 160;
              })() : 100}
              r="4"
              fill={getChartColor()}
              style={{
                transition: 'cy 0.1s ease-out',
                filter: 'drop-shadow(0 0 6px currentColor)',
              }}
            >
              <animate
                attributeName="r"
                values="4;6;4"
                dur="2s"
                repeatCount="indefinite"
              />
            </circle>
          )}
        </svg>
        
        {/* Loading State */}
        {priceData.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-gray-400 text-sm">
              Connecting to live price feed...
            </div>
          </div>
        )}
      </div>
      
      {/* Stats */}
      <div className="flex justify-between items-center mt-4 text-xs text-gray-400">
        <span>Data Points: {priceData.length}</span>
        <span>Update Rate: 20Hz</span>
        <span>Range: ~5 seconds</span>
      </div>
    </div>
  );
} 