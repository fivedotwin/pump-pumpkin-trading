// Shared utility for generating and sharing trade result images

export interface TradeShareData {
  tokenSymbol: string;
  direction: 'Long' | 'Short';
  leverage: number;
  entryPrice: number;
  exitPrice: number;
  positionSize: number;
  collateralAmount: number;
  finalPnL: number;
  pnlPercentage: number;
  totalReturn: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

const formatPrice = (price: number) => {
  if (price === 0) return '$0.00';
  
  // Show exactly 4 significant digits for trade results
  if (price >= 1000) {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else if (price >= 1) {
    return `$${price.toPrecision(4)}`;
  } else if (price > 0) {
    const precision4 = price.toPrecision(4);
    const asNumber = parseFloat(precision4);
    
    if (asNumber >= 0.0001) {
      return `$${asNumber}`;
    } else {
      const magnitude = Math.floor(Math.log10(asNumber));
      const decimalPlaces = Math.abs(magnitude) + 3;
      return `$${asNumber.toFixed(decimalPlaces)}`;
    }
  } else {
    return '$0.00';
  }
};

// Generate shareable image with trade results
export const generateTradeShareImage = async (tradeData: TradeShareData): Promise<string> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  const isProfit = tradeData.finalPnL >= 0;

  // Set canvas size for social media (1200x630 for optimal sharing)
  canvas.width = 1200;
  canvas.height = 630;

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, '#000000');
  gradient.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 630);

  // Add subtle pattern overlay
  ctx.fillStyle = 'rgba(30, 124, 250, 0.05)';
  for (let i = 0; i < 1200; i += 40) {
    for (let j = 0; j < 630; j += 40) {
      ctx.fillRect(i, j, 2, 2);
    }
  }

  // Main content area with border
  ctx.strokeStyle = isProfit ? '#10b981' : '#ef4444';
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, 1120, 550);

  // Logo area (top left)
  ctx.fillStyle = '#1e7cfa';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('PUMP PUMPKIN', 80, 120);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = '24px Arial';
  ctx.fillText('Leveraged Trading Platform', 80, 150);

  // Main P&L display (center)
  ctx.textAlign = 'center';
  ctx.fillStyle = isProfit ? '#10b981' : '#ef4444';
  ctx.font = 'bold 72px Arial';
  const pnlText = `${isProfit ? '+' : ''}${formatCurrency(tradeData.finalPnL)}`;
  ctx.fillText(pnlText, 600, 280);

  // Percentage
  ctx.font = 'bold 48px Arial';
  const percentText = `${isProfit ? '+' : ''}${tradeData.pnlPercentage.toFixed(1)}%`;
  ctx.fillText(percentText, 600, 340);

  // Trade details
  ctx.fillStyle = '#ffffff';
  ctx.font = '32px Arial';
  ctx.textAlign = 'left';
  
  ctx.fillText(`${tradeData.tokenSymbol} • ${tradeData.leverage}x ${tradeData.direction}`, 80, 420);
  ctx.fillText(`Entry: ${formatPrice(tradeData.entryPrice)}`, 80, 460);
  ctx.fillText(`Exit: ${formatPrice(tradeData.exitPrice)}`, 80, 500);

  // Success message
  ctx.fillStyle = '#9ca3af';
  ctx.font = '28px Arial';
  ctx.textAlign = 'center';
  const message = isProfit ? 'SICK GAINS!' : 'NEXT TIME!';
  ctx.fillText(message, 600, 440);

  // Call to action
  ctx.fillStyle = '#1e7cfa';
  ctx.font = 'bold 32px Arial';
  ctx.fillText('Start Trading at pump-pumpkin.com', 600, 520);

  // Convert canvas to data URL
  return canvas.toDataURL('image/png', 0.9);
};

// Handle sharing trade results
export const shareTradeResults = async (tradeData: TradeShareData) => {
  try {
    const imageDataUrl = await generateTradeShareImage(tradeData);
    const isProfit = tradeData.finalPnL >= 0;
    
    // Convert data URL to blob
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    
    const shareText = isProfit 
      ? `Just scored massive gains trading ${tradeData.tokenSymbol}! Check out my sick gains\n\nStart your own trading journey:`
      : `Took a hit on ${tradeData.tokenSymbol} but learning every day!\n\nJoin the action:`;
    
    const shareUrl = 'https://pump-pumpkin.com';

    if (navigator.share && navigator.canShare) {
      // Use native sharing if available
      const file = new File([blob], 'trade-results.png', { type: 'image/png' });
      
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Pump Pumpkin Trading Results',
          text: shareText,
          url: shareUrl,
          files: [file]
        });
      } else {
        // Fallback to text sharing
        await navigator.share({
          title: 'Pump Pumpkin Trading Results',
          text: `${shareText}\n${shareUrl}`
        });
      }
    } else {
      // Fallback: Copy to clipboard and download image
      const shareContent = `${shareText}\n${shareUrl}`;
      
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareContent);
      }
      
      // Trigger image download
      const link = document.createElement('a');
      link.download = 'pump-pumpkin-trade-results.png';
      link.href = imageDataUrl;
      link.click();
      
      alert('Share text copied to clipboard and image downloaded!');
    }
  } catch (error) {
    console.error('Error sharing:', error);
    alert('Sharing failed, but your results look amazing!');
  }
}; 