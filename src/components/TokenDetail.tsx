import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Share, TrendingUp, TrendingDown, Users, Droplets, Clock, Coins, RefreshCw, Copy, ExternalLink } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { formatCurrency, formatNumber, formatTokenAmount, formatTimeAgo } from '../utils/formatters';
import { formatTokenName, formatTokenSymbol, formatDescription, getSmartPriceTextClass } from '../utils/textHelpers';
import { fetchTokenDetailCached, TokenDetailData, formatPrice } from '../services/birdeyeApi';
import { jupiterWebSocket } from '../services/birdeyeWebSocket';
import TradingModal from './TradingModal';
import LivePrice from './LivePrice';
import EnhancedTokenChart from './EnhancedTokenChart';
import { userProfileService } from '../services/supabaseClient';
import { hapticFeedback } from '../utils/animations';

interface TokenDetailProps {
  tokenAddress: string;
  onBack: () => void;
  onBuy: () => void;
  userSOLBalance?: number;
  userUSDBalance?: number;
  walletAddress?: string;
  onUpdateSOLBalance?: (newBalance: number) => void;
  onShowTerms: () => void;
  onNavigateToPositions?: () => void;
}





export default function TokenDetail({ tokenAddress, onBack, onBuy, userSOLBalance = 0, userUSDBalance = 0, walletAddress = '', onUpdateSOLBalance, onShowTerms, onNavigateToPositions }: TokenDetailProps) {
  const { publicKey } = useWallet();
  const [tokenData, setTokenData] = useState<TokenDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTradingModal, setShowTradingModal] = useState(false);
  const [previousPrice, setPreviousPrice] = useState<number>(0);
  
  // Share notification state
  const [shareNotification, setShareNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error';
  }>({
    show: false,
    message: '',
    type: 'success'
  });
  


  useEffect(() => {
    loadTokenData();
  }, [tokenAddress]);

  // PURE WebSocket price updates ONLY - Maximum speed, no fallbacks
  useEffect(() => {
    if (!tokenData) return;

    console.log(`🚀 PURE WEBSOCKET: Starting continuous real-time price feed for ${tokenData.symbol}`);
    console.log(`⚡ PUSH ONLY: No REST API fallbacks - WebSocket push updates only`);
    
          // Subscribe to WebSocket price updates with maximum frequency
      const unsubscribePrice = jupiterWebSocket.subscribeToToken(
        tokenAddress,
        (address: string, newPrice: number) => {
          // Immediate price update - no delays, no throttling
          const timestamp = Date.now();
          console.log(`⚡ INSTANT: ${tokenData.symbol} price: $${newPrice.toFixed(8)} at ${timestamp}`);
          
          // Store previous price for smooth visual transitions
          setTokenData(prev => {
            if (prev) {
              setPreviousPrice(prev.price);
              return {
                ...prev,
                price: newPrice
              };
            }
            return prev;
          });
        }
      );

          // Also subscribe to OHLCV updates for even more granular data
      const unsubscribeChart = jupiterWebSocket.subscribeToChart(
        tokenAddress,
        (address: string, ohlcv: any) => {
          // Use the latest close price from OHLCV for maximum accuracy
          const latestPrice = ohlcv.close || ohlcv.c;
          if (latestPrice && latestPrice !== tokenData.price) {
            const timestamp = Date.now();
            console.log(`📊 OHLCV price update: ${tokenData.symbol} = $${latestPrice.toFixed(8)} at ${timestamp}`);
            
            setTokenData(prev => {
              if (prev) {
                setPreviousPrice(prev.price);
                return {
                  ...prev,
                  price: latestPrice
                };
              }
              return prev;
            });
          }
        }
      );

    // Log subscription status
    console.log(`✅ SUBSCRIBED: ${tokenData.symbol} to WebSocket price + OHLCV feeds`);

    return () => {
      console.log(`🔌 UNSUBSCRIBING: ${tokenData.symbol} from all WebSocket feeds`);
      unsubscribePrice();
      unsubscribeChart();
    };
  }, [tokenAddress, tokenData?.symbol]);





  const loadTokenData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log(`🔍 Loading token data for: ${tokenAddress}`);
      const data = await fetchTokenDetailCached(tokenAddress);
      
      if (data) {
        setTokenData(data);
        console.log('Token data loaded successfully:', data.symbol);
      } else {
        setError('Token not found or invalid contract address');
                  console.error('Failed to load token data');
      }
    } catch (error) {
              console.error('Error loading token data:', error);
      setError('Failed to load token data. Please check the contract address.');
    } finally {
      setIsLoading(false);
    }
  };



  const showShareNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setShareNotification({ show: true, message, type });
    setTimeout(() => {
      setShareNotification({ show: false, message: '', type: 'success' });
    }, 3000);
  };

  const handleShare = async () => {
    if (!tokenData) return;

    try {
      const shareData = {
        title: `${tokenData.name} (${tokenData.symbol})`,
        text: `Check out ${tokenData.name} trading on Pump Pumpkin - Live at ${formatPrice(tokenData.price)}`,
        url: window.location.href,
      };

      // Method 1: Try native Web Share API (mobile browsers, PWAs)
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData);
          hapticFeedback.success();
          showShareNotification('Shared successfully!');
          return;
        } catch (shareError: any) {
          // User cancelled share dialog - don't show error
          if (shareError.name === 'AbortError') {
            return;
          }
          console.log('Native share failed, trying clipboard...');
        }
      }

      // Method 2: Try modern clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          const shareText = `${shareData.title}\n${shareData.text}\n${shareData.url}`;
          await navigator.clipboard.writeText(shareText);
          hapticFeedback.success();
          showShareNotification('Link copied to clipboard!');
          return;
        } catch (clipboardError) {
          console.log('Clipboard API failed, trying fallback...');
        }
      }

      // Method 3: Fallback for older browsers
      const textArea = document.createElement('textarea');
      const shareText = `${shareData.title}\n${shareData.text}\n${shareData.url}`;
      textArea.value = shareText;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
          hapticFeedback.success();
          showShareNotification('Link copied to clipboard!');
    } else {
          throw new Error('execCommand failed');
        }
      } catch (fallbackError) {
        document.body.removeChild(textArea);
        throw new Error('All copy methods failed');
      }

    } catch (error) {
      console.error('Share failed:', error);
      hapticFeedback.error();
      showShareNotification('Share failed. Try again later.', 'error');
    }
  };

  const handleOpenTradingModal = async () => {
    // ADDED: Refresh SOL balance before opening trading modal to prevent stale balance issues
    if (walletAddress && onUpdateSOLBalance) {
      try {
        console.log('🔄 Refreshing SOL balance before opening trading modal...');
        const profile = await userProfileService.getProfile(walletAddress);
        if (profile) {
          console.log('Pre-trade SOL balance refresh:', {
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



  const formatPriceChange = (price: number, changePercent: number) => {
    const changeAmount = Math.abs(price * changePercent / 100);
    const sign = changePercent >= 0 ? '+' : '';
    
    return {
      amount: `${sign}${formatPrice(changeAmount).replace('$', '$')}`,
      percent: `${sign}${changePercent.toFixed(1)}%`
    };
  };





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
      {/* Share Notification */}
      {shareNotification.show && (
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-300 ${
          shareNotification.type === 'success' 
            ? 'bg-green-900 border-green-700 text-green-300' 
            : 'bg-red-900 border-red-700 text-red-300'
        }`}>
          {shareNotification.message}
        </div>
      )}

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

        {/* Price - Smart responsive sizing */}
        <div className="flex flex-col items-center space-y-2 mb-4 px-4">
          <div className="flex items-center space-x-2">
            <LivePrice 
              price={tokenData.price}
              previousPrice={previousPrice}
              className={`font-bold text-white break-all text-center ${
                getSmartPriceTextClass(formatPrice(tokenData.price))
              }`}
              showChange={true}
            />
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
            Past day
          </span>
        </div>

        {/* Enhanced Real-Time Chart with WebSocket and Zoom/Pan */}
        <div className="mb-6">
          <EnhancedTokenChart
            tokenAddress={tokenAddress}
            tokenSymbol={tokenData.symbol}
            priceChangePercent={tokenData.priceChange24h}
            height={300}
            onPriceUpdate={undefined} // Price updates handled by parent component WebSocket subscription
          />

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

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <ExternalLink className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-300 text-sm">Contract Address</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-white font-medium text-sm break-all font-mono" title={tokenAddress}>
                    {tokenAddress.slice(0, 6)}...{tokenAddress.slice(-6)}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(tokenAddress);
                      showShareNotification('Contract address copied!');
                    }}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                    title="Copy contract address"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
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
          onNavigateToPositions={onNavigateToPositions}
        />
      )}
    </div>
  );
}