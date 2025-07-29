import React, { useState, useEffect } from 'react';
import { Share2, X, TrendingUp, Sparkles, Users, Trophy } from 'lucide-react';

interface ShareGainsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onShare: () => void;
  isProfit: boolean;
  pnlAmount: number;
  tokenSymbol: string;
  leverage: number;
  direction: 'Long' | 'Short';
}

export default function ShareGainsPopup({ 
  isOpen, 
  onClose, 
  onShare, 
  isProfit, 
  pnlAmount, 
  tokenSymbol, 
  leverage, 
  direction 
}: ShareGainsPopupProps) {
  const [showAnimation, setShowAnimation] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShowAnimation(true);
    } else {
      setShowAnimation(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const handleShareClick = () => {
    onShare();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4 z-50">
      <div className={`bg-gradient-to-br from-gray-900 to-black border-2 rounded-2xl max-w-md w-full p-6 text-center transform transition-all duration-500 ${
        showAnimation ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
      } ${isProfit ? 'border-green-500/50' : 'border-blue-500/50'}`}>
        
        {/* Close button */}
        <div className="flex justify-end mb-2">
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Animated icon */}
        <div className="mb-6 relative">
          <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center relative ${
            isProfit ? 'bg-green-600/20 border-2 border-green-500/50' : 'bg-blue-600/20 border-2 border-blue-500/50'
          }`}>
            {isProfit ? (
              <Trophy className="w-10 h-10 text-green-400 animate-bounce" />
            ) : (
              <TrendingUp className="w-10 h-10 text-blue-400" />
            )}
            
            {/* Sparkle effects for profits */}
            {isProfit && (
              <>
                <Sparkles className="w-4 h-4 text-yellow-400 absolute -top-2 -right-2 animate-pulse" />
                <Sparkles className="w-3 h-3 text-yellow-400 absolute -bottom-1 -left-1 animate-pulse delay-300" />
              </>
            )}
          </div>
        </div>

        {/* Main message */}
        <h2 className={`text-2xl font-bold mb-3 ${isProfit ? 'text-green-400' : 'text-blue-400'}`}>
          {isProfit ? '🚀 SICK GAINS!' : '📈 Nice Trade!'}
        </h2>

        <p className="text-gray-300 text-lg mb-2">
          {isProfit ? 'You just scored' : 'You just completed'}
        </p>

        {/* Trade details */}
        <div className={`inline-block px-4 py-2 rounded-xl mb-4 ${
          isProfit ? 'bg-green-900/30 border border-green-700/50' : 'bg-blue-900/30 border border-blue-700/50'
        }`}>
          <p className={`text-2xl font-bold ${isProfit ? 'text-green-400' : 'text-blue-400'}`}>
            {isProfit ? '+' : ''}{formatCurrency(pnlAmount)}
          </p>
          <p className="text-gray-400 text-sm">
            {tokenSymbol} • {leverage}x {direction}
          </p>
        </div>

        {/* Call to action */}
        <p className="text-gray-300 text-base mb-6">
          {isProfit 
            ? "Time to flex those gains! Show the world your winning trade 💪" 
            : "Share your trading journey and inspire others! 🌟"
          }
        </p>

        {/* Share benefits */}
        <div className="bg-gray-800/50 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-center space-x-6 text-sm text-gray-400">
            <div className="flex items-center space-x-1">
              <Users className="w-4 h-4" />
              <span>Build rep</span>
            </div>
            <div className="flex items-center space-x-1">
              <TrendingUp className="w-4 h-4" />
              <span>Inspire others</span>
            </div>
            <div className="flex items-center space-x-1">
              <Trophy className="w-4 h-4" />
              <span>Show skills</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          {/* Share button */}
          <button
            onClick={handleShareClick}
            className={`w-full py-4 px-6 rounded-xl text-lg font-bold transition-all duration-200 flex items-center justify-center space-x-3 transform hover:scale-105 ${
              isProfit 
                ? 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white shadow-lg shadow-green-500/25' 
                : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-500/25'
            }`}
          >
            <Share2 className="w-6 h-6" />
            <span>{isProfit ? 'Share My Gains! 🔥' : 'Share My Trade! 📊'}</span>
          </button>

          {/* Skip button */}
          <button
            onClick={onClose}
            className="w-full py-3 px-6 rounded-xl text-gray-400 hover:text-white transition-colors border border-gray-600 hover:border-gray-500 bg-transparent"
          >
            Maybe Later
          </button>
        </div>

        {/* Small encouragement text */}
        <p className="text-gray-500 text-xs mt-4">
          {isProfit 
            ? "Every winning trade deserves to be celebrated! 🎉" 
            : "Every trade is a learning experience worth sharing! 📚"
          }
        </p>
      </div>
    </div>
  );
} 