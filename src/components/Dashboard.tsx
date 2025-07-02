import React, { useState, useEffect, useRef } from 'react';
import { Settings, Copy, TrendingUp, TrendingDown, Home, Briefcase, ArrowUpDown, X, Loader2, CheckCircle, User, LogOut, Plus, Minus, Circle, ArrowLeft, Wallet, ArrowRight, RefreshCw, Calculator, AlertTriangle, AlertCircle, Send, Download, ExternalLink, Share, DollarSign, BarChart3, TrendingUp as TrendingUpIcon, Activity, History } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { fetchTrendingTokens, fetchSOLPrice, fetchTokenDetailCached, fetchTokenPriceCached, formatPrice, formatVolume, formatMarketCap, TrendingToken } from '../services/birdeyeApi';
import { jupiterSwapService, SwapQuote, SwapDirection } from '../services/jupiterApi';
import { formatNumber, formatCurrency, formatTokenAmount } from '../utils/formatters';
import { userProfileService, WithdrawalRequest, supabase } from '../services/supabaseClient';
import TokenDetail from './TokenDetail';
import EditProfile from './EditProfile';
import { positionService, TradingPosition } from '../services/positionService';
import PositionModal from './PositionModal';
import { jupiterWebSocket, getJupiterPrices } from '../services/birdeyeWebSocket'; // Note: Actually using Birdeye WebSocket
import unifiedPriceService from '../services/unifiedPriceService';
import TradeLoadingModal from './TradeLoadingModal';
import TradeResultsModal from './TradeResultsModal';
import soundManager from '../services/soundManager';
import { hapticFeedback } from '../utils/animations';

interface DashboardProps {
  username: string;
  profilePicture?: string;
  walletAddress: string;
  balance: number;
  solBalance: number;
  onUpdateBalance: (newBalance: number) => void;
  onUpdateSOLBalance: (newSOLBalance: number) => void;
  onUpdateBothBalances: (newBalance: number, newSOLBalance: number) => void;
  onShowTerms: () => void;
}

type TabType = 'home' | 'rewards' | 'positions' | 'orders';
type SwapMode = 'buy' | 'sell';
type ViewState = 'dashboard' | 'token-detail' | 'edit-profile';

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

export default function Dashboard({ username, profilePicture, walletAddress, balance, solBalance, onUpdateBalance, onUpdateSOLBalance, onUpdateBothBalances, onShowTerms }: DashboardProps) {
  const { publicKey, signTransaction, disconnect } = useWallet();
  const [caInput, setCaInput] = useState('');
  const [isValidatingCA, setIsValidatingCA] = useState(false);
  const [caValidationError, setCaValidationError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(soundManager.isSoundEnabled());
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
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [isLoadingWithdrawals, setIsLoadingWithdrawals] = useState(false);
  const [tradingPositions, setTradingPositions] = useState<TradingPosition[]>([]);
  const [isLoadingPositions, setIsLoadingPositions] = useState(false);
  
  // ADDED: Orders state for managing pending limit orders
  const [pendingOrders, setPendingOrders] = useState<TradingPosition[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isEditingOrder, setIsEditingOrder] = useState<number | null>(null);
  const [newOrderPrice, setNewOrderPrice] = useState('');
  
  // Trade History state
  const [tradeHistory, setTradeHistory] = useState<TradingPosition[]>([]);
  const [isLoadingTradeHistory, setIsLoadingTradeHistory] = useState(false);
  
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
  
  // Real-time price feed for positions
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  const [priceUpdateCount, setPriceUpdateCount] = useState(0);
  
  // Position modal state
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<TradingPosition | null>(null);
  const [isClosingPosition, setIsClosingPosition] = useState(false);
  
  // Track positions being closed to prevent duplicates
  const [closingPositions, setClosingPositions] = useState<Set<number>>(new Set());
  
  // Closing trade loading modal state
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [closingTradeData, setClosingTradeData] = useState<{
    tokenSymbol: string;
    direction: 'Long' | 'Short';
    leverage: number;
    positionId: number; // Add position ID to track results
  } | null>(null);
  
  // Trade results modal state
  const [showTradeResults, setShowTradeResults] = useState(false);
  const [tradeResultsData, setTradeResultsData] = useState<{
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
  } | null>(null);
  
  // Mock data for PnL (in production, this would come from database) - SET TO 0 BY DEFAULT
  const pnl = 0; // Always 0 by default
  const pnlPercentage = 0; // Always 0 by default
  const isPositivePnl = pnl >= 0;

  // Sound and Animation States
  const [lastPnLValues, setLastPnLValues] = useState<Record<number, number>>({});
  const [celebrationActive, setCelebrationActive] = useState(false);
  const [priceFlashStates, setPriceFlashStates] = useState<Record<string, { isIncrease: boolean; timestamp: number }>>({});

  // Initialize sound system on component mount
  useEffect(() => {
    soundManager.loadSettings();
    console.log('🎵 Sound system initialized for trading app');
  }, []);

  // Load trending tokens on component mount
  useEffect(() => {
    loadTrendingTokens();
    loadPPAPrice();
    loadSOLPrice();
    if (publicKey) {
      loadUserBalances();
    }
  }, [publicKey]);

  // UNIFIED PRICE SERVICE - Single subscription replaces all competing intervals
  useEffect(() => {
    console.log('🚀 Starting unified price service - eliminates 30-second delays');
    
    const unsubscribe = unifiedPriceService.subscribe('dashboard', (priceData: { solPrice: number; tokenPrices: Record<string, number>; lastUpdate: number }) => {
      // Update SOL price
      setSolPrice(priceData.solPrice);
      
      // Update token prices for positions
      setTokenPrices(priceData.tokenPrices);
      
      // Update P&L for all positions using new price data
      updatePositionPnLFromData(priceData);
      
      // Refresh SOL balance every 4th update (every ~20 seconds)
      if (walletAddress && priceData.lastUpdate % (5000 * 4) < 5000) {
        refreshSOLBalance();
      }
    });
    
    return unsubscribe;
  }, [walletAddress]);

  // Track tokens when positions change
  useEffect(() => {
    if (tradingPositions.length > 0) {
      const uniqueTokens = [...new Set(tradingPositions.map(p => p.token_address))];
      unifiedPriceService.trackTokens(uniqueTokens);
      
      // Set these as high-priority tokens for 500ms updates
      unifiedPriceService.setHighPriorityTokens(uniqueTokens);
      console.log('⚡ Set high-priority 500ms updates for position tokens:', uniqueTokens.length);
    } else {
      // No positions, clear high-priority tokens
      unifiedPriceService.setHighPriorityTokens([]);
    }
  }, [tradingPositions.length]);

  // Get quote when amount changes
  useEffect(() => {
    if (payAmount && parseFloat(payAmount) > 0) {
      getSwapQuote();
    } else {
      setSwapQuote(null);
      setExchangeRate(null);
    }
  }, [payAmount, swapMode]);

  // Load positions when positions tab is selected
  useEffect(() => {
    if (activeTab === 'positions') {
      loadTradingPositions();
    }
  }, [activeTab]);

  // Load orders when orders tab is selected
  useEffect(() => {
    if (activeTab === 'orders') {
      loadPendingOrders();
      loadTradeHistory();
    }
  }, [activeTab]);

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

  // ADDED: Refresh SOL balance from database to prevent stale balance issues
  const refreshSOLBalance = async () => {
    if (!walletAddress) return;
    
    try {
      console.log('🔄 Refreshing SOL balance from database...');
      const profile = await userProfileService.getProfile(walletAddress);
      if (profile) {
        const dbBalance = profile.sol_balance;
        if (Math.abs(dbBalance - currentSOLBalance) > 0.0001) { // Only update if difference is significant
          console.log('💰 SOL balance updated from database:', {
            ui_balance: currentSOLBalance,
            db_balance: dbBalance,
            difference: dbBalance - currentSOLBalance
          });
          setCurrentSOLBalance(dbBalance);
          onUpdateSOLBalance(dbBalance);
        }
      }
    } catch (error) {
      console.error('Failed to refresh SOL balance:', error);
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

  // Real-time price feed for position tokens - ULTRA-FAST WITH CACHING - MAXIMUM SPEED
  const updateTokenPrices = async () => {
    if (tradingPositions.length === 0) return;
    
    try {
      console.log('📈 ULTRA-FAST updating real-time token prices using cache...');
      const uniqueTokens = [...new Set(tradingPositions.map(p => p.token_address))];
      const pricePromises = uniqueTokens.map(async (tokenAddress) => {
        try {
          // Use cached price fetching for better performance
          const price = await fetchTokenPriceCached(tokenAddress);
          return { address: tokenAddress, price: price || 0 };
        } catch (error) {
          console.error(`Failed to fetch price for ${tokenAddress}:`, error);
          return { address: tokenAddress, price: tokenPrices[tokenAddress] || 0 }; // Use cached price if API fails
        }
      });

      const priceResults = await Promise.all(pricePromises);
      const newPrices: Record<string, number> = {};
      
      priceResults.forEach(({ address, price }) => {
        newPrices[address] = price;
      });

      setTokenPrices(newPrices);
      setPriceUpdateCount(prev => prev + 1);
      console.log(`✅ ULTRA-FAST updated prices for ${uniqueTokens.length} tokens using cache`, newPrices);
    } catch (error) {
      console.error('Error updating token prices:', error);
    }
  };

  const loadWithdrawalRequests = async () => {
    setIsLoadingWithdrawals(true);
    try {
      const requests = await userProfileService.getWithdrawalRequests(walletAddress);
      setWithdrawalRequests(requests);
      console.log('📋 Withdrawal requests loaded:', requests.length);
    } catch (error) {
      console.error('Failed to load withdrawal requests:', error);
    } finally {
      setIsLoadingWithdrawals(false);
    }
  };

  const loadTradingPositions = async () => {
    if (!walletAddress) return;
    
    setIsLoadingPositions(true);
    try {
      console.log('📊 Loading trading positions and checking for liquidations...');
      const positions = await positionService.getUserPositions(walletAddress);
      const openPositions = positions.filter(p => p.status === 'open' || p.status === 'opening');
      
      // Calculate real-time P&L, check liquidations, and fetch token images
      const positionsWithPnL = await Promise.all(
        openPositions.map(async (position) => {
          try {
            // Get P&L data and token details from Birdeye API
            const [pnlData, tokenData] = await Promise.all([
              positionService.calculatePositionPnL(position),
              fetchTokenDetailCached(position.token_address)
            ]);
            
            // IMMEDIATE LIQUIDATION CHECK on load
            if (pnlData.margin_ratio >= 1.0) {
              console.log(`🔥 LIQUIDATING POSITION ${position.id} ON LOAD: Margin ratio ${(pnlData.margin_ratio * 100).toFixed(1)}%`);
              console.log(`💥 Position details:`, {
                token: position.token_symbol,
                direction: position.direction,
                leverage: position.leverage,
                entry_price: position.entry_price,
                current_price: pnlData.current_price,
                pnl: pnlData.pnl,
                margin_ratio: pnlData.margin_ratio
              });
              
              await positionService.liquidatePosition(position.id, pnlData.current_price);
              
              // Return null to filter out liquidated position
              return null;
            }
            
            return {
              ...position,
              current_pnl: pnlData.pnl,
              current_price: pnlData.current_price,
              margin_ratio: pnlData.margin_ratio,
              token_image: tokenData?.logoURI || null // Add token image from Birdeye API
            };
          } catch (error) {
            console.error(`Error calculating P&L for position ${position.id}:`, error);
            return position; // Return original position if P&L calculation fails
          }
        })
      );
      
      // Filter out liquidated positions (null values)
      const activePositions = positionsWithPnL.filter(p => p !== null);
      const liquidatedCount = positionsWithPnL.length - activePositions.length;
      
      setTradingPositions(activePositions);
      
      if (liquidatedCount > 0) {
        console.log(`🔥 ${liquidatedCount} position(s) liquidated on load and removed`);
      }
      
      console.log(`✅ Loaded ${activePositions.length} active positions with real-time P&L and images`);
    } catch (error) {
      console.error('Error loading positions:', error);
      setTradingPositions([]);
    } finally {
      setIsLoadingPositions(false);
    }
  };

  // ADDED: Load pending limit orders
  const loadPendingOrders = async () => {
    if (!walletAddress) return;
    
    setIsLoadingOrders(true);
    try {
      console.log('📋 Loading pending limit orders...');
      const positions = await positionService.getUserPositions(walletAddress);
      const orders = positions.filter(p => p.status === 'pending');
      
      // Fetch token images for orders
      const ordersWithImages = await Promise.all(
        orders.map(async (order) => {
          try {
            const tokenData = await fetchTokenDetailCached(order.token_address);
            return {
              ...order,
              token_image: tokenData?.logoURI || null,
              current_price: tokenData?.price || 0 // Add current market price for comparison
            };
          } catch (error) {
            console.error(`Error fetching token data for order ${order.id}:`, error);
            return order;
          }
        })
      );
      
      setPendingOrders(ordersWithImages);
      console.log(`✅ Loaded ${ordersWithImages.length} pending orders`);
    } catch (error) {
      console.error('Error loading pending orders:', error);
      setPendingOrders([]);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  // ADDED: Load trade history (closed/liquidated positions)
  const loadTradeHistory = async () => {
    if (!walletAddress) return;
    
    setIsLoadingTradeHistory(true);
    try {
      console.log('📋 Loading trade history...');
      const positions = await positionService.getUserPositions(walletAddress);
      const history = positions.filter(p => p.status === 'closed' || p.status === 'liquidated' || p.status === 'cancelled');
      
      // Sort by closed date, most recent first
      const sortedHistory = history.sort((a, b) => {
        const dateA = new Date(a.closed_at || a.updated_at);
        const dateB = new Date(b.closed_at || b.updated_at);
        return dateB.getTime() - dateA.getTime();
      });
      
      // Fetch token images for trade history
      const historyWithImages = await Promise.all(
        sortedHistory.slice(0, 20).map(async (trade) => { // Show last 20 trades
          try {
            const tokenData = await fetchTokenDetailCached(trade.token_address);
            return {
              ...trade,
              token_image: tokenData?.logoURI || null
            };
          } catch (error) {
            console.error(`Error fetching token data for trade ${trade.id}:`, error);
            return trade;
          }
        })
      );
      
      setTradeHistory(historyWithImages);
      console.log(`✅ Loaded ${historyWithImages.length} trade history records`);
    } catch (error) {
      console.error('Error loading trade history:', error);
      setTradeHistory([]);
    } finally {
      setIsLoadingTradeHistory(false);
    }
  };

  // Calculate P&L using cached real-time prices
  const calculatePositionPnLWithCachedPrice = (position: TradingPosition) => {
    const current_price = tokenPrices[position.token_address] || position.entry_price;
    const entry_price = position.entry_price;
    const amount = position.amount;
    const leverage = position.leverage;
    
    // Calculate P&L in USD
    let pnl_usd = 0;
    if (position.direction === 'Long') {
      pnl_usd = (current_price - entry_price) * amount * leverage;
    } else {
      pnl_usd = (entry_price - current_price) * amount * leverage;
    }
    
    // Calculate margin ratio in SOL terms (CORRECT WAY)
    const max_loss_sol = position.collateral_sol; // Keep max loss in SOL
    const pnl_sol = pnl_usd / solPrice; // Convert P&L from USD to SOL
    
    let margin_ratio = 0;
    if (pnl_sol < 0) {
      margin_ratio = Math.abs(pnl_sol) / max_loss_sol;
    }
    
    console.log(`📊 Position ${position.id} margin calculation:`, {
      token: position.token_symbol,
      pnl_usd: pnl_usd.toFixed(6),
      pnl_sol: pnl_sol.toFixed(8),
      collateral_sol: position.collateral_sol.toFixed(8),
      margin_ratio: (margin_ratio * 100).toFixed(1) + '%',
      sol_price: solPrice
    });
    
    return {
      pnl: pnl_usd, // Return P&L in USD for display
      margin_ratio: Math.min(margin_ratio, 1),
      current_price
    };
  };

  // Update position P&L using cached prices (much faster)
  const updatePositionPnL = async () => {
    if (!walletAddress || tradingPositions.length === 0) return;
    
    try {
      console.log('🔄 Updating position P&L using real-time cached prices...');
      
      const updatedPositions = tradingPositions.map((position) => {
        try {
          const pnlData = calculatePositionPnLWithCachedPrice(position);
          
          // Check for liquidation FIRST (margin ratio >= 100%)
          if (pnlData.margin_ratio >= 1.0) {
            console.log(`🔥 LIQUIDATING POSITION ${position.id}: Margin ratio ${(pnlData.margin_ratio * 100).toFixed(1)}%`);
            // Mark for liquidation (will be handled by separate liquidation service)
            positionService.liquidatePosition(position.id, pnlData.current_price);
            
            return {
              ...position,
              status: 'liquidated' as const,
              current_pnl: pnlData.pnl,
              current_price: pnlData.current_price,
              margin_ratio: pnlData.margin_ratio,
              updated_at: new Date().toISOString()
            };
          }
          
          return {
            ...position,
            current_pnl: pnlData.pnl,
            current_price: pnlData.current_price,
            margin_ratio: pnlData.margin_ratio,
            updated_at: new Date().toISOString()
          };
        } catch (error) {
          console.error(`Error updating P&L for position ${position.id}:`, error);
          return position;
        }
      });
      
      // Filter out liquidated positions from the display
      const activePositions = updatedPositions.filter(p => p.status === 'open');
      setTradingPositions(activePositions);
      
      const liquidatedCount = updatedPositions.length - activePositions.length;
      if (liquidatedCount > 0) {
        console.log(`🔥 ${liquidatedCount} position(s) liquidated and removed from display`);
      }
      
      console.log(`✅ Updated ${activePositions.length} positions using cached prices (Update #${priceUpdateCount})`);
    } catch (error) {
      console.error('Error updating position P&L:', error);
    }
  };

  // Update position P&L using unified price service data
  const updatePositionPnLFromData = (priceData: { solPrice: number; tokenPrices: Record<string, number>; lastUpdate: number }) => {
    if (!walletAddress || tradingPositions.length === 0) return;
    
    try {
      const updatedPositions = tradingPositions.map((position) => {
        try {
          const current_price = priceData.tokenPrices[position.token_address] || position.entry_price;
          const entry_price = position.entry_price;
          const amount = position.amount;
          const leverage = position.leverage;
          
          // Calculate P&L in USD
          let pnl_usd = 0;
          if (position.direction === 'Long') {
            pnl_usd = (current_price - entry_price) * amount * leverage;
          } else {
            pnl_usd = (entry_price - current_price) * amount * leverage;
          }
          
          // 🎵 SOUND INTEGRATION: Play sound for P&L changes
          const lastPnL = lastPnLValues[position.id] || 0;
          if (lastPnL !== 0 && Math.abs(pnl_usd - lastPnL) > 1) { // Only play if change > $1
            if (pnl_usd > lastPnL) {
              // Profit increase
              if (pnl_usd - lastPnL > 10) {
                soundManager.playProfitBig(); // Big profit gain
                hapticFeedback.success();
              } else {
                soundManager.playProfitSmall(); // Small profit gain
                hapticFeedback.light();
              }
            } else if (pnl_usd < lastPnL) {
              // Loss or profit decrease
              soundManager.playLossGentle(); // Never harsh
              hapticFeedback.light();
            }
          }
          
          // Update last P&L values for position tracking
          setLastPnLValues(prev => ({ ...prev, [position.id]: pnl_usd }));
          
          // Calculate margin ratio in SOL terms
          const max_loss_sol = position.collateral_sol;
          const pnl_sol = pnl_usd / priceData.solPrice;
          
          let margin_ratio = 0;
          if (pnl_sol < 0) {
            margin_ratio = Math.abs(pnl_sol) / max_loss_sol;
          }
          
          // 🎵 SOUND INTEGRATION: Liquidation warning sounds
          if (margin_ratio >= 0.9) {
            soundManager.playLiquidationWarning();
            hapticFeedback.error();
          } else if (margin_ratio >= 0.8) {
            soundManager.playMarginCall();
            hapticFeedback.medium();
          }
          
          // Check for liquidation
          if (margin_ratio >= 1.0) {
            console.log(`🔥 LIQUIDATING POSITION ${position.id}: Margin ratio ${(margin_ratio * 100).toFixed(1)}%`);
            positionService.liquidatePosition(position.id, current_price);
            
            return {
              ...position,
              status: 'liquidated' as const,
              current_pnl: pnl_usd,
              current_price,
              margin_ratio,
              updated_at: new Date().toISOString()
            };
          }
          
          return {
            ...position,
            current_pnl: pnl_usd,
            current_price,
            margin_ratio,
            updated_at: new Date().toISOString()
          };
        } catch (error) {
          console.error(`Error updating P&L for position ${position.id}:`, error);
          return position;
        }
      });
      
      // Filter out liquidated positions from the display
      const activePositions = updatedPositions.filter(p => p.status === 'open');
      setTradingPositions(activePositions);
      
    } catch (error) {
      console.error('Error updating position P&L from unified data:', error);
    }
  };

  // LIVE: Update position P&L using Birdeye WebSocket every 1 second
  const updatePositionPnLLive = async () => {
    if (!walletAddress || tradingPositions.length === 0) return;

    try {
      // Get unique token addresses from positions
      const uniqueTokens = [...new Set(tradingPositions.map(p => p.token_address))];
      
      // Get fresh prices from Birdeye WebSocket (lightning fast)
      const freshPrices = getJupiterPrices(uniqueTokens);
      
      // Fallback to Birdeye REST API for any missing WebSocket prices
      const missingTokens = uniqueTokens.filter(token => !freshPrices[token]);
      if (missingTokens.length > 0) {
        console.log(`⚠️ Missing Birdeye WebSocket prices for ${missingTokens.length} tokens, using REST API fallback`);
        await Promise.all(
          missingTokens.map(async (tokenAddress) => {
            try {
              const tokenData = await fetchTokenDetailCached(tokenAddress);
              if (tokenData) {
                freshPrices[tokenAddress] = tokenData.price;
              }
            } catch (error) {
              // Silent fail for individual token price fetches
            }
          })
        );
      }

      const updatedPositions = tradingPositions.map((position) => {
        try {
          const freshPrice = freshPrices[position.token_address];
          
          if (!freshPrice) {
            // Keep current data if price fetch failed
            return position;
          }

          const currentPrice = freshPrice;
          const priceChange = currentPrice - position.entry_price;
          
          let pnl: number;
          if (position.direction === 'Long') {
            pnl = (priceChange / position.entry_price) * position.position_value_usd * position.leverage;
          } else { // Short
            pnl = -(priceChange / position.entry_price) * position.position_value_usd * position.leverage;
          }

          // Calculate margin ratio for liquidation risk
          const currentPositionValue = Math.abs(position.position_value_usd + pnl);
          const collateralValue = position.collateral_sol * (solPrice || 150);
          const margin_ratio = currentPositionValue > 0 ? collateralValue / currentPositionValue : 0;
          
          // Check for liquidation (margin ratio below 5%)
          const isLiquidated = margin_ratio < 0.05;

          // Update position P&L in database with fresh price
          if (isLiquidated && position.status === 'open') {
            console.log(`🔴 LIVE Position ${position.id} liquidated! Fresh price: $${currentPrice.toFixed(6)}, Margin ratio: ${(margin_ratio * 100).toFixed(1)}%`);
            positionService.liquidatePosition(position.id, currentPrice);
            
            return {
              ...position,
              status: 'liquidated' as const,
              current_pnl: pnl,
              current_price: currentPrice,
              margin_ratio: margin_ratio,
              updated_at: new Date().toISOString()
            };
          } else if (position.status === 'open') {
            positionService.updatePositionPnL(position.id, {
              position_id: position.id,
              price: currentPrice,
              pnl: pnl,
              margin_ratio: margin_ratio
            });
          }

          return {
            ...position,
            current_pnl: pnl,
            current_price: currentPrice,
            margin_ratio: margin_ratio,
            updated_at: new Date().toISOString()
          };
        } catch (error) {
          console.error(`Error updating LIVE P&L for position ${position.id}:`, error);
          return position;
        }
      });

      // Filter out liquidated positions from active display
      const activePositions = updatedPositions.filter(p => p.status === 'open');
      setTradingPositions(activePositions);

      const liquidatedCount = updatedPositions.length - activePositions.length;
      if (liquidatedCount > 0) {
        console.log(`⚠️ ${liquidatedCount} position(s) were liquidated with LIVE Birdeye prices`);
      }

      // Only log occasionally to avoid spam (every 5 seconds approximately)
      if (Date.now() % 5000 < 1000) {
        console.log(`⚡ Updated ${activePositions.length} positions with LIVE Birdeye prices`);
      }

    } catch (error) {
      console.error('Error updating positions with Birdeye WebSocket:', error);
    }
  };

  // Calculate total portfolio value including position P&L
  const calculateTotalPortfolioValue = () => {
    // Calculate total SOL collateral locked in active positions
    const lockedSOLCollateral = tradingPositions.reduce((total, position) => {
      return total + (position.collateral_sol || 0);
    }, 0);
    
    // Total SOL holdings = Available SOL + Locked SOL in positions
    const totalSOLHoldings = currentSOLBalance + lockedSOLCollateral;
    const totalSOLValue = totalSOLHoldings * solPrice;
    
    // Calculate total unrealized P&L from all active positions
    const totalPositionPnL = tradingPositions.reduce((total, position) => {
      return total + (position.current_pnl || 0);
    }, 0);
    
    // Total portfolio = USD balance + Total SOL value + unrealized P&L
    const totalValue = balance + totalSOLValue + totalPositionPnL;
    
    return {
      totalValue,
      collateralValue: totalSOLValue,
      tradingBalance: balance,
      positionPnL: totalPositionPnL,
      positionCount: tradingPositions.length,
      availableSOL: currentSOLBalance,
      lockedSOL: lockedSOLCollateral,
      totalSOL: totalSOLHoldings
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
    // 🎵 Copy action sound
    soundManager.playClick();
  };

  const handleCASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caInput.trim()) return;
    
    const tokenAddress = caInput.trim();
    
    setIsValidatingCA(true);
    setCaValidationError(null);
    
    try {
      console.log('🔍 Validating token market cap for:', tokenAddress);
      
      // Fetch token data to check market cap
      const tokenData = await fetchTokenDetailCached(tokenAddress);
      
      if (!tokenData) {
        setCaValidationError('Token not found or invalid contract address');
        return;
      }
      
      const marketCap = tokenData.marketCap || 0;
      const minimumMarketCap = 80000; // $80k minimum
      
      console.log('💰 Token market cap:', `$${marketCap.toLocaleString()}`);
      console.log('📊 Minimum required:', `$${minimumMarketCap.toLocaleString()}`);
      
      if (marketCap < minimumMarketCap) {
        setCaValidationError(
          `Market cap too low: $${marketCap.toLocaleString()}. ` +
          `Minimum required: $${minimumMarketCap.toLocaleString()}`
        );
        return;
      }
      
      console.log('✅ Token passes market cap validation, proceeding to trading...');
      
      // Token passes validation, proceed to trading
      setSelectedTokenAddress(tokenAddress);
      setViewState('token-detail');
      setCaInput('');
      setCaValidationError(null);
      
    } catch (error: any) {
      console.error('❌ Error validating token:', error);
      setCaValidationError('Failed to validate token. Please check the contract address and try again.');
    } finally {
      setIsValidatingCA(false);
    }
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
    // 🎵 Sound for opening buy modal
    soundManager.playModalOpen();
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
    // 🎵 Sound for opening sell modal
    soundManager.playModalOpen();
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
    setCaValidationError(null); // Clear any validation errors
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
        setWithdrawSuccess(`Withdrawal request submitted for ${amount.toFixed(4)} SOL. Withdrawal is being processed this typically takes up to 30 minutes.`);
        
        // Reload withdrawal requests to show the new one
        loadWithdrawalRequests();
        
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

  const handleDisconnectWallet = async () => {
    try {
      setShowSettings(false);
      
      // Force disconnect the wallet
      await disconnect();
      
      // Clear wallet-related localStorage (common wallet adapter keys)
      localStorage.removeItem('walletName');
      localStorage.removeItem('wallet-adapter-autoconnect');
      localStorage.removeItem('wallet-adapter-cached-wallet');
      
      // Clear any Phantom-specific storage
      localStorage.removeItem('phantom-wallet');
      localStorage.removeItem('solana-wallet');
      
      // Clear session storage
      sessionStorage.clear();
      
      console.log('✅ Wallet disconnected successfully');
      
      // Force page reload to ensure complete disconnection
      setTimeout(() => {
        window.location.reload();
      }, 500);
      
    } catch (error) {
      console.error('❌ Error disconnecting wallet:', error);
      // Force reload even if disconnect fails
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  const handleToggleSound = () => {
    const newSoundEnabled = !soundEnabled;
    setSoundEnabled(newSoundEnabled);
    soundManager.setSoundEnabled(newSoundEnabled);
    
    // Play feedback sound if sounds are being enabled
    if (newSoundEnabled) {
      soundManager.playSuccessChime();
      hapticFeedback.success();
    }
    
    console.log(`🎵 Sound ${newSoundEnabled ? 'enabled' : 'disabled'}`);
  };

  const handleBackToDashboard = () => {
    setViewState('dashboard');
  };

  const handleProfileSave = (profileData: { username: string; profilePicture?: string }) => {
    setCurrentUsername(profileData.username);
    setCurrentProfilePicture(profileData.profilePicture);
    setViewState('dashboard');
  };

  // Position modal handlers
  const handlePositionClick = (position: TradingPosition) => {
    setSelectedPosition(position);
    setShowPositionModal(true);
    // 🎵 Sound for opening position modal
    soundManager.playModalOpen();
  };

  const handleClosePositionModal = () => {
    setShowPositionModal(false);
    setSelectedPosition(null);
    setIsClosingPosition(false);
  };

  const handleClosePosition = async (positionId: number) => {
    // Check if position is already in closing status
    const position = tradingPositions.find(p => p.id === positionId);
    if (position?.status === 'closing') {
      console.log(`⚠️ Position ${positionId} is already closing (1-minute delay in progress)`);
      return;
    }
    
    // Prevent duplicate closing operations
    if (closingPositions.has(positionId)) {
      console.log(`⚠️ Position ${positionId} is already being closed, skipping duplicate operation`);
      return;
    }
    
    setIsClosingPosition(true);
    setClosingPositions(prev => new Set(prev).add(positionId));
    
            // 🎵 Position closing sound
    soundManager.play('trade_confirm', 'epic'); // Epic confirmation for closing
    
    // Show closing trade loading modal
    if (position) {
      setClosingTradeData({
        tokenSymbol: position.token_symbol,
        direction: position.direction,
        leverage: position.leverage,
        positionId: positionId
      });
      setShowClosingModal(true);
      
      // Auto-close loading modal after 65 seconds, then check for results
      setTimeout(async () => {
        setShowClosingModal(false);
        setClosingTradeData(null);
        
        // Check for trade results after closing modal
        await checkForTradeResults(positionId);
      }, 65000);
    }
    
    try {
      console.log('🔄 Closing position with FRESH price:', positionId);
      
      // 🚨 CRITICAL: Get FRESH price right before closing for maximum accuracy
      const position = tradingPositions.find(p => p.id === positionId);
      if (position) {
        console.log('⚡ GETTING FRESH PRICE FOR POSITION CLOSE...');
        
        try {
          const freshTokenData = await fetchTokenDetailCached(position.token_address);
          if (freshTokenData) {
            const freshPrice = freshTokenData.price;
            console.log('💰 FRESH PRICE FETCHED FOR CLOSE:', {
              position_id: positionId,
              token: position.token_symbol,
              entry_price: position.entry_price,
              cached_current_price: position.current_price || 'N/A',
              fresh_close_price: freshPrice,
              'FINAL_EXECUTION_PRICE': freshPrice
            });
          } else {
            console.log('⚠️ Fresh price fetch failed for position close, using existing price');
          }
        } catch (error) {
          console.log('⚠️ Error fetching fresh price for close, proceeding with existing price:', error);
        }
      }
      
      await positionService.closePosition(positionId, 'manual');
      
      // Reload positions to reflect the change
      await loadTradingPositions();
      
      console.log('✅ Position closed successfully with fresh price');
    } catch (error) {
      console.error('❌ Error closing position:', error);
    } finally {
      setIsClosingPosition(false);
      setClosingPositions(prev => {
        const newSet = new Set(prev);
        newSet.delete(positionId);
        return newSet;
      });
    }
  };

  // ADDED: Order management functions
  const handleEditOrderPrice = async (orderId: number) => {
    if (!newOrderPrice || parseFloat(newOrderPrice) <= 0) {
      console.error('Invalid price for order update');
      return;
    }

    try {
      console.log(`🔄 Updating order ${orderId} price to ${newOrderPrice}...`);
      
      // Update the order in the database
      const { error } = await supabase
        .from('trading_positions')
        .update({ 
          target_price: parseFloat(newOrderPrice),
          entry_price: parseFloat(newOrderPrice), // For limit orders, these should be the same
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
      
      if (error) {
        throw error;
      }
      
      console.log(`✅ Order ${orderId} price updated successfully`);
      
      // Update UI immediately
      setPendingOrders(prev => prev.map(order => 
        order.id === orderId 
          ? { ...order, target_price: parseFloat(newOrderPrice), entry_price: parseFloat(newOrderPrice) }
          : order
      ));
      
      // Reset edit state
      setIsEditingOrder(null);
      setNewOrderPrice('');
      
    } catch (error) {
      console.error(`Error updating order ${orderId}:`, error);
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    try {
      console.log(`🔄 Cancelling order ${orderId}...`);
      
      // Get the order details first to refund collateral
      const order = pendingOrders.find(o => o.id === orderId);
      if (!order) {
        throw new Error('Order not found');
      }
      
      // Cancel the order in database
      const { error: cancelError } = await supabase
        .from('trading_positions')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
      
      if (cancelError) {
        throw cancelError;
      }
      
      // Refund collateral + trading fee to user
      const profile = await userProfileService.getProfile(walletAddress);
      if (profile) {
        const refundAmount = order.collateral_sol + (order.trading_fee_sol || 0);
        const newSOLBalance = profile.sol_balance + refundAmount;
        
        const updated = await userProfileService.updateSOLBalance(walletAddress, newSOLBalance);
        if (updated && onUpdateSOLBalance) {
          onUpdateSOLBalance(newSOLBalance);
          setCurrentSOLBalance(newSOLBalance);
          console.log(`💰 Refunded ${refundAmount.toFixed(4)} SOL to user`);
        }
      }
      
      console.log(`✅ Order ${orderId} cancelled successfully`);
      
      // Remove order from UI
      setPendingOrders(prev => prev.filter(o => o.id !== orderId));
      
    } catch (error) {
      console.error(`Error cancelling order ${orderId}:`, error);
    }
  };

  // Check for trade results after closing modal completes
  const checkForTradeResults = async (positionId: number) => {
    try {
      console.log('🔍 Checking for trade results for position', positionId);
      
      // Get the position from database to check for trade results
      const { data: position, error } = await supabase
        .from('trading_positions')
        .select('trade_results')
        .eq('id', positionId)
        .single();
      
      if (error) {
        console.error('Error fetching position for trade results:', error);
        return;
      }
      
      if (position?.trade_results) {
        const tradeResults = JSON.parse(position.trade_results);
        console.log('📊 Found trade results for position', positionId, ':', tradeResults);
        
        setTradeResultsData(tradeResults);
        setShowTradeResults(true);
        
        // Clear trade results from database after displaying
        await supabase
          .from('trading_positions')
          .update({ trade_results: null })
          .eq('id', positionId);
          
        console.log('🧹 Cleared trade results from database for position', positionId);
      } else {
        console.log('⚠️ No trade results found for position', positionId);
      }
    } catch (error) {
      console.error('Error checking for trade results:', error);
    }
  };

  // Debug function to check profile status
  const debugProfile = async () => {
    if (!walletAddress) {
      console.log('❌ No wallet connected');
      return;
    }
    
    try {
      console.log('🔍 Debugging profile for wallet:', walletAddress);
      const profile = await userProfileService.getProfile(walletAddress);
      
      if (!profile) {
        console.log('❌ No profile found in database');
        return;
      }
      
      console.log('✅ Profile found in database:', {
        wallet_address: profile.wallet_address,
        username: profile.username,
        usd_balance: profile.balance,
        sol_balance: profile.sol_balance,
        created_at: profile.created_at,
        updated_at: profile.updated_at
      });
      
      console.log('📊 Current state comparison:', {
        db_sol_balance: profile.sol_balance,
        ui_sol_balance: currentSOLBalance,
        db_usd_balance: profile.balance,
        ui_usd_balance: balance
      });
      
    } catch (error) {
      console.error('💥 Error debugging profile:', error);
    }
  };

  // Show different views based on viewState
  if (viewState === 'token-detail') {
    return (
      <TokenDetail
        tokenAddress={selectedTokenAddress}
        onBack={handleBackFromTokenDetail}
        onBuy={handleBuyFromTokenDetail}
        userSOLBalance={currentSOLBalance}
        userUSDBalance={balance}
        walletAddress={walletAddress}
        onUpdateSOLBalance={(newBalance) => {
          setCurrentSOLBalance(newBalance);
          onUpdateSOLBalance(newBalance);
        }}
        onShowTerms={onShowTerms}
        onNavigateToPositions={() => {
          setViewState('dashboard');
          setActiveTab('positions');
        }}
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



  // Use real trading positions data
  const activePositions = tradingPositions.filter(position => 
    position.status === 'open' || position.status === 'pending'
  );

  const tabs = [
    { 
      id: 'home' as TabType, 
      label: 'Home', 
      icon: Home,
      badgeCount: 0 
    },
    { 
      id: 'rewards' as TabType, 
      label: 'Rewards', 
      icon: DollarSign,
      badgeCount: 0 
    },
    { 
      id: 'positions' as TabType, 
      label: 'Positions', 
      icon: TrendingUpIcon,
      badgeCount: activePositions.length 
    },
    { 
      id: 'orders' as TabType, 
      label: 'Orders', 
      icon: Activity,
      badgeCount: pendingOrders.length 
    },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'home':
        const homePortfolioData = calculateTotalPortfolioValue();
        
        return (
          <div className="text-center max-w-sm w-full px-4 mx-auto">
            {/* Character Icon - Properly sized */}
            <div className="mb-6">
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

            {/* Welcome Text - Properly sized */}
            <h1 className="text-2xl font-normal mb-3">
              Welcome Back, <span style={{ color: '#1e7cfa' }}>{currentUsername}</span>
            </h1>
            
            {/* Total Portfolio Balance - Properly sized */}
            <p className="text-gray-400 text-base mb-3">Your Trading Balance</p>
            <p className="text-3xl font-bold text-white mb-4">
              {formatCurrency(homePortfolioData.totalValue)}
            </p>

            {/* PnL - Properly sized */}
            <div className="flex items-center justify-center space-x-2 mb-6">
              {homePortfolioData.positionPnL >= 0 ? (
                <TrendingUp className="w-5 h-5 text-green-500" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-500" />
              )}
              <span className={`text-lg font-bold ${homePortfolioData.positionPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(homePortfolioData.positionPnL)}
              </span>
              <span className={`text-sm ${homePortfolioData.positionPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {homePortfolioData.positionCount > 0 ? `(${homePortfolioData.positionCount} position${homePortfolioData.positionCount > 1 ? 's' : ''})` : '(No positions)'}
              </span>
            </div>
            
            {/* CA Input - With Market Cap Validation */}
            <form onSubmit={handleCASubmit}>
              <div className="relative">
                <input
                  type="text"
                  value={caInput}
                  onChange={(e) => {
                    setCaInput(e.target.value);
                    setCaValidationError(null); // Clear error when typing
                  }}
                  placeholder="Enter Contract Address (CA)"
                  disabled={isValidatingCA}
                  className={`w-full bg-gray-900 border rounded-lg px-4 py-4 text-white text-base placeholder-gray-500 focus:outline-none transition-all pr-20 ${
                    caValidationError 
                      ? 'border-red-500 focus:border-red-400' 
                      : 'border-gray-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-400'
                  } ${isValidatingCA ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
                <button
                  type="submit"
                  disabled={!caInput.trim() || isValidatingCA}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 px-4 py-2 text-sm font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                  style={{ 
                    backgroundColor: (!caInput.trim() || isValidatingCA) ? '#374151' : '#1e7cfa',
                    color: (!caInput.trim() || isValidatingCA) ? '#9ca3af' : 'black'
                  }}
                >
                  {isValidatingCA ? (
                    <>
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle 
                          className="opacity-25" 
                          cx="12" 
                          cy="12" 
                          r="10" 
                          stroke="currentColor" 
                          strokeWidth="4"
                          fill="none"
                        />
                        <path 
                          className="opacity-75" 
                          fill="currentColor" 
                          d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <span>Checking...</span>
                    </>
                  ) : (
                    <span>Trade</span>
                  )}
                </button>
              </div>
              
              {/* Error Message */}
              {caValidationError && (
                <div className="mt-3 p-3 bg-red-900 border border-red-500 rounded-lg">
                  <p className="text-red-300 text-sm font-medium">
                    ⚠️ {caValidationError}
                  </p>
                </div>
              )}
            </form>
            
            <p className="text-gray-500 text-sm text-center mt-4">
              Enter a Pump.fun token contract address to start trading
              <br />
              <span className="text-xs text-gray-600">Minimum market cap: $80,000</span>
            </p>
          </div>
        );
      
      case 'rewards':
        return (
          <div className="text-center max-w-full w-full px-4">
            {/* Character Icon - Smaller for mobile */}
            <div className="mb-3">
              <div className="w-12 h-12 mx-auto">
                <img 
                  src="https://i.imgur.com/fWVz5td.png" 
                  alt="Pump Pumpkin Icon" 
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
            </div>

            {/* Rewards Title - Smaller */}
            <h1 className="text-lg font-normal mb-2">
              Your <span style={{ color: '#1e7cfa' }}>Rewards</span>
            </h1>
            
            {/* Lifetime Rewards - Smaller */}
            <p className="text-gray-400 text-xs mb-1">Lifetime Earnings</p>
            <p className="text-lg font-bold text-white mb-3">$0.00</p>

            {/* PPA Info - Compact */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-bold text-white mb-3">Buy PPA And Get Cash When Ever Someone Trades Using The Platform</h3>
              <p className="text-gray-400 text-xs mb-3">
                Purchase PPA tokens to earn passive income from all platform trading activity. 0.5% fee on all swaps.
              </p>
              
              {/* PPA Stats - Compact */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center">
                  <p className="text-sm font-bold text-white">{formatTokenAmount(userBalances.ppa)}</p>
                  <p className="text-gray-500 text-xs">PPA Owned</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-white">$0.00</p>
                  <p className="text-gray-500 text-xs">Daily Earnings</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-white">
                    {ppaPrice ? formatNumber(ppaPrice) : '0'}
                  </p>
                  <p className="text-gray-500 text-xs">PPA/SOL</p>
                </div>
              </div>

              {/* Action Buttons - Compact */}
              <div className="space-y-2">
                <button
                  onClick={() => {
                    handleBuyPPA();
                    // 🎵 Sound for trading action
                    soundManager.playPositionOpen();
                    hapticFeedback.medium();
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = '#1a6ce8';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = '#1e7cfa';
                  }}
                  className="btn-premium w-full text-black font-bold py-3 px-4 rounded-lg text-sm transition-colors"
                  style={{ backgroundColor: '#1e7cfa' }}
                >
                  Buy PPA Tokens
                </button>
                
                {userBalances.ppa > 0 && (
                  <button
                    onClick={() => {
                      handleSellPPA();
                      // 🎵 Sound for trading action
                      soundManager.playPositionClose();
                      hapticFeedback.medium();
                    }}
                    onMouseEnter={() => {
                    }}
                    className="btn-premium w-full bg-transparent border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white font-bold py-3 px-4 rounded-lg text-sm transition-colors"
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
          <div className="max-w-full w-full px-4">
            {/* Header with User Profile Image - Mobile optimized */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4">
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
              <h1 className="text-xl font-normal mb-2">
                Your <span style={{ color: '#1e7cfa' }}>Portfolio</span>
              </h1>
              <p className="text-gray-400 text-sm mb-2">Total Portfolio Value</p>
              <p className="text-2xl font-bold text-white mb-4">
                {formatCurrency(portfolioData.totalValue)}
              </p>
              
              {/* Portfolio Breakdown - Mobile optimized */}
              {portfolioData.positionCount > 0 && (
                <div className="mt-3 text-sm text-gray-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Available SOL:</span>
                    <span className="text-white">{formatCurrency(portfolioData.availableSOL * solPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Locked Collateral:</span>
                    <span className="text-orange-300">{formatCurrency(portfolioData.lockedSOL * solPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Position P&L:</span>
                    <span className={`${portfolioData.positionPnL >= 0 ? 'text-green-400' : 'text-red-400'} font-bold`}>
                      {portfolioData.positionPnL >= 0 ? '+' : ''}{formatCurrency(portfolioData.positionPnL)}
                    </span>
                  </div>
                  {portfolioData.tradingBalance > 0 && (
                    <div className="flex justify-between">
                      <span>Trading Balance:</span>
                      <span className="text-white">{formatCurrency(portfolioData.tradingBalance)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Unified Assets & Positions Card - Mobile optimized */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-6">
              {/* Deposit and Withdraw Buttons - Inside card */}
              <div className="flex space-x-3 mb-6">
                <button
                  onClick={() => {
                    setShowDepositModal(true);
                    // 🎵 Sound for deposit action
                    soundManager.playSuccessChime();
                    hapticFeedback.medium();
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = '#1a6ce8';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = '#1e7cfa';
                  }}
                  className="btn-premium flex-1 text-black font-bold py-3 px-4 rounded-lg text-sm transition-colors flex items-center justify-center space-x-2"
                  style={{ backgroundColor: '#1e7cfa' }}
                >
                  <Plus className="w-4 h-4" />
                  <span>Deposit</span>
                </button>
                
                <button
                  onClick={() => {
                    setShowWithdrawModal(true);
                    loadWithdrawalRequests();
                    // 🎵 Sound for withdraw action
                    soundManager.playClick();
                    hapticFeedback.light();
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = '#1a6ce8';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.backgroundColor = '#1e7cfa';
                  }}
                  disabled={currentSOLBalance < 0.04}
                  className="btn-premium flex-1 text-black font-bold py-3 px-4 rounded-lg text-sm transition-colors flex items-center justify-center space-x-2 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ 
                    backgroundColor: '#1e7cfa',
                    color: 'black'
                  }}
                >
                  <Minus className="w-4 h-4" />
                  <span>Withdraw</span>
                </button>
              </div>
              {/* Assets Section */}
              <div className="mb-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                  <Briefcase className="w-5 h-5 mr-2" />
                  Assets
                </h3>
                
                <div className="space-y-3">
                  {/* Available SOL */}
                  <div>
                    <p className="text-gray-400 text-sm mb-2">Available Balance</p>
                    <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden bg-gradient-to-r from-purple-400 to-green-400">
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
                            <p className="text-white font-bold text-sm">SOL</p>
                            <p className="text-gray-400 text-xs">Available for trading</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-bold text-sm">{currentSOLBalance.toFixed(4)} SOL</p>
                          <p className="text-gray-400 text-xs">{formatCurrency(currentSOLBalance * solPrice)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Locked Collateral - Only show if user has active positions */}
                  {portfolioData.lockedSOL > 0 && (
                    <div>
                      <p className="text-gray-400 text-sm mb-2">Locked in Positions</p>
                      <div className="bg-gray-800 border border-orange-600 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden bg-gradient-to-r from-orange-400 to-red-400">
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
                              <p className="text-orange-300 font-bold text-sm">SOL</p>
                              <p className="text-orange-400 text-xs">Collateral in {portfolioData.positionCount} position{portfolioData.positionCount !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-orange-300 font-bold text-sm">{portfolioData.lockedSOL.toFixed(4)} SOL</p>
                            <p className="text-orange-400 text-xs">{formatCurrency(portfolioData.lockedSOL * solPrice)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Positions Section */}
              <div>
                <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Active Positions
                </h3>
                
                {isLoadingPositions ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, index) => (
                      <div key={index} className="bg-gray-800 border border-gray-600 rounded-lg p-4 animate-pulse min-h-[120px]">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gray-700 rounded-full"></div>
                            <div>
                              <div className="w-16 h-4 bg-gray-700 rounded mb-2"></div>
                              <div className="w-12 h-3 bg-gray-600 rounded"></div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="w-20 h-4 bg-gray-700 rounded mb-2"></div>
                            <div className="w-16 h-3 bg-gray-600 rounded"></div>
                          </div>
                        </div>
                        <div className="w-full h-2 bg-gray-700 rounded"></div>
                      </div>
                    ))}
                  </div>
                ) : activePositions.length > 0 ? (
                  <div className="space-y-4">
                    {activePositions.map((position) => {
                      const isPositive = position.current_pnl >= 0;
                      const pnlPercent = position.position_value_usd > 0 
                        ? (position.current_pnl / position.position_value_usd) * 100 
                        : 0;
                      
                      // Add warning styling for positions close to liquidation
                      const isNearLiquidation = (position.margin_ratio || 0) >= 0.8;
                      const isInDanger = (position.margin_ratio || 0) >= 0.9;
                      
                      return (
                        <div key={position.id} className="space-y-2">
                          {/* Decorative line with leverage label */}
                          <div className="relative flex items-center justify-center py-2">
                            <div className="absolute inset-0 flex items-center">
                              <div className="w-full border-t border-gray-600"></div>
                            </div>
                            <div className="relative flex justify-center">
                              <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                                position.direction === 'Long' 
                                  ? 'bg-green-900 text-green-300 border border-green-600' 
                                  : 'bg-red-900 text-red-300 border border-red-600'
                              }`}>
                                {position.leverage}x {position.direction}
                              </span>
                            </div>
                          </div>
                          
                          {/* Position Card */}
                          <div 
                            onClick={() => {
                              handlePositionClick(position);
                              // 🎵 Sound for position interaction
                              soundManager.playClick();
                              hapticFeedback.light();
                            }}
                            onMouseEnter={() => {
                            }}
                            className={`card-premium rounded-lg p-4 cursor-pointer transition-all min-h-[130px] ${
                              isInDanger ? 'position-danger bg-red-900 border-2 border-red-500' : 
                              isNearLiquidation ? 'bg-orange-900 border-2 border-orange-500' : 
                              isPositive ? 'position-profit bg-gray-800 border border-gray-600 hover:border-green-500' :
                              position.current_pnl < -5 ? 'position-loss bg-gray-800 border border-gray-600 hover:border-red-500' :
                              'bg-gray-800 border border-gray-600 hover:border-gray-500'
                            }`}
                          >
                          {/* Header with token info and position value */}
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden bg-gray-700">
                                {/* Show token image from Birdeye API or fallback to symbol */}
                                {position.token_image ? (
                                  <img 
                                    src={position.token_image}
                                    alt={position.token_symbol}
                                    className="w-full h-full object-cover rounded-full"
                                    onError={(e) => {
                                      // If image fails to load, show symbol fallback
                                      const target = e.currentTarget as HTMLImageElement;
                                      target.style.display = 'none';
                                      const parent = target.parentElement as HTMLDivElement;
                                      if (parent) {
                                        parent.innerHTML = `<span class="text-white text-xs font-bold">${position.token_symbol.charAt(0)}</span>`;
                                      }
                                    }}
                                  />
                                ) : (
                                  <span className="text-white text-xs font-bold">{position.token_symbol.charAt(0)}</span>
                                )}
                              </div>
                              <div>
                                <div className="flex items-center space-x-2 mb-1">
                                  <span className="text-white font-bold text-sm">{position.token_symbol}</span>
                                  <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                                    position.direction === 'Long' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                                  }`}>
                                    {position.leverage}x {position.direction}
                                  </span>
                                </div>
                                {position.status === 'opening' && (
                                  <span className="text-xs px-2 py-1 rounded-full bg-blue-900 text-blue-400 font-bold animate-pulse">
                                    OPENING...
                                  </span>
                                )}
                                {position.status === 'closing' && (
                                  <span className="text-xs px-2 py-1 rounded-full bg-yellow-900 text-yellow-400 font-bold animate-pulse">
                                    CLOSING...
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-white text-sm font-bold">
                                {formatCurrency(position.position_value_usd)}
                              </p>
                              <p className={`text-xs font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                                {isPositive ? '+' : ''}{formatCurrency(position.current_pnl)}
                              </p>
                              <p className={`text-xs ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                                ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%)
                              </p>
                            </div>
                          </div>
                          
                          {/* Price information - clearly displayed */}
                          <div className="grid grid-cols-2 gap-4 mb-3 text-xs">
                            <div>
                              <span className="text-gray-400">Entry Price:</span>
                              <p className="text-white font-medium">{formatPrice(position.entry_price)}</p>
                            </div>
                            <div>
                              <span className="text-gray-400 flex items-center space-x-1">
                                <span>Live Price:</span>
                                {tokenPrices[position.token_address] && (
                                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                                )}
                              </span>
                              <p className="text-white font-medium">{formatPrice(tokenPrices[position.token_address] || position.entry_price)}</p>
                            </div>
                          </div>
                          
                          {/* Progress bar showing margin ratio */}
                          <div className="mt-3">
                            <div className="flex justify-between text-xs mb-1">
                              <span className={isInDanger ? 'text-red-300 font-bold' : isNearLiquidation ? 'text-orange-300 font-bold' : 'text-gray-400'}>
                                Margin Health
                              </span>
                              <span className={isInDanger ? 'text-red-300 font-bold' : isNearLiquidation ? 'text-orange-300 font-bold' : 'text-gray-400'}>
                                {position.margin_ratio ? `${(position.margin_ratio * 100).toFixed(1)}%` : 'Healthy'}
                              </span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full transition-all duration-300 ${
                                  (position.margin_ratio || 0) >= 0.8 ? 'bg-red-500' : 
                                  (position.margin_ratio || 0) >= 0.6 ? 'bg-yellow-500' : 
                                  'bg-green-500'
                                }`}
                                style={{ width: `${Math.min((position.margin_ratio || 0) * 100, 100)}%` }}
                              ></div>
                            </div>
                            
                            {/* Warning messages */}
                            {isInDanger && position.status === 'open' && (
                              <div className="mt-2 text-xs text-red-300 font-bold animate-pulse">
                                ⚠️ LIQUIDATION IMMINENT - POSITION AT EXTREME RISK!
                              </div>
                            )}
                            {isNearLiquidation && !isInDanger && position.status === 'open' && (
                              <div className="mt-2 text-xs text-orange-300 font-bold">
                                ⚠️ Margin call triggered - Add collateral or close position
                              </div>
                            )}
                          </div>
                          </div>
                        </div>
                      );
                    })}
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

            {/* Trending Tokens Section - Mobile optimized */}
            <div>
              <h3 className="text-lg font-bold text-white mb-4 flex items-center">
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
                            <div className="w-16 h-4 bg-gray-700 rounded mb-2"></div>
                            <div className="w-12 h-3 bg-gray-800 rounded"></div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="w-20 h-4 bg-gray-700 rounded mb-2"></div>
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
                            <span className={`text-xs font-bold text-white ${token.logoURI ? 'hidden' : 'flex'}`}>
                              {token.symbol.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="text-white font-bold text-sm">{token.symbol}</p>
                            <p className="text-gray-400 text-xs">
                              {token.name.length > 20 ? `${token.name.substring(0, 20)}...` : token.name}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-white text-sm font-bold">
                            {formatPrice(token.price)}
                          </p>
                          <p className={`text-xs font-bold ${
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
      
      case 'orders':
        return (
          <div className="max-w-lg w-full px-4">
            {/* Header with User Profile Image - Much larger */}
            <div className="text-center mb-10">
              <div className="w-28 h-28 mx-auto mb-6">
                {currentProfilePicture ? (
                  <img 
                    src={currentProfilePicture} 
                    alt="Profile Picture" 
                    className="w-full h-full object-cover rounded-xl"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-800 rounded-xl flex items-center justify-center">
                    <User className="w-12 h-12 text-gray-500" />
                  </div>
                )}
              </div>
              <h1 className="text-4xl font-normal mb-4">
                Orders & <span style={{ color: '#1e7cfa' }}>History</span>
              </h1>
              <p className="text-gray-400 text-xl mb-4">Manage Orders & View Trade History</p>
              <p className="text-gray-500 text-lg">
                {pendingOrders.length} pending • {tradeHistory.length} completed
              </p>
            </div>

            {/* Active Orders Section - Much larger */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 mb-10">
              <h3 className="text-2xl font-bold text-white mb-6 flex items-center">
                <ArrowUpDown className="w-7 h-7 mr-3" />
                Pending Limit Orders
              </h3>
              
              {isLoadingOrders ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, index) => (
                    <div key={index} className="bg-gray-800 border border-gray-600 rounded-lg p-4 animate-pulse">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-gray-700 rounded-full"></div>
                          <div>
                            <div className="w-16 h-4 bg-gray-700 rounded mb-1"></div>
                            <div className="w-12 h-3 bg-gray-600 rounded"></div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="w-20 h-4 bg-gray-700 rounded mb-1"></div>
                          <div className="w-16 h-3 bg-gray-600 rounded"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : pendingOrders.length > 0 ? (
                <div className="space-y-3">
                  {pendingOrders.map((order) => {
                    const isEditing = isEditingOrder === order.id;
                    const currentMarketPrice = order.current_price || 0;
                    const targetPrice = order.target_price || order.entry_price;
                    const priceDistance = Math.abs(currentMarketPrice - targetPrice);
                    const priceDistancePercent = currentMarketPrice > 0 ? (priceDistance / currentMarketPrice) * 100 : 0;
                    
                    // Determine if order is close to triggering
                    const isCloseToTrigger = priceDistancePercent < 5; // Within 5%
                    
                    return (
                      <div 
                        key={order.id} 
                        className={`rounded-lg p-4 transition-all ${
                          isCloseToTrigger ? 'bg-yellow-900 border-2 border-yellow-500' : 
                          'bg-gray-800 border border-gray-600'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-gray-700">
                              {order.token_image ? (
                                <img 
                                  src={order.token_image}
                                  alt={order.token_symbol}
                                  className="w-full h-full object-cover rounded-full"
                                  onError={(e) => {
                                    const target = e.currentTarget as HTMLImageElement;
                                    target.style.display = 'none';
                                    const parent = target.parentElement as HTMLDivElement;
                                    if (parent) {
                                      parent.innerHTML = `<span class="text-white text-xs font-bold">${order.token_symbol.charAt(0)}</span>`;
                                    }
                                  }}
                                />
                              ) : (
                                <span className="text-white text-xs font-bold">{order.token_symbol.charAt(0)}</span>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-white font-medium">{order.token_symbol}</span>
                                <span className={`text-xs px-2 py-1 rounded ${
                                  order.direction === 'Long' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                                }`}>
                                  {order.leverage}x {order.direction}
                                </span>
                              </div>
                              <div className="flex items-center space-x-2 text-xs text-gray-400">
                                <span>Target: {formatPrice(targetPrice)}</span>
                                <span>•</span>
                                <span>Market: {formatPrice(currentMarketPrice)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-white text-sm font-medium">
                              {formatCurrency(order.position_value_usd)}
                            </p>
                            <p className="text-gray-400 text-xs">
                              {priceDistancePercent.toFixed(1)}% away
                            </p>
                          </div>
                        </div>
                        
                        {/* Order Management Buttons */}
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              type="number"
                              value={newOrderPrice}
                              onChange={(e) => setNewOrderPrice(e.target.value)}
                              placeholder="New limit price"
                              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-400 text-center"
                              step="0.000001"
                              autoFocus
                            />
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleEditOrderPrice(order.id)}
                                disabled={!newOrderPrice || parseFloat(newOrderPrice) <= 0}
                                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs px-3 py-2 rounded transition-colors"
                              >
                                Update
                              </button>
                              <button
                                onClick={() => {
                                  setIsEditingOrder(null);
                                  setNewOrderPrice('');
                                }}
                                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white text-xs px-3 py-2 rounded transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setIsEditingOrder(order.id);
                                setNewOrderPrice(targetPrice.toString());
                              }}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-2 rounded transition-colors"
                            >
                              Edit Price
                            </button>
                            <button
                              onClick={() => handleCancelOrder(order.id)}
                              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-2 rounded transition-colors"
                            >
                              Cancel Order
                            </button>
                          </div>
                        )}
                        
                        {/* Close to trigger warning */}
                        {isCloseToTrigger && (
                          <div className="mt-2 text-xs text-yellow-300 font-bold">
                            Warning: Order may trigger soon! Market price within {priceDistancePercent.toFixed(1)}% of target
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 text-center">
                  <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <ArrowUpDown className="w-6 h-6 text-gray-500" />
                  </div>
                  <p className="text-gray-400 text-sm mb-2">No pending orders</p>
                  <p className="text-gray-500 text-xs">Limit orders you place will appear here</p>
                </div>
              )}
            </div>

            {/* Order Management Tips */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-8">
              <h4 className="text-white font-medium mb-2 text-sm">Order Management</h4>
              <div className="space-y-2 text-xs text-gray-400">
                <div className="flex items-start space-x-2">
                  <span className="text-blue-400">•</span>
                  <span>Edit prices anytime before execution</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-green-400">•</span>
                  <span>Orders execute automatically when market price hits target</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-red-400">•</span>
                  <span>Cancel orders to get collateral refunded instantly</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-yellow-400">•</span>
                  <span>Yellow highlight means order is close to triggering</span>
                </div>
              </div>
            </div>

            {/* Enhanced Trade History Section */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-4">
              {/* Header with Stats */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <History className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-semibold text-white">Recent Trades</h3>
                  {tradeHistory.length > 0 && (
                    <span className="bg-blue-600/20 text-blue-400 px-2 py-1 rounded-full text-xs font-bold">
                      {tradeHistory.length}
                    </span>
                  )}
                </div>
                {tradeHistory.length > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Total Trades</p>
                    <p className="text-sm font-bold text-white">{tradeHistory.length}</p>
                  </div>
                )}
              </div>

              {/* Performance Summary */}
              {tradeHistory.length > 0 && (
                <div className="bg-gray-800/50 rounded-lg p-3 grid grid-cols-3 gap-3">
                  {(() => {
                    const completedTrades = tradeHistory.filter(t => t.status === 'closed');
                    const totalPnL = completedTrades.reduce((sum, trade) => sum + (trade.current_pnl || 0), 0);
                    const winningTrades = completedTrades.filter(t => (t.current_pnl || 0) > 0).length;
                    const winRate = completedTrades.length > 0 ? (winningTrades / completedTrades.length) * 100 : 0;
                    
                    return (
                      <>
                        <div className="text-center">
                          <p className="text-xs text-gray-400 mb-1">Total P&L</p>
                          <p className={`text-sm font-bold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-400 mb-1">Win Rate</p>
                          <p className={`text-sm font-bold ${winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                            {winRate.toFixed(0)}%
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-400 mb-1">Wins/Total</p>
                          <p className="text-sm font-bold text-white">
                            {winningTrades}/{completedTrades.length}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
              
              {isLoadingTradeHistory ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, index) => (
                    <div key={index} className="bg-gray-800 border border-gray-600 rounded-lg p-3 animate-pulse">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-gray-700 rounded-full"></div>
                          <div>
                            <div className="w-16 h-3 bg-gray-700 rounded mb-1"></div>
                            <div className="w-12 h-2 bg-gray-600 rounded"></div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="w-16 h-3 bg-gray-700 rounded mb-1"></div>
                          <div className="w-12 h-2 bg-gray-600 rounded"></div>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-gray-700 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : tradeHistory.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                  {tradeHistory.map((trade, index) => {
                    const isProfit = (trade.current_pnl || 0) >= 0;
                    const wasLiquidated = trade.status === 'liquidated';
                    const wasCancelled = trade.status === 'cancelled';
                    const pnlPercent = (trade.current_pnl || 0) / (trade.collateral_sol * solPrice) * 100;
                    
                    // Format date - more compact for mobile
                    const tradeDate = new Date(trade.closed_at || trade.updated_at);
                    const now = new Date();
                    const diffTime = Math.abs(now.getTime() - tradeDate.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    let timeAgo = '';
                    if (diffDays === 1) {
                      timeAgo = 'Today';
                    } else if (diffDays === 2) {
                      timeAgo = 'Yesterday';
                    } else if (diffDays <= 7) {
                      timeAgo = `${diffDays}d ago`;
                    } else {
                      timeAgo = tradeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }
                    
                    // Calculate trade duration if available
                    let tradeDuration = '';
                    if (trade.created_at && trade.closed_at) {
                      const startTime = new Date(trade.created_at);
                      const endTime = new Date(trade.closed_at);
                      const durationMs = endTime.getTime() - startTime.getTime();
                      const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
                      const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                      
                      if (durationHours > 0) {
                        tradeDuration = `${durationHours}h ${durationMinutes}m`;
                      } else {
                        tradeDuration = `${durationMinutes}m`;
                      }
                    }
                    
                    return (
                      <div 
                        key={trade.id} 
                        className={`rounded-lg p-3 border transition-all relative overflow-hidden ${
                          wasLiquidated ? 'bg-red-950/50 border-red-600/30' :
                          wasCancelled ? 'bg-gray-800/50 border-gray-600/30' :
                          isProfit ? 'bg-green-950/50 border-green-600/30' : 
                          'bg-red-950/50 border-red-600/30'
                        }`}
                      >

                        
                        {/* Main trade info */}
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center space-x-3 flex-1">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden bg-gray-700 border border-gray-600">
                              {trade.token_image ? (
                                <img 
                                  src={trade.token_image}
                                  alt={trade.token_symbol}
                                  className="w-full h-full object-cover rounded-xl"
                                  onError={(e) => {
                                    const target = e.currentTarget as HTMLImageElement;
                                    target.style.display = 'none';
                                    const parent = target.parentElement as HTMLDivElement;
                                    if (parent) {
                                      parent.innerHTML = `<span class="text-white text-sm font-bold">${trade.token_symbol.charAt(0)}</span>`;
                                    }
                                  }}
                                />
                              ) : (
                                <span className="text-white text-sm font-bold">{trade.token_symbol.charAt(0)}</span>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-white font-semibold text-sm">{trade.token_symbol}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                  trade.direction === 'Long' ? 'bg-green-800/50 text-green-300 border border-green-600/30' : 'bg-red-800/50 text-red-300 border border-red-600/30'
                                }`}>
                                  {trade.leverage}x {trade.direction}
                                </span>
                              </div>
                              
                                                             {/* Status badges */}
                               <div className="flex items-center space-x-2 mb-1">
                                 {wasLiquidated && (
                                   <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-red-100 font-bold animate-pulse">
                                     LIQUIDATED
                                   </span>
                                 )}
                                 {wasCancelled && (
                                   <span className="text-xs px-2 py-0.5 rounded-full bg-gray-600/50 text-gray-300 border border-gray-500/30">
                                     CANCELLED
                                   </span>
                                 )}
                                 {!wasLiquidated && !wasCancelled && (
                                   <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                     isProfit ? 'bg-green-600/20 text-green-400 border border-green-500/30' : 'bg-red-600/20 text-red-400 border border-red-500/30'
                                   }`}>
                                     {isProfit ? 'PROFIT' : 'LOSS'}
                                   </span>
                                 )}
                               </div>
                              
                                                             {/* Trade details */}
                               <div className="flex items-center space-x-3 text-xs text-gray-400">
                                 <span>{timeAgo}</span>
                                 {tradeDuration && (
                                   <>
                                     <span>•</span>
                                     <span>{tradeDuration}</span>
                                   </>
                                 )}
                               </div>
                            </div>
                          </div>
                          
                          {/* P&L Display */}
                          <div className="text-right">
                            {!wasCancelled ? (
                              <>
                                <p className={`text-lg font-bold ${
                                  wasLiquidated ? 'text-red-400' :
                                  isProfit ? 'text-green-400' : 'text-red-400'
                                }`}>
                                  {isProfit ? '+' : ''}{formatCurrency(trade.current_pnl || 0)}
                                </p>
                                <p className={`text-sm font-semibold ${
                                  wasLiquidated ? 'text-red-300' :
                                  isProfit ? 'text-green-300' : 'text-red-300'
                                }`}>
                                  {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
                                </p>
                              </>
                            ) : (
                              <div className="text-center">
                                <p className="text-gray-400 text-sm font-medium">Cancelled</p>
                                <p className="text-gray-500 text-xs">No P&L</p>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Price action bar */}
                        {!wasCancelled && (
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="bg-gray-800/30 rounded-lg p-2">
                              <p className="text-gray-400 mb-1">Entry Price</p>
                              <p className="text-white font-semibold">{formatPrice(trade.entry_price)}</p>
                            </div>
                            {trade.close_price && (
                              <div className="bg-gray-800/30 rounded-lg p-2">
                                <p className="text-gray-400 mb-1">Exit Price</p>
                                <p className="text-white font-semibold">{formatPrice(trade.close_price)}</p>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Performance indicator bar */}
                        {!wasCancelled && !wasLiquidated && (
                          <div className="mt-2">
                            <div className="w-full bg-gray-700 rounded-full h-1">
                              <div 
                                className={`h-1 rounded-full transition-all duration-300 ${
                                  isProfit ? 'bg-gradient-to-r from-green-600 to-green-400' : 'bg-gradient-to-r from-red-600 to-red-400'
                                }`}
                                style={{ 
                                  width: `${Math.min(Math.abs(pnlPercent) * 2, 100)}%` 
                                }}
                              ></div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-gray-800/30 border border-gray-600/30 rounded-xl p-8 text-center">
                  <div className="w-16 h-16 bg-gray-700/50 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <History className="w-8 h-8 text-gray-500" />
                  </div>
                  <h4 className="text-white font-semibold text-lg mb-2">No Trading History</h4>
                  <p className="text-gray-400 text-sm mb-4">Start trading to see your completed positions here</p>
                  <button
                    onClick={() => setActiveTab('home')}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors"
                  >
                    Start Trading
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
      {/* Enhanced Mobile Header */}
      <div className="sticky top-0 z-40 bg-gradient-to-b from-black via-black/95 to-transparent backdrop-blur-md border-b border-gray-800/50">
        <div className="flex items-center justify-between p-4">
          {/* Left Side - Settings with Quick Access */}
          <div className="relative">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-3 bg-gray-800/50 rounded-xl text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all duration-200 active:scale-95 border border-gray-700/50 ${
                showSettings ? 'bg-blue-600/20 border-blue-500/30 text-blue-400' : ''
              }`}
            >
              <Settings className="w-6 h-6" />
            </button>
            
            {/* Quick Settings Dropdown */}
            {showSettings && (
              <>
                {/* Backdrop to close dropdown */}
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowSettings(false)}
                ></div>
                
                <div className="absolute top-full left-0 mt-2 w-56 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 py-2">
                <div className="px-4 py-2 border-b border-gray-700">
                  <p className="text-white font-semibold text-sm">Quick Actions</p>
                </div>
                
                <button
                  onClick={() => {
                    handleEditProfile();
                    setShowSettings(false);
                  }}
                  className="w-full flex items-center space-x-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800 transition-colors text-left"
                >
                  <User className="w-5 h-5" />
                  <span className="text-sm">Edit Profile</span>
                </button>
                
                <button
                  onClick={handleToggleSound}
                  className="w-full flex items-center justify-between px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="flex items-center space-x-3">
                    {soundEnabled ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M7.5 12H3a1 1 0 01-1-1V9a1 1 0 011-1h4.5l4.95-4.95a1 1 0 011.414 0 1 1 0 01.293.707V19.5a1 1 0 01-.293.707 1 1 0 01-1.414 0L7.5 15z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                    )}
                    <span className="text-sm">Sounds</span>
                  </div>
                  <div className={`w-10 h-6 rounded-full p-1 transition-colors ${soundEnabled ? 'bg-blue-600' : 'bg-gray-600'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${soundEnabled ? 'translate-x-4' : 'translate-x-0'}`}></div>
                  </div>
                </button>
                
                <div className="border-t border-gray-700 mt-2">
                  <button
                    onClick={() => {
                      onShowTerms();
                      setShowSettings(false);
                    }}
                    className="w-full flex items-center space-x-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-800 transition-colors text-left"
                  >
                    <ExternalLink className="w-5 h-5" />
                    <span className="text-sm">Terms of Service</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      handleDisconnectWallet();
                      setShowSettings(false);
                    }}
                    className="w-full flex items-center space-x-3 px-4 py-3 text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors text-left"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="text-sm">Disconnect Wallet</span>
                                     </button>
                 </div>
               </div>
               </>
             )}
          </div>
          
          {/* Center - App Logo/Title */}
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8">
              <img 
                src="https://i.imgur.com/fWVz5td.png" 
                alt="Pump Pumpkin" 
                className="w-full h-full object-cover rounded-lg"
              />
            </div>
            <span className="text-white font-bold text-lg">Pump Pumpkin</span>
          </div>
          
          {/* Right Side - Wallet Info */}
          <button 
            onClick={handleCopyAddress}
            className="flex items-center space-x-2 bg-gray-800/50 rounded-xl px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all duration-200 active:scale-95 border border-gray-700/50"
          >
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium">
              {formatWalletAddress(walletAddress)}
            </span>
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Enhanced Main Content with better scrolling */}
      <div className="flex-1 flex items-center justify-center p-4 pb-32 overflow-y-auto">
        <div className="w-full max-w-lg mx-auto">
          {renderTabContent()}
        </div>
      </div>

      {/* Enhanced Mobile Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black to-gray-900 border-t border-gray-700 shadow-2xl">
        <div className="flex items-center justify-around py-4 px-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const hasBadge = tab.badgeCount > 0;
            
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  // 🎵 Enhanced Audio & Haptic Feedback
                  if (!isActive) {
                    soundManager.playSwitch();
                    hapticFeedback.medium();
                  } else {
                    soundManager.playTap();
                    hapticFeedback.light();
                  }
                }}
                onMouseEnter={() => {
                  if (!isActive) {
                  }
                }}
                className={`tab-enhanced ${isActive ? 'active' : ''} relative flex flex-col items-center space-y-1 px-4 py-3 rounded-xl transition-all duration-200 transform ${
                  isActive 
                    ? 'text-white bg-blue-600/20 border border-blue-500/30 scale-105 shadow-lg shadow-blue-500/25' 
                    : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/50 hover:scale-105 active:scale-95'
                }`}
                style={{
                  minWidth: '70px',
                  minHeight: '64px'
                }}
              >
                {/* Icon Container with Badge */}
                <div className="relative">
                  <Icon className={`w-6 h-6 transition-all duration-200 ${
                    isActive ? 'text-blue-400' : 'text-inherit'
                  }`} />
                  
                  {/* Notification Badge */}
                  {hasBadge && (
                    <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center border-2 border-black animate-pulse">
                      {tab.badgeCount > 99 ? '99+' : tab.badgeCount}
                    </div>
                  )}
                </div>
                
                {/* Label */}
                <span className={`text-xs font-semibold transition-all duration-200 ${
                  isActive ? 'text-white' : 'text-inherit'
                }`}>
                  {tab.label}
                </span>
                
                {/* Active Indicator */}
                {isActive && (
                  <div className="absolute -bottom-1 w-8 h-1 rounded-full bg-gradient-to-r from-blue-400 to-blue-600 animate-pulse"></div>
                )}
                
                {/* Glow Effect for Active Tab */}
                {isActive && (
                  <div className="absolute inset-0 rounded-xl bg-blue-400/10 blur-sm"></div>
                )}
              </button>
            );
          })}
        </div>
        
        {/* Safe Area for devices with home indicators */}
        <div className="h-2 bg-transparent"></div>
      </div>



      {/* Deposit Modal - Styled like Connect Wallet */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-3 z-50">
          <div className="text-center max-w-xs w-full">
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
        <div className="fixed inset-0 bg-black flex items-center justify-center p-3 z-50">
          <div className="text-center max-w-xs w-full">
            <div className="flex justify-end mb-4">
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

            <div className="mb-4">
              <div className="w-16 h-16 mx-auto">
                <img 
                  src="https://i.imgur.com/fWVz5td.png" 
                  alt="Pump Pumpkin Icon" 
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
            </div>

            <h1 className="text-2xl font-normal mb-2">
              <span style={{ color: '#1e7cfa' }}>Withdraw</span> SOL
            </h1>
            
            <p className="text-gray-400 text-base mb-2">Request SOL Withdrawal</p>
            
            <p className="text-gray-500 text-sm mb-1">Available: {currentSOLBalance.toFixed(4)} SOL</p>
            <p className="text-gray-500 text-sm mb-6">Minimum withdrawal: 0.04 SOL</p>

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

            <div className="mb-6">
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
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-3 text-white text-base placeholder-gray-500 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all text-center disabled:opacity-50"
              />
            </div>

            <button
              onClick={handleWithdraw}
              disabled={!withdrawAmount || parseFloat(withdrawAmount) < 0.04 || parseFloat(withdrawAmount) > currentSOLBalance || isWithdrawing}
              className="w-full text-black font-medium py-3 px-4 rounded-lg text-base transition-colors disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed mb-4 flex items-center justify-center space-x-2"
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

            {/* Withdrawal History Card */}
            <div className="mt-4 mb-4">
              <h3 className="text-sm font-medium text-gray-300 mb-2">Recent Withdrawals</h3>
              
              {isLoadingWithdrawals ? (
                <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
                  <div className="flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400 mr-2" />
                    <span className="text-gray-400 text-sm">Loading...</span>
                  </div>
                </div>
              ) : withdrawalRequests.length > 0 ? (
                <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
                  {withdrawalRequests.slice(0, 3).map((request) => (
                    <div key={request.id} className="bg-gray-800 border border-gray-600 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white text-sm font-medium">{parseFloat(request.amount.toString()).toFixed(4)} SOL</p>
                          <p className="text-gray-400 text-xs">
                            {new Date(request.created_at).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          {request.status === 'pending' ? (
                            <span className="text-gray-400 text-xs font-medium">pending...</span>
                          ) : request.status === 'completed' ? (
                            <span className="text-green-400 text-xs font-medium">successful</span>
                          ) : request.status === 'approved' ? (
                            <span className="text-blue-400 text-xs font-medium">approved</span>
                          ) : (
                            <span className="text-red-400 text-xs font-medium">rejected</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 text-center">
                  <p className="text-gray-400 text-sm">No withdrawal requests yet</p>
                </div>
              )}
            </div>

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
        <div className="fixed inset-0 bg-black flex items-center justify-center p-2 z-50">
          <div className="bg-black w-full max-w-sm mx-auto">
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
        <div className="fixed inset-0 bg-black flex items-center justify-center p-2 z-50">
          <div className="bg-black w-full max-w-sm mx-auto text-center">
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
                (e.target as HTMLElement).style.backgroundColor = '#1a6ce8';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.backgroundColor = '#1e7cfa';
              }}
            >
              Continue Trading
            </button>
          </div>
        </div>
      )}

      {/* Transaction Verification Loading Modal */}
      {isVerifyingTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-3 z-50">
          <div className="text-center max-w-xs w-full">
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



      {/* Position Management Modal */}
      {showPositionModal && selectedPosition && (
        <PositionModal
          position={selectedPosition}
          onClose={handleClosePositionModal}
          onClosePosition={handleClosePosition}
          isClosingPosition={isClosingPosition}
          solPrice={solPrice}
        />
      )}
      
      {/* Closing Trade Loading Modal */}
      <TradeLoadingModal
        isOpen={showClosingModal}
        type="closing"
        tokenSymbol={closingTradeData?.tokenSymbol || ''}
        direction={closingTradeData?.direction}
        leverage={closingTradeData?.leverage}
        onClose={() => {
          setShowClosingModal(false);
          setClosingTradeData(null);
        }}
        canCancel={false} // Don't allow cancelling during anti-gaming delay
      />
      
      {/* Trade Results Modal */}
      <TradeResultsModal
        isOpen={showTradeResults}
        onClose={() => {
          setShowTradeResults(false);
          setTradeResultsData(null);
          
          // Reload positions to reflect changes
          if (activeTab === 'positions') {
            loadTradingPositions();
          }
        }}
        tradeData={tradeResultsData}
      />
    </div>
  );
}