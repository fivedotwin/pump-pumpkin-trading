import React, { useState, useEffect } from 'react';
import { Settings, Copy, TrendingUp, TrendingDown, Home, Briefcase, ArrowUpDown, X, Loader2, CheckCircle, User, Sliders, Bell, LogOut, Plus, Minus, Circle } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { fetchTrendingTokens, fetchSOLPrice, formatPrice, formatVolume, formatMarketCap, TrendingToken } from '../services/birdeyeApi';
import { jupiterSwapService, SwapQuote, SwapDirection } from '../services/jupiterApi';
import { formatNumber, formatCurrency, formatTokenAmount } from '../utils/formatters';
import { userProfileService, WithdrawalRequest } from '../services/supabaseClient';
import TokenDetail from './TokenDetail';
import EditProfile from './EditProfile';
import TradingSettings from './TradingSettings';
import NotificationSettings from './NotificationSettings';

interface DashboardProps {
  username: string;
  profilePicture?: string;
  walletAddress: string;
  balance: number;
  solBalance: number;
  onUpdateBalance: (newBalance: number) => void;
  onUpdateSOLBalance: (newSOLBalance: number) => void;
  onUpdateBothBalances: (newBalance: number, newSOLBalance: number) => void;
}

type TabType = 'home' | 'rewards' | 'positions';
type SwapMode = 'buy' | 'sell';
type ViewState = 'dashboard' | 'token-detail' | 'edit-profile' | 'trading-settings' | 'notifications';

interface SwapSuccessData {
  txid: string;
  inputAmount: number;
  outputAmount: number;
  inputToken: string;
  outputToken: string;
  feeAmount: number;
}

// Platform wallet address for receiving deposits
const PLATFORM_WALLET = 'CTDZ5teoWajqVcAsWQyEmmvHQzaDiV1jrnvwRmcL1iWv';

export default function Dashboard({ username, profilePicture, walletAddress, balance, solBalance, onUpdateBalance, onUpdateSOLBalance, onUpdateBothBalances }: DashboardProps) {
  const { publicKey, signTransaction, disconnect } = useWallet();
  const [caInput, setCaInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [swapSuccessData, setSwapSuccessData] = useState<SwapSuccessData | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [payAmount, setPayAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [trendingTokens, setTrendingTokens] = useState<TrendingToken[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);
  
  // Deposit transaction states
  const [isDepositing, setIsDepositing] = useState(false);
  const [isVerifyingTransaction, setIsVerifyingTransaction] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  
  // Withdrawal transaction states
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);
  
  // Local SOL balance state for immediate UI updates
  const [currentSOLBalance, setCurrentSOLBalance] = useState(solBalance);
  
  // New state for different views
  const [viewState, setViewState] = useState<ViewState>('dashboard');
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string>('');
  
  // Profile state for updates
  const [currentUsername, setCurrentUsername] = useState(username);
  const [currentProfilePicture, setCurrentProfilePicture] = useState(profilePicture);
  
  // Update local SOL balance when prop changes (tracks deposited amount)
  useEffect(() => {
    setCurrentSOLBalance(solBalance);
    console.log(`📊 Platform SOL balance loaded from database: ${solBalance.toFixed(4)} SOL`);
  }, [solBalance]);
  
  // Jupiter swap states
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  const [isGettingQuote, setIsGettingQuote] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [ppaPrice, setPpaPrice] = useState<number | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapMode, setSwapMode] = useState<SwapMode>('buy');
  const [userBalances, setUserBalances] = useState({ sol: 0, ppa: 0 });
  const [exchangeRate, setExchangeRate] = useState<string | null>(null);
  
  // SOL price state for portfolio calculations
  const [solPrice, setSolPrice] = useState<number>(98.45); // Default fallback price
  
  // Mock data for PnL (in production, this would come from database) - SET TO 0 BY DEFAULT
  const pnl = 0; // Always 0 by default
  const pnlPercentage = 0; // Always 0 by default
  const isPositivePnl = pnl >= 0;

  // Load trending tokens on component mount
  useEffect(() => {
    loadTrendingTokens();
    loadPPAPrice();
    loadSOLPrice();
    if (publicKey) {
      loadUserBalances();
    }
  }, [publicKey]);

  // Update SOL price every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadSOLPrice();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Get quote when amount changes
  useEffect(() => {
    if (payAmount && parseFloat(payAmount) > 0) {
      getSwapQuote();
    } else {
      setSwapQuote(null);
      setExchangeRate(null);
    }
  }, [payAmount, swapMode]);

  const loadTrendingTokens = async () => {
    setIsLoadingTokens(true);
    try {
      const tokens = await fetchTrendingTokens();
      setTrendingTokens(tokens);
    } catch (error) {
      console.error('Failed to load trending tokens:', error);
    } finally {
      setIsLoadingTokens(false);
    }
  };

  const loadPPAPrice = async () => {
    try {
      const price = await jupiterSwapService.getPPAPrice();
      setPpaPrice(price);
      console.log('💰 PPA Price loaded:', price);
    } catch (error) {
      console.error('Failed to load PPA price:', error);
    }
  };

  const loadUserBalances = async () => {
    if (!publicKey) return;
    
    try {
      const balances = await jupiterSwapService.getUserBalances(publicKey);
      setUserBalances(balances);
      
      console.log('💰 User wallet balances loaded:', balances);
      // Note: We don't update currentSOLBalance here as it tracks deposited amount, not wallet balance
    } catch (error) {
      console.error('Failed to load user balances:', error);
    }
  };

  const loadSOLPrice = async () => {
    try {
      const price = await fetchSOLPrice();
      setSolPrice(price);
      console.log('💰 SOL price loaded:', `$${price.toFixed(2)}`);
    } catch (error) {
      console.error('Failed to load SOL price:', error);
    }
  };

  // Calculate total portfolio value
  const calculateTotalPortfolioValue = () => {
    const collateralValue = currentSOLBalance * solPrice;
    const totalValue = balance + collateralValue;
    return {
      totalValue,
      collateralValue,
      tradingBalance: balance
    };
  };

  const getSwapQuote = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) return;
    
    setIsGettingQuote(true);
    setSwapError(null);
    
    try {
      const direction: SwapDirection = swapMode === 'buy' ? 'SOL_TO_PPA' : 'PPA_TO_SOL';
      const quote = await jupiterSwapService.getSwapQuoteWithDirection(parseFloat(payAmount), direction);
      setSwapQuote(quote);
      
      if (quote) {
        if (swapMode === 'buy') {
          const rate = await jupiterSwapService.getExchangeRate(direction);
          setExchangeRate(rate);
        } else {
          const inputPPA = parseInt(quote.inputAmount) / 1_000_000;
          const outputSOL = parseInt(quote.outputAmount) / 1_000_000_000;
          const ratePerPPA = outputSOL / inputPPA;
          setExchangeRate(`1 PPA ≈ ${ratePerPPA.toFixed(8)} SOL`);
        }
      } else {
        setSwapError('Unable to get quote. Please try again.');
        setExchangeRate(null);
      }
    } catch (error) {
      console.error('Error getting quote:', error);
      setSwapError('Failed to get quote. Please check your connection.');
      setExchangeRate(null);
    } finally {
      setIsGettingQuote(false);
    }
  };

  const formatWalletAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(walletAddress);
  };

  const handleCASubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!caInput.trim()) return;
    
    setSelectedTokenAddress(caInput.trim());
    setViewState('token-detail');
    setCaInput('');
  };

  const handleBackFromTokenDetail = () => {
    setViewState('dashboard');
    setSelectedTokenAddress('');
  };

  const handleBuyFromTokenDetail = () => {
    setViewState('dashboard');
    handleBuyPPA();
  };

  const handleBuyPPA = () => {
    setShowSwapModal(true);
    setSwapMode('buy');
    setPayAmount('');
    setSwapQuote(null);
    setSwapError(null);
    setExchangeRate(null);
    if (publicKey) {
      loadUserBalances();
    }
  };

  const handleSellPPA = () => {
    setShowSwapModal(true);
    setSwapMode('sell');
    setPayAmount('');
    setSwapQuote(null);
    setSwapError(null);
    setExchangeRate(null);
    if (publicKey) {
      loadUserBalances();
    }
  };

  const handleSwap = async () => {
    if (!swapQuote || !publicKey || !signTransaction) {
      setSwapError('Wallet not connected or quote not available');
      return;
    }

    setIsSwapping(true);
    setSwapError(null);

    try {
      let hasBalance = false;
      if (swapMode === 'buy') {
        hasBalance = await jupiterSwapService.validateSOLBalance(publicKey, parseFloat(payAmount));
        if (!hasBalance) {
          setSwapError('Insufficient SOL balance (including 0.5% fee)');
          setIsSwapping(false);
          return;
        }
      } else {
        hasBalance = await jupiterSwapService.validatePPABalance(publicKey, parseFloat(payAmount));
        if (!hasBalance) {
          setSwapError('Insufficient PPA balance (including 0.5% fee)');
          setIsSwapping(false);
          return;
        }
      }

      console.log('🚀 Starting swap transaction with 0.5% platform fee...');
      
      const result = await jupiterSwapService.executeSwap(
        swapQuote,
        publicKey,
        signTransaction
      );

      if (result) {
        console.log('✅ Swap successful with fee:', result);
        
        const inputToken = swapMode === 'buy' ? 'SOL' : 'PPA';
        const outputToken = swapMode === 'buy' ? 'PPA' : 'SOL';
        
        setSwapSuccessData({
          txid: result.txid,
          inputAmount: result.inputAmount,
          outputAmount: result.outputAmount,
          inputToken,
          outputToken,
          feeAmount: result.feeAmount
        });
        
        setShowSwapModal(false);
        setShowSuccessModal(true);
        
        setPayAmount('');
        setSwapQuote(null);
        setExchangeRate(null);
        
        loadUserBalances();

        const balanceChange = swapMode === 'buy' ? -result.inputAmount : result.outputAmount;
        const newBalance = balance + balanceChange;
        onUpdateBalance(newBalance);
      } else {
        setSwapError('Swap failed. Please try again.');
      }

    } catch (error: any) {
      console.error('💥 Swap error:', error);
      setSwapError(error.message || 'Swap failed. Please try again.');
    } finally {
      setIsSwapping(false);
    }
  };

  const handleTokenClick = (token: TrendingToken) => {
    setCaInput(token.address);
    setActiveTab('home');
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    setSwapSuccessData(null);
  };

  // SOL transfer function
  const transferSOL = async (amount: number): Promise<string | null> => {
    if (!publicKey || !signTransaction) {
      throw new Error('Wallet not connected');
    }

    try {
      // Create connection
      const connection = new Connection('https://dimensional-white-pine.solana-mainnet.quiknode.pro/e229761b955e887d87f412414b4024c993e7a91d/', {
        commitment: 'confirmed',
      });

      // Create transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(PLATFORM_WALLET),
          lamports: Math.floor(amount * LAMPORTS_PER_SOL), // Convert SOL to lamports
        })
      );

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      console.log('📝 Transaction created, requesting signature...');

      // Sign transaction
      const signedTransaction = await signTransaction(transaction);

      console.log('📡 Sending transaction to network...');

      // Send transaction
      const txid = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: true,
        maxRetries: 2,
      });

      console.log('⏳ Confirming transaction:', txid);

      // Show verification loading screen
      setIsVerifyingTransaction(true);

      // Confirm transaction
      const confirmation = await connection.confirmTransaction(txid, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }

      console.log('✅ SOL transfer confirmed:', txid);
      
      // Hide verification loading screen
      setIsVerifyingTransaction(false);
      return txid;

    } catch (error: any) {
      console.error('💥 SOL transfer error:', error);
      throw error;
    }
  };

  // Deposit/Withdraw handlers - SOL deposit with 0.04 minimum and real transfer
  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0 || amount < 0.04) return;

    if (!publicKey || !signTransaction) {
      setDepositError('Wallet not connected');
      return;
    }

    setIsDepositing(true);
    setDepositError(null);

    try {
      // Check if user has enough SOL
      const connection = new Connection('https://dimensional-white-pine.solana-mainnet.quiknode.pro/e229761b955e887d87f412414b4024c993e7a91d/', {
        commitment: 'confirmed',
      });
      
      const balance = await connection.getBalance(publicKey);
      const solBalance = balance / LAMPORTS_PER_SOL;
      const requiredAmount = amount + 0.001; // Include transaction fee

      if (solBalance < requiredAmount) {
        setDepositError(`Insufficient SOL balance. You have ${solBalance.toFixed(4)} SOL, need ${requiredAmount.toFixed(4)} SOL (including fees)`);
        return;
      }

      console.log('🚀 Starting SOL deposit:', amount, 'SOL');

      // Execute the SOL transfer
      const txid = await transferSOL(amount);

      if (txid) {
        console.log('✅ SOL deposit successful:', txid);
        
        // Add the deposited amount to user's platform SOL balance
        const newPlatformSOLBalance = currentSOLBalance + amount;
        
        console.log(`💰 Platform SOL balance: ${currentSOLBalance.toFixed(4)} + ${amount.toFixed(4)} = ${newPlatformSOLBalance.toFixed(4)} SOL`);
        
        // Update local state immediately for UI
        setCurrentSOLBalance(newPlatformSOLBalance);
        
        // Update database with the new platform SOL balance
        onUpdateSOLBalance(newPlatformSOLBalance);
        
        // Clear form and close modal
        setDepositAmount('');
        setShowDepositModal(false);
        
        // Show success notification
        console.log(`✅ Deposited ${amount} SOL successfully! Transaction: ${txid}`);
        console.log(`📊 Platform SOL balance updated to: ${newPlatformSOLBalance.toFixed(4)} SOL`);
        console.log(`🎯 User now has ${newPlatformSOLBalance.toFixed(4)} SOL deposited on platform`);
      }

    } catch (error: any) {
      console.error('💥 Deposit error:', error);
      setDepositError(error.message || 'Failed to deposit SOL. Please try again.');
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0 || amount < 0.04 || amount > currentSOLBalance) return;

    setIsWithdrawing(true);
    setWithdrawError(null);
    setWithdrawSuccess(null);

    try {
      console.log('💸 Starting SOL withdrawal request:', amount, 'SOL');

      // Create withdrawal request and deduct balance
      const withdrawalRequest = await userProfileService.createWithdrawalRequest(walletAddress, amount);

      if (withdrawalRequest) {
        console.log('✅ Withdrawal request created successfully:', withdrawalRequest.id);
        
        // Update local SOL balance immediately (it's already deducted in the database)
        const newSOLBalance = currentSOLBalance - amount;
        setCurrentSOLBalance(newSOLBalance);
        
        // Update parent component
        onUpdateSOLBalance(newSOLBalance);
        
        // Show success message
        setWithdrawSuccess(`Withdrawal request submitted for ${amount.toFixed(4)} SOL. You will receive SOL after admin approval.`);
        
        // Clear form and close modal after a short delay
        setTimeout(() => {
          setWithdrawAmount('');
          setShowWithdrawModal(false);
          setWithdrawSuccess(null);
        }, 3000);

        console.log(`✅ Withdrawal request submitted! New SOL balance: ${newSOLBalance.toFixed(4)} SOL`);
      } else {
        setWithdrawError('Failed to create withdrawal request. Please try again.');
      }

    } catch (error: any) {
      console.error('💥 Withdrawal request error:', error);
      setWithdrawError(error.message || 'Failed to create withdrawal request. Please try again.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Settings handlers
  const handleEditProfile = () => {
    setShowSettings(false);
    setViewState('edit-profile');
  };

  const handleTradingSettings = () => {
    setShowSettings(false);
    setViewState('trading-settings');
  };

  const handleNotifications = () => {
    setShowSettings(false);
    setViewState('notifications');
  };

  const handleDisconnectWallet = () => {
    setShowSettings(false);
    disconnect();
  };

  const handleBackToDashboard = () => {
    setViewState('dashboard');
  };

  const handleProfileSave = (profileData: { username: string; profilePicture?: string }) => {
    setCurrentUsername(profileData.username);
    setCurrentProfilePicture(profileData.profilePicture);
    setViewState('dashboard');
  };

  // Show different views based on viewState
  if (viewState === 'token-detail') {
    return (
      <TokenDetail
        tokenAddress={selectedTokenAddress}
        onBack={handleBackFromTokenDetail}
        onBuy={handleBuyFromTokenDetail}
      />
    );
  }

  if (viewState === 'edit-profile') {
    return (
      <EditProfile
        onBack={handleBackToDashboard}
        onSave={handleProfileSave}
        currentUsername={currentUsername}
        currentProfilePicture={currentProfilePicture}
        walletAddress={walletAddress}
      />
    );
  }

  if (viewState === 'trading-settings') {
    return <TradingSettings onBack={handleBackToDashboard} />;
  }

  if (viewState === 'notifications') {
    return <NotificationSettings onBack={handleBackToDashboard} />;
  }

  const tabs = [
    { id: 'home' as TabType, label: 'Home', icon: Home },
    { id: 'rewards' as TabType, label: 'Rewards', icon: Circle },
    { id: 'positions' as TabType, label: 'Positions', icon: Briefcase },
  ];

  // Mock active positions data - EMPTY BY DEFAULT
  const activePositions: any[] = []; // Empty array by default

  const renderTabContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="text-center max-w-md w-full">
            {/* Character Icon */}
            <div className="mb-8">
              <div className="w-20 h-20 mx-auto">
                {currentProfilePicture ? (
                  <img 
                    src={currentProfilePicture} 
                    alt="Profile Picture" 
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <img 
                    src="https://i.imgur.com/fWVz5td.png" 
                    alt="Pump Pumpkin Icon" 
                    className="w-full h-full object-cover rounded-lg"
                  />
                )}
              </div>
            </div>

            {/* Welcome Text */}
            <h1 className="text-3xl font-normal mb-2">
              Welcome Back, <span style={{ color: '#1e7cfa' }}>{currentUsername}</span>
            </h1>
            
            {/* Balance */}
            <p className="text-gray-400 text-lg mb-2">Your Trading Balance</p>
            <p className="text-5xl font-bold text-white mb-4">
              {formatCurrency(balance)}
            </p>

            {/* PnL - ALWAYS SHOWS 0 BY DEFAULT */}
            <div className="flex items-center justify-center space-x-2 mb-8">
              {isPositivePnl ? (
                <TrendingUp className="w-5 h-5 text-green-500" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-500" />
              )}
              <span className={`text-lg font-medium ${isPositivePnl ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(0)} {/* Always show $0.00 */}
              </span>
              <span className={`text-sm ${isPositivePnl ? 'text-green-400' : 'text-red-400'}`}>
                (0.0%) {/* Always show 0.0% */}
              </span>
            </div>
            
            {/* CA Input */}
            <form onSubmit={handleCASubmit}>
              <div className="relative">
                <input
                  type="text"
                  value={caInput}
                  onChange={(e) => setCaInput(e.target.value)}
                  placeholder="Enter Contract Address (CA)"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-4 text-white text-lg placeholder-gray-500 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all pr-20"
                />
                <button
                  type="submit"
                  disabled={!caInput.trim()}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ 
                    backgroundColor: !caInput.trim() ? '#374151' : '#1e7cfa',
                    color: !caInput.trim() ? '#9ca3af' : 'black'
                  }}
                >
                  Trade
                </button>
              </div>
            </form>
            
            <p className="text-gray-500 text-xs text-center mt-4">
              Enter a Pump.fun token contract address to start trading
            </p>
          </div>
        );
      
      case 'rewards':
        return (
          <div className="text-center max-w-md w-full">
            {/* Character Icon */}
            <div className="mb-8">
              <div className="w-20 h-20 mx-auto">
                <img 
                  src="https://i.imgur.com/fWVz5td.png" 
                  alt="Pump Pumpkin Icon" 
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
            </div>

            {/* Rewards Title */}
            <h1 className="text-3xl font-normal mb-2">
              Your <span style={{ color: '#1e7cfa' }}>Rewards</span>
            </h1>
            
            {/* Lifetime Rewards - ALWAYS SHOWS $0.00 BY DEFAULT */}
            <p className="text-gray-400 text-lg mb-2">Lifetime Earnings</p>
            <p className="text-5xl font-bold text-white mb-8">$0.00</p>

            {/* PPA Info */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-8">
              <h3 className="text-xl font-medium text-white mb-4">Buy PPA And Get Cash When Ever Someone Trades Using The Platform</h3>
              <p className="text-gray-400 text-sm mb-4">
                Purchase PPA tokens to earn passive income from all platform trading activity. 0.5% fee on all swaps.
              </p>
              
              {/* PPA Stats */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{formatTokenAmount(userBalances.ppa)}</p>
                  <p className="text-gray-500 text-xs">PPA Owned</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">$0.00</p>
                  <p className="text-gray-500 text-xs">Daily Earnings</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">
                    {ppaPrice ? formatNumber(ppaPrice) : '0'}
                  </p>
                  <p className="text-gray-500 text-xs">PPA/SOL</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleBuyPPA}
                  className="w-full text-black font-medium py-4 px-6 rounded-lg text-lg transition-colors"
                  style={{ backgroundColor: '#1e7cfa' }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = '#1a6ce8';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = '#1e7cfa';
                  }}
                >
                  Buy PPA Tokens
                </button>
                
                {userBalances.ppa > 0 && (
                  <button
                    onClick={handleSellPPA}
                    className="w-full bg-transparent border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white font-medium py-4 px-6 rounded-lg text-lg transition-colors"
                  >
                    Sell PPA Tokens
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      
      case 'positions':
        const portfolioData = calculateTotalPortfolioValue();
        
        return (
          <div className="max-w-md w-full">
            {/* Header with User Profile Image */}
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto mb-4">
                {currentProfilePicture ? (
                  <img 
                    src={currentProfilePicture} 
                    alt="Profile Picture" 
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center">
                    <User className="w-8 h-8 text-gray-500" />
                  </div>
                )}
              </div>
              <h1 className="text-3xl font-normal mb-2">
                Your <span style={{ color: '#1e7cfa' }}>Portfolio</span>
              </h1>
              <p className="text-gray-400 text-lg mb-2">Total Portfolio Value</p>
              <p className="text-4xl font-bold text-white">
                {formatCurrency(portfolioData.totalValue)}
              </p>
            </div>

            {/* Deposit and Withdraw Buttons - Styled like Connect Wallet */}
            <div className="flex space-x-3 mb-8">
              <button
                onClick={() => setShowDepositModal(true)}
                className="flex-1 text-black font-medium py-4 px-6 rounded-lg text-lg transition-colors flex items-center justify-center space-x-2"
                style={{ backgroundColor: '#1e7cfa' }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = '#1a6ce8';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = '#1e7cfa';
                }}
              >
                <Plus className="w-5 h-5" />
                <span>Deposit</span>
              </button>
              
              <button
                onClick={() => setShowWithdrawModal(true)}
                disabled={currentSOLBalance < 0.04}
                className="flex-1 text-black font-medium py-4 px-6 rounded-lg text-lg transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  backgroundColor: currentSOLBalance < 0.04 ? '#374151' : '#1e7cfa',
                  color: currentSOLBalance < 0.04 ? '#9ca3af' : 'black'
                }}
                onMouseEnter={(e) => {
                  if (currentSOLBalance >= 0.04) {
                    (e.target as HTMLElement).style.backgroundColor = '#1a6ce8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentSOLBalance >= 0.04) {
                    (e.target as HTMLElement).style.backgroundColor = '#1e7cfa';
                  }
                }}
              >
                <Minus className="w-5 h-5" />
                <span>Withdraw</span>
              </button>
            </div>

            {/* Unified Assets & Positions Card */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-8">
              {/* Assets Section */}
              <div className="mb-6">
                <h3 className="text-lg font-medium text-white mb-4 flex items-center">
                  <Briefcase className="w-5 h-5 mr-2" />
                  Assets
                </h3>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-gray-400 text-sm mb-2">Collateral</p>
                    <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-gradient-to-r from-purple-400 to-green-400">
                            <img 
                              src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" 
                              alt="Solana"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // Fallback to a simple circle if image fails to load
                                const target = e.currentTarget;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) {
                                  parent.innerHTML = '<span class="text-white text-sm font-bold">SOL</span>';
                                }
                              }}
                            />
                          </div>
                          <div>
                            <p className="text-white font-medium">SOL</p>
                            <p className="text-gray-400 text-xs">Solana</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-medium">{currentSOLBalance.toFixed(4)} SOL</p>
                          <p className="text-gray-400 text-sm">{formatCurrency(portfolioData.collateralValue)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Positions Section */}
              <div>
                <h3 className="text-lg font-medium text-white mb-4 flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Active Positions
                </h3>
                
                {activePositions.length > 0 ? (
                  <div className="space-y-3">
                    {activePositions.map((position, index) => (
                      <div key={index} className="bg-gray-800 border border-gray-600 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
                              <span className="text-xs font-bold">{position.symbol.charAt(0)}</span>
                            </div>
                            <div>
                              <span className="text-white font-medium">{position.symbol}</span>
                              <span className="text-gray-400 text-sm ml-2">{position.leverage}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-white text-sm">{position.size}</p>
                            <p className={`text-xs ${position.isPositive ? 'text-green-400' : 'text-red-400'}`}>
                              {position.pnl} ({position.pnlPercent})
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 text-center">
                    <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center mx-auto mb-3">
                      <Briefcase className="w-6 h-6 text-gray-500" />
                    </div>
                    <p className="text-gray-400 text-sm">No active positions</p>
                  </div>
                )}
              </div>
            </div>

            {/* Trending Tokens Section */}
            <div>
              <h3 className="text-lg font-medium text-white mb-4 flex items-center">
                <TrendingUp className="w-5 h-5 mr-2" />
                Trending Tokens
              </h3>

              {isLoadingTokens ? (
                <div className="space-y-3">
                  {[...Array(6)].map((_, index) => (
                    <div key={index} className="bg-gray-900 border border-gray-700 rounded-lg p-4 animate-pulse">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-gray-700 rounded-full"></div>
                          <div>
                            <div className="w-16 h-4 bg-gray-700 rounded mb-1"></div>
                            <div className="w-12 h-3 bg-gray-800 rounded"></div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="w-20 h-4 bg-gray-700 rounded mb-1"></div>
                          <div className="w-16 h-3 bg-gray-800 rounded"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {trendingTokens.map((token, index) => (
                    <div 
                      key={token.address} 
                      className="bg-gray-900 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors cursor-pointer"
                      onClick={() => handleTokenClick(token)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center overflow-hidden">
                            {token.logoURI ? (
                              <img 
                                src={token.logoURI} 
                                alt={token.symbol}
                                className="w-full h-full object-cover rounded-full"
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
                            <span className={`text-sm font-bold text-white ${token.logoURI ? 'hidden' : 'flex'}`}>
                              {token.symbol.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="text-white font-medium">{token.symbol}</p>
                            <p className="text-gray-400 text-xs">
                              {token.name.length > 15 ? `${token.name.substring(0, 15)}...` : token.name}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-white text-sm font-medium">
                            {formatPrice(token.price)}
                          </p>
                          <p className={`text-xs font-medium ${
                            token.priceChange24h >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {token.priceChange24h >= 0 ? '+' : ''}{token.priceChange24h.toFixed(2)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!isLoadingTokens && trendingTokens.length === 0 && (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 text-center">
                  <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <TrendingUp className="w-6 h-6 text-gray-500" />
                  </div>
                  <p className="text-gray-400 text-sm">No trending tokens available</p>
                  <button
                    onClick={loadTrendingTokens}
                    className="mt-2 text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header with Settings and Wallet */}
      <div className="flex items-center justify-between p-6">
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 text-gray-400 hover:text-white transition-colors"
        >
          <Settings className="w-6 h-6" />
        </button>
        
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm text-gray-400">
            {formatWalletAddress(walletAddress)}
          </span>
          <button 
            onClick={handleCopyAddress}
            className="p-1 text-gray-400 hover:text-white transition-colors"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4 pb-24 overflow-y-auto">
        {renderTabContent()}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-black border-t border-gray-800">
        <div className="flex items-center justify-around py-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center space-y-1 px-4 py-2 transition-colors ${
                  isActive 
                    ? 'text-white' 
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-medium">{tab.label}</span>
                {isActive && (
                  <div className="w-1 h-1 rounded-full" style={{ backgroundColor: '#1e7cfa' }}></div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Deposit Modal - Styled like Connect Wallet */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4 z-50">
          <div className="text-center max-w-md w-full">
            <div className="flex justify-end mb-6">
              <button
                onClick={() => setShowDepositModal(false)}
                disabled={isDepositing}
                className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-8">
              <div className="w-20 h-20 mx-auto">
                <img 
                  src="https://i.imgur.com/fWVz5td.png" 
                  alt="Pump Pumpkin Icon" 
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
            </div>

            <h1 className="text-3xl font-normal mb-2">
              <span style={{ color: '#1e7cfa' }}>Deposit</span> SOL
            </h1>
            
            <p className="text-gray-400 text-lg mb-2">Add SOL To Your Platform Balance</p>
            
            <p className="text-gray-500 text-sm mb-2">Current Deposited: {currentSOLBalance.toFixed(4)} SOL</p>
            <p className="text-gray-500 text-sm mb-8">Minimum deposit: 0.04 SOL</p>

            {/* Error Message */}
            {depositError && (
              <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-4">
                <p className="text-red-300 text-sm">{depositError}</p>
              </div>
            )}

            <div className="mb-8">
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => {
                  setDepositAmount(e.target.value);
                  setDepositError(null); // Clear error when user types
                }}
                placeholder="Enter SOL amount (min 0.04)"
                min="0.04"
                step="0.001"
                disabled={isDepositing}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-4 text-white text-lg placeholder-gray-500 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all text-center disabled:opacity-50"
              />
            </div>

            <button
              onClick={handleDeposit}
              disabled={!depositAmount || parseFloat(depositAmount) < 0.04 || isDepositing}
              className="w-full text-black font-medium py-4 px-6 rounded-lg text-lg transition-colors disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed mb-4 flex items-center justify-center space-x-2"
              style={{ 
                backgroundColor: (!depositAmount || parseFloat(depositAmount) < 0.04 || isDepositing) ? '#374151' : '#1e7cfa',
                color: (!depositAmount || parseFloat(depositAmount) < 0.04 || isDepositing) ? '#9ca3af' : 'black'
              }}
              onMouseEnter={(e) => {
                if (depositAmount && parseFloat(depositAmount) >= 0.04 && !isDepositing) {
                  (e.target as HTMLElement).style.backgroundColor = '#1a6ce8';
                }
              }}
              onMouseLeave={(e) => {
                if (depositAmount && parseFloat(depositAmount) >= 0.04 && !isDepositing) {
                  (e.target as HTMLElement).style.backgroundColor = '#1e7cfa';
                }
              }}
            >
              {isDepositing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Deposit {depositAmount ? `${parseFloat(depositAmount).toFixed(4)} SOL` : 'SOL'}</span>
              )}
            </button>

            <p className="text-gray-600 text-xs mb-2">
              SOL Will Be Added To Your Platform Balance
            </p>
            <p className="text-gray-500 text-xs">
              Transfer to: {PLATFORM_WALLET.slice(0, 8)}...{PLATFORM_WALLET.slice(-8)}
            </p>
          </div>
        </div>
      )}

      {/* Withdraw Modal - Styled like Connect Wallet */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4 z-50">
          <div className="text-center max-w-md w-full">
            <div className="flex justify-end mb-6">
              <button
                onClick={() => {
                  setShowWithdrawModal(false);
                  setWithdrawError(null);
                  setWithdrawSuccess(null);
                  setWithdrawAmount('');
                }}
                disabled={isWithdrawing}
                className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-8">
              <div className="w-20 h-20 mx-auto">
                <img 
                  src="https://i.imgur.com/fWVz5td.png" 
                  alt="Pump Pumpkin Icon" 
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
            </div>

            <h1 className="text-3xl font-normal mb-2">
              <span style={{ color: '#1e7cfa' }}>Withdraw</span> SOL
            </h1>
            
            <p className="text-gray-400 text-lg mb-2">Request SOL Withdrawal</p>
            
            <p className="text-gray-500 text-sm mb-2">Available: {currentSOLBalance.toFixed(4)} SOL</p>
            <p className="text-gray-500 text-sm mb-8">Minimum withdrawal: 0.04 SOL</p>

            {/* Error Message */}
            {withdrawError && (
              <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-4">
                <p className="text-red-300 text-sm">{withdrawError}</p>
              </div>
            )}

            {/* Success Message */}
            {withdrawSuccess && (
              <div className="bg-green-900 border border-green-700 rounded-lg p-3 mb-4">
                <p className="text-green-300 text-sm">{withdrawSuccess}</p>
              </div>
            )}

            <div className="mb-8">
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => {
                  setWithdrawAmount(e.target.value);
                  setWithdrawError(null); // Clear error when user types
                }}
                placeholder="Enter SOL amount (min 0.04)"
                min="0.04"
                max={currentSOLBalance}
                step="0.001"
                disabled={isWithdrawing}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-4 text-white text-lg placeholder-gray-500 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all text-center disabled:opacity-50"
              />
            </div>

            <button
              onClick={handleWithdraw}
              disabled={!withdrawAmount || parseFloat(withdrawAmount) < 0.04 || parseFloat(withdrawAmount) > currentSOLBalance || isWithdrawing}
              className="w-full text-black font-medium py-4 px-6 rounded-lg text-lg transition-colors disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed mb-4 flex items-center justify-center space-x-2"
              style={{ 
                backgroundColor: (!withdrawAmount || parseFloat(withdrawAmount) < 0.04 || parseFloat(withdrawAmount) > currentSOLBalance || isWithdrawing) ? '#374151' : '#1e7cfa',
                color: (!withdrawAmount || parseFloat(withdrawAmount) < 0.04 || parseFloat(withdrawAmount) > currentSOLBalance || isWithdrawing) ? '#9ca3af' : 'black'
              }}
              onMouseEnter={(e) => {
                if (withdrawAmount && parseFloat(withdrawAmount) >= 0.04 && parseFloat(withdrawAmount) <= currentSOLBalance && !isWithdrawing) {
                  (e.target as HTMLElement).style.backgroundColor = '#1a6ce8';
                }
              }}
              onMouseLeave={(e) => {
                if (withdrawAmount && parseFloat(withdrawAmount) >= 0.04 && parseFloat(withdrawAmount) <= currentSOLBalance && !isWithdrawing) {
                  (e.target as HTMLElement).style.backgroundColor = '#1e7cfa';
                }
              }}
            >
              {isWithdrawing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Request Withdrawal {withdrawAmount ? `${parseFloat(withdrawAmount).toFixed(4)} SOL` : ''}</span>
              )}
            </button>

            <p className="text-gray-600 text-xs mb-2">
              Withdrawal Request Will Be Reviewed by Admin
            </p>
            <p className="text-gray-500 text-xs">
              SOL will be sent to your wallet after approval
            </p>
          </div>
        </div>
      )}

      {/* Mobile-Optimized Swap Modal */}
      {showSwapModal && (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-3 z-50">
          <div className="bg-black w-full max-w-xs mx-auto">
            {/* Close Button */}
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setShowSwapModal(false)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
                disabled={isSwapping}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Character Icon */}
            <div className="mb-4">
              <div className="w-12 h-12 mx-auto">
                <img 
                  src="https://i.imgur.com/fWVz5td.png" 
                  alt="Pump Pumpkin Icon" 
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-xl font-normal mb-1 text-center">
              {swapMode === 'buy' ? 'Buy' : 'Sell'} <span style={{ color: '#1e7cfa' }}>PPA</span>
            </h1>
            
            {/* Subtitle */}
            <p className="text-gray-400 text-sm mb-3 text-center">
              {swapMode === 'buy' ? 'Swap SOL For PPA' : 'Swap PPA For SOL'}
            </p>

            {/* Balance Display */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 mb-3">
              <p className="text-gray-400 text-xs mb-1">Available</p>
              <p className="text-white text-sm">
                {swapMode === 'buy' 
                  ? `${userBalances.sol.toFixed(4)} SOL` 
                  : `${formatTokenAmount(userBalances.ppa)} PPA`
                }
              </p>
            </div>
            
            {/* Error Message */}
            {swapError && (
              <div className="bg-red-900 border border-red-700 rounded-lg p-2 mb-3">
                <p className="text-red-300 text-xs">{swapError}</p>
              </div>
            )}
            
            {/* Pay Input */}
            <div className="mb-2">
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder={`Enter ${swapMode === 'buy' ? 'SOL' : 'PPA'} Amount`}
                min="0"
                step={swapMode === 'buy' ? '0.001' : '0.01'}
                disabled={isSwapping}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all text-center disabled:opacity-50"
              />
            </div>

            {swapMode === 'buy' && (
              <>
                {/* Swap Arrow */}
                <div className="flex justify-center mb-2">
                  <div className="bg-gray-800 rounded-full p-1 border border-gray-600">
                    {isGettingQuote ? (
                      <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Receive Display - Only for buy mode */}
                <div className="mb-3">
                  <div className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-center">
                    <span className="text-white text-sm">
                      {swapQuote ? 
                        `${jupiterSwapService.formatTokenAmount(swapQuote.outputAmount, 'PPA')} PPA` :
                        '0 PPA'
                      }
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Exchange Rate & Price Impact */}
            <div className="mb-4 text-center space-y-1">
              {swapQuote && (
                <p className="text-gray-400 text-xs">
                  Impact: {parseFloat(swapQuote.priceImpactPct).toFixed(2)}%
                </p>
              )}
              {exchangeRate && (
                <p className="text-white text-xs">
                  {exchangeRate}
                </p>
              )}
            </div>

            {/* Swap Button */}
            <button
              onClick={handleSwap}
              disabled={!payAmount || !swapQuote || isSwapping || isGettingQuote}
              className="w-full text-black font-medium py-2 px-4 rounded-lg text-sm transition-colors disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed mb-2 flex items-center justify-center space-x-2"
              style={{ 
                backgroundColor: (!payAmount || !swapQuote || isSwapping) ? '#374151' : '#1e7cfa',
                color: (!payAmount || !swapQuote || isSwapping) ? '#9ca3af' : 'black'
              }}
            >
              {isSwapping ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Swapping...</span>
                </>
              ) : (
                <span>{swapMode === 'buy' ? 'Buy PPA' : 'Sell PPA'}</span>
              )}
            </button>

            {/* Cancel Button */}
            <button
              onClick={() => setShowSwapModal(false)}
              disabled={isSwapping}
              className="w-full bg-transparent border border-gray-600 hover:border-gray-500 text-gray-400 hover:text-gray-300 font-medium py-2 px-4 rounded-lg text-sm transition-colors mb-3 disabled:opacity-50"
            >
              Cancel
            </button>

            {/* Powered by Jupiter */}
            <div className="flex items-center justify-center space-x-1">
              <span className="text-gray-500 text-xs">Powered by</span>
              <img 
                src="https://portal.jup.ag/images/branding/JupiterIcon.svg" 
                alt="Jupiter" 
                className="w-3 h-3"
              />
              <span className="text-gray-400 text-xs font-medium">Jupiter</span>
            </div>
          </div>
        </div>
      )}

      {/* Mobile-Optimized Success Modal */}
      {showSuccessModal && swapSuccessData && (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-3 z-50">
          <div className="bg-black w-full max-w-xs mx-auto text-center">
            {/* Success Icon */}
            <div className="mb-4">
              <div className="w-16 h-16 mx-auto bg-green-500 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
            </div>

            {/* Success Title */}
            <h1 className="text-2xl font-normal mb-3">
              Swap <span style={{ color: '#1e7cfa' }}>Successful!</span>
            </h1>
            
            {/* Transaction Details */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-xs">You Paid:</span>
                  <span className="text-white text-sm font-medium">
                    {swapSuccessData.inputAmount.toFixed(4)} {swapSuccessData.inputToken}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-xs">You Received:</span>
                  <span className="text-green-400 text-sm font-medium">
                    {swapSuccessData.outputAmount.toFixed(4)} {swapSuccessData.outputToken}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-xs">Platform Fee (0.5%):</span>
                  <span className="text-orange-400 text-sm font-medium">
                    {swapSuccessData.feeAmount.toFixed(6)} {swapSuccessData.inputToken}
                  </span>
                </div>
                
                <div className="border-t border-gray-700 pt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-xs">Transaction ID:</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(swapSuccessData.txid)}
                      className="text-blue-400 hover:text-blue-300 text-xs font-mono truncate max-w-24"
                      title="Click to copy"
                    >
                      {swapSuccessData.txid.slice(0, 6)}...{swapSuccessData.txid.slice(-6)}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* View on Explorer Button */}
            <button
              onClick={() => window.open(`https://solscan.io/tx/${swapSuccessData.txid}`, '_blank')}
              className="w-full bg-transparent border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors mb-3"
            >
              View on Solscan
            </button>

            {/* Close Button */}
            <button
              onClick={handleCloseSuccessModal}
              className="w-full text-black font-medium py-2 px-4 rounded-lg text-sm transition-colors"
              style={{ backgroundColor: '#1e7cfa' }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#1a6ce8';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#1e7cfa';
              }}
            >
              Continue Trading
            </button>
          </div>
        </div>
      )}

      {/* Transaction Verification Loading Modal */}
      {isVerifyingTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4 z-50">
          <div className="text-center max-w-md w-full">
            {/* Loading Icon */}
            <div className="mb-6">
              <div className="relative w-20 h-20 mx-auto">
                <img 
                  src="https://i.imgur.com/fWVz5td.png" 
                  alt="Pump Pumpkin Icon" 
                  className="w-full h-full object-cover rounded-lg"
                />
                <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-lg animate-spin"></div>
              </div>
            </div>

            {/* Loading Text */}
            <h1 className="text-2xl font-normal mb-3">
              Verifying Your <span style={{ color: '#1e7cfa' }}>Transaction</span>
            </h1>
            
            <p className="text-gray-400 text-lg mb-2">Please Wait...</p>
            <p className="text-gray-500 text-sm">We are confirming your transaction on the Solana blockchain</p>
            <p className="text-gray-500 text-sm mt-4">This usually takes a few seconds</p>
            
            {/* Animated dots */}
            <div className="flex justify-center space-x-1 mt-6">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Settings</h3>
              <button 
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <button 
                onClick={handleEditProfile}
                className="w-full text-left p-4 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors flex items-center space-x-3"
              >
                <User className="w-5 h-5 text-blue-400" />
                <div>
                  <p className="text-white font-medium">Edit Profile</p>
                  <p className="text-gray-400 text-sm">Update username and profile picture</p>
                </div>
              </button>
              
              <button 
                onClick={handleTradingSettings}
                className="w-full text-left p-4 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors flex items-center space-x-3"
              >
                <Sliders className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-white font-medium">Trading Settings</p>
                  <p className="text-gray-400 text-sm">Configure slippage, leverage, and fees</p>
                </div>
              </button>
              
              <button 
                onClick={handleNotifications}
                className="w-full text-left p-4 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors flex items-center space-x-3"
              >
                <Bell className="w-5 h-5 text-yellow-400" />
                <div>
                  <p className="text-white font-medium">Notifications</p>
                  <p className="text-gray-400 text-sm">Manage alerts and preferences</p>
                </div>
              </button>
              
              <button 
                onClick={handleDisconnectWallet}
                className="w-full text-left p-4 rounded-lg bg-gray-800 hover:bg-red-900 transition-colors flex items-center space-x-3 text-red-400 hover:text-red-300"
              >
                <LogOut className="w-5 h-5" />
                <div>
                  <p className="font-medium">Disconnect Wallet</p>
                  <p className="text-gray-400 text-sm">Sign out of your account</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}