import React, { useState, useEffect } from 'react';
import { Share2, X, TrendingUp } from 'lucide-react';

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
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4 z-[60]">
      <div className={`bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full p-6 text-center transform transition-all duration-500 ${
        showAnimation ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
      }`}>
        
        {/* Close button */}
        <div className="flex justify-end mb-2">
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Icon */}
        <div className="mb-6">
          <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center bg-gray-800 border border-gray-600">
            <TrendingUp className="w-10 h-10 text-blue-400" />
          </div>
        </div>

        {/* Main message */}
        <h2 className="text-2xl font-bold mb-3 text-blue-400">
          Trade Complete
        </h2>

        <p className="text-gray-300 text-lg mb-2">
          Share your trading results
        </p>

        {/* Trade details */}
        <div className="inline-block px-4 py-2 rounded-lg mb-4 bg-gray-800 border border-gray-600">
          <p className="text-2xl font-bold text-blue-400">
            {pnlAmount >= 0 ? '+' : ''}{formatCurrency(pnlAmount)}
          </p>
          <p className="text-gray-400 text-sm">
            {tokenSymbol} • {leverage}x {direction}
          </p>
        </div>

        {/* Call to action */}
        <p className="text-gray-300 text-base mb-6">
          Share your trade with the community
        </p>



        {/* Action buttons */}
        <div className="space-y-3">
          {/* Share button */}
          <button
            onClick={handleShareClick}
            className="w-full py-4 px-6 rounded-lg text-lg font-bold transition-colors flex items-center justify-center space-x-3 bg-blue-600 hover:bg-blue-500 text-white"
          >
            <Share2 className="w-6 h-6" />
            <span>Share My Trade</span>
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
          Share your trading experience with others
        </p>
      </div>
    </div>
  );
} 