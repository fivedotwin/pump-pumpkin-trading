import React, { useState, useEffect } from 'react';
import { X, Clock, Copy, CheckCircle } from 'lucide-react';

interface GuestDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEPOSIT_WALLET_ADDRESS = "DepositWallet1111111111111111111111111111111111"; // Demo deposit wallet address
const TIMER_DURATION = 30 * 60; // 30 minutes in seconds

export default function GuestDepositModal({ isOpen, onClose }: GuestDepositModalProps) {
  const [selectedAmount, setSelectedAmount] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(TIMER_DURATION);
  const [isActive, setIsActive] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

  useEffect(() => {
    if (isOpen && !isActive) {
      setTimeRemaining(TIMER_DURATION);
      setIsActive(true);
    }
  }, [isOpen, isActive]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isActive && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(time => time - 1);
      }, 1000);
    } else if (timeRemaining === 0) {
      setIsActive(false);
      alert('Deposit window expired. Please try again.');
      onClose();
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, timeRemaining, onClose]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(DEPOSIT_WALLET_ADDRESS);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  const handleAmountSelect = (amount: string) => {
    setSelectedAmount(amount);
  };

  const handleConfirm = () => {
    if (!selectedAmount) {
      alert('Please select an amount to deposit');
      return;
    }
    
    alert(`Please send exactly ${selectedAmount} SOL to the address below within ${formatTime(timeRemaining)}. Your deposit will be credited automatically once confirmed.`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Guest Deposit</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Timer */}
        <div className="bg-blue-600 bg-opacity-20 border border-blue-600 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-blue-400 font-medium">Time Remaining:</span>
            <span className="text-white font-bold text-lg">{formatTime(timeRemaining)}</span>
          </div>
          <p className="text-blue-300 text-sm mt-1">Complete your deposit within this time</p>
        </div>

        {/* Amount Selection */}
        <div className="mb-6">
          <label className="block text-white font-medium mb-3">Select Deposit Amount:</label>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {['0.1', '0.5', '1.0', '2.0'].map((amount) => (
              <button
                key={amount}
                onClick={() => handleAmountSelect(amount)}
                className={`py-3 px-4 rounded-lg font-medium transition-colors ${
                  selectedAmount === amount
                    ? 'bg-blue-600 text-white border border-blue-500'
                    : 'bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700'
                }`}
              >
                {amount} SOL
              </button>
            ))}
          </div>
          
          {/* Custom Amount */}
          <div>
            <label className="block text-gray-400 text-sm mb-2">Or enter custom amount:</label>
            <input
              type="number"
              step="0.01"
              min="0.04"
              placeholder="0.04"
              value={selectedAmount}
              onChange={(e) => setSelectedAmount(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            <p className="text-gray-500 text-xs mt-1">Minimum: 0.04 SOL</p>
          </div>
        </div>

        {/* Deposit Address */}
        <div className="mb-6">
          <label className="block text-white font-medium mb-3">Send SOL to this address:</label>
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-300 text-sm font-mono break-all mr-2">
                {DEPOSIT_WALLET_ADDRESS}
              </span>
              <button
                onClick={handleCopyAddress}
                className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg transition-colors text-sm"
              >
                {addressCopied ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-yellow-600 bg-opacity-20 border border-yellow-600 rounded-lg p-4 mb-6">
          <h3 className="text-yellow-400 font-medium mb-2">Important Instructions:</h3>
          <ul className="text-yellow-300 text-sm space-y-1">
            <li>• Send exactly {selectedAmount || '0.04'} SOL to the address above</li>
            <li>• Complete the transaction within {formatTime(timeRemaining)}</li>
            <li>• Your deposit will be credited automatically</li>
            <li>• Do not send from an exchange wallet</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-6 bg-gray-700 text-gray-300 font-medium rounded-lg hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedAmount || parseFloat(selectedAmount) < 0.04}
            className="flex-1 py-3 px-6 bg-blue-600 text-black font-medium rounded-lg hover:bg-blue-500 transition-colors disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed"
            style={{ 
              backgroundColor: (!selectedAmount || parseFloat(selectedAmount) < 0.04) ? '#4b5563' : '#1e7cfa',
              color: (!selectedAmount || parseFloat(selectedAmount) < 0.04) ? '#9ca3af' : 'black'
            }}
          >
            Confirm Deposit
          </button>
        </div>
      </div>
    </div>
  );
} 