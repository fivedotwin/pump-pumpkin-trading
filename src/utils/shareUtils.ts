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

  // Set canvas size for social media (1200x630 for optimal sharing)
  canvas.width = 1200;
  canvas.height = 630;

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, '#000000');
  gradient.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 630);

  // Add subtle blue pattern overlay
  ctx.fillStyle = 'rgba(30, 124, 250, 0.05)';
  for (let i = 0; i < 1200; i += 40) {
    for (let j = 0; j < 630; j += 40) {
      ctx.fillRect(i, j, 2, 2);
    }
  }

  // Main content area with border (always blue theme)
  ctx.strokeStyle = '#1e7cfa';
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

  // Main P&L display (center) - always blue theme
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1e7cfa';
  ctx.font = 'bold 72px Arial';
  const pnlText = `${tradeData.finalPnL >= 0 ? '+' : ''}${formatCurrency(tradeData.finalPnL)}`;
  ctx.fillText(pnlText, 600, 280);

  // Percentage
  ctx.font = 'bold 48px Arial';
  const percentText = `${tradeData.finalPnL >= 0 ? '+' : ''}${tradeData.pnlPercentage.toFixed(1)}%`;
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
  const message = tradeData.finalPnL >= 0 ? 'PROFITABLE TRADE' : 'LEARNING EXPERIENCE';
  ctx.fillText(message, 600, 440);

  // Call to action
  ctx.fillStyle = '#1e7cfa';
  ctx.font = 'bold 32px Arial';
  ctx.fillText('Start Trading at pumppumpkin.io', 600, 520);

  // Convert canvas to data URL
  return canvas.toDataURL('image/png', 0.9);
};

// Handle sharing trade results to X (Twitter) with image
export const shareTradeResults = async (tradeData: TradeShareData) => {
  try {
    const isProfit = tradeData.finalPnL >= 0;
    
    // Generate the trade image first
    const imageDataUrl = await generateTradeShareImage(tradeData);
    
    // Create clean share text for X/Twitter (no emojis, no hashtags)
    const pnlText = `${isProfit ? '+' : ''}${formatCurrency(tradeData.finalPnL)}`;
    const percentText = `${isProfit ? '+' : ''}${tradeData.pnlPercentage.toFixed(1)}%`;
    
    const shareText = isProfit 
      ? `Just scored ${pnlText} (${percentText}) trading ${tradeData.tokenSymbol} with ${tradeData.leverage}x leverage on @PumpPumpkinio!\n\n${tradeData.direction} position from ${formatPrice(tradeData.entryPrice)} to ${formatPrice(tradeData.exitPrice)}\n\nStart your trading journey: https://pumppumpkin.io`
      : `Closed my ${tradeData.tokenSymbol} trade: ${pnlText} (${percentText}) with ${tradeData.leverage}x leverage on @PumpPumpkinio\n\n${tradeData.direction} from ${formatPrice(tradeData.entryPrice)} to ${formatPrice(tradeData.exitPrice)} - Every trade is a learning experience!\n\nJoin the action: https://pumppumpkin.io`;

    // Automatically download the image
    const link = document.createElement('a');
    link.download = `pump-pumpkin-trade-${tradeData.tokenSymbol}-${Date.now()}.png`;
    link.href = imageDataUrl;
    link.click();
    
    // Open X (Twitter) share intent with clean text
    const encodedText = encodeURIComponent(shareText);
    const xShareUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
    
    // Small delay to ensure download starts first
    setTimeout(() => {
      const newWindow = window.open(xShareUrl, '_blank', 'noopener,noreferrer');
      
      if (!newWindow) {
        // Fallback if popup was blocked - copy to clipboard
        if (navigator.clipboard) {
          navigator.clipboard.writeText(shareText);
          alert('X sharing popup was blocked, but your share text has been copied to clipboard and image downloaded!');
        } else {
          prompt('X popup blocked - copy this text to share on X (image also downloaded):', shareText);
        }
      } else {
        // Success - show brief instruction
        setTimeout(() => {
          if (!newWindow.closed) {
            console.log('X opened successfully - image downloaded for manual upload');
          }
        }, 1000);
      }
    }, 500);
    
  } catch (error) {
    console.error('Error sharing to X:', error);
    
    // Fallback: copy to clipboard
    try {
      const isProfit = tradeData.finalPnL >= 0;
      const pnlText = `${isProfit ? '+' : ''}${formatCurrency(tradeData.finalPnL)}`;
      const percentText = `${isProfit ? '+' : ''}${tradeData.pnlPercentage.toFixed(1)}%`;
      
      const fallbackText = `Just traded ${tradeData.tokenSymbol}: ${pnlText} (${percentText}) with ${tradeData.leverage}x leverage! Start trading at https://pumppumpkin.io`;
      
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(fallbackText);
        alert('Sharing failed, but your trade text has been copied to clipboard!');
      } else {
        prompt('Sharing failed - copy this text manually:', fallbackText);
      }
    } catch (clipboardError) {
      console.error('Clipboard fallback failed:', clipboardError);
      alert('Sharing failed. Please share your results manually!');
    }
  }
}; 