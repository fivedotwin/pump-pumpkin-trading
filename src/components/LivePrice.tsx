import React, { useState, useEffect } from 'react';

interface LivePriceProps {
  price: number | string;
  previousPrice?: number;
  symbol?: string;
  className?: string;
  showChange?: boolean;
}

export default function LivePrice({ 
  price, 
  previousPrice, 
  symbol = '', 
  className = '', 
  showChange = false 
}: LivePriceProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'same'>('same');

  const numericPrice = typeof price === 'string' ? parseFloat(price.replace('$', '')) : price;
  const numericPrevious = previousPrice || numericPrice;

  useEffect(() => {
    if (previousPrice && numericPrice !== numericPrevious) {
      setIsUpdating(true);
      setPriceDirection(numericPrice > numericPrevious ? 'up' : 'down');
      
      const timer = setTimeout(() => {
        setIsUpdating(false);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [price, previousPrice, numericPrice, numericPrevious]);

  const formatPrice = (value: number): string => {
    if (value === 0) return '$0.00';
    
    // FULL PRECISION: Match the main formatPrice function for consistency
    if (value >= 1000) {
      return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
    } else if (value >= 1) {
      // Medium prices: Show up to 15 decimal places (removes trailing zeros)
      return `$${value.toFixed(15)}`.replace(/\.?0+$/, '');
    } else if (value > 0) {
      // Small prices: Show full precision up to 18 decimal places
      let fullPrecision = value.toFixed(18);
      
      // Remove trailing zeros but keep at least 2 decimal places
      fullPrecision = fullPrecision.replace(/\.?0+$/, '');
      
      // Ensure we have at least 2 decimal places for readability
      if (!fullPrecision.includes('.')) {
        fullPrecision += '.00';
      } else if (fullPrecision.split('.')[1].length < 2) {
        const decimalPart = fullPrecision.split('.')[1];
        fullPrecision = fullPrecision.split('.')[0] + '.' + decimalPart.padEnd(2, '0');
      }
      
      return `$${fullPrecision}`;
    } else {
      return '$0.00';
    }
  };

  const getUpdateClasses = (): string => {
    if (!isUpdating) return '';
    
    switch (priceDirection) {
      case 'up':
        return 'animate-pulse bg-green-500/20 text-green-400';
      case 'down':
        return 'animate-pulse bg-red-500/20 text-red-400';
      default:
        return 'animate-pulse bg-blue-500/20 text-blue-400';
    }
  };

  return (
    <span 
      className={`
        ${className}
        ${getUpdateClasses()}
        transition-all duration-300 ease-in-out
        rounded px-1
      `}
    >
      {typeof price === 'string' ? price : formatPrice(numericPrice)}
      {symbol && ` ${symbol}`}
    </span>
  );
} 