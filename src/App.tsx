import React, { useState, useEffect } from 'react';
import { WalletContextProvider } from './components/WalletProvider';
import WalletButton from './components/WalletButton';
import TermsOfService from './components/TermsOfService';
import SetupProfile from './components/SetupProfile';
import Dashboard from './components/Dashboard';
import { userProfileService, UserProfile } from './services/supabaseClient';

type AppState = 'connect' | 'terms' | 'profile' | 'dashboard' | 'loading';

function AppContent() {
  const [currentState, setCurrentState] = useState<AppState>('connect');
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  
  // Enhanced loading screen state
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [loadingTime, setLoadingTime] = useState(0);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [currentTip, setCurrentTip] = useState(0);
  
  const loadingSteps = [
    { id: 'wallet', label: 'Connecting wallet...', status: 'pending' },
    { id: 'profile', label: 'Checking profile...', status: 'pending' },
    { id: 'database', label: 'Loading data...', status: 'pending' },
    { id: 'ready', label: 'Almost ready!', status: 'pending' }
  ];
  
  const loadingTips = [
    "💡 Pro tip: Use leverage wisely to maximize gains",
    "🎯 Set stop losses to protect your capital", 
    "⚡ Live prices update every 500ms for fast trading",
    "🔥 Join the first leverage trading platform for Pump.fun!",
    "📊 Track your P&L in real-time with live charts",
    "🚨 Automatic liquidation protection keeps you safe"
  ];

  // Enhanced loading effects
  useEffect(() => {
    if (currentState === 'loading' || isLoadingProfile) {
      // Reset loading state
      setLoadingProgress(0);
      setCurrentStep(0);
      setLoadingTime(0);
      setShowTimeoutWarning(false);
      
      // Loading timer and progress
      const progressTimer = setInterval(() => {
        setLoadingTime(prev => {
          const newTime = prev + 1;
          
          // Show timeout warning after 10 seconds
          if (newTime >= 10) {
            setShowTimeoutWarning(true);
          }
          
          // Simulate progress based on time
          const progress = Math.min((newTime / 8) * 100, 95); // Cap at 95% until complete
          setLoadingProgress(progress);
          
          // Update current step
          const step = Math.floor((newTime / 8) * loadingSteps.length);
          setCurrentStep(Math.min(step, loadingSteps.length - 1));
          
          return newTime;
        });
      }, 1000);
      
      // Haptic feedback for mobile
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
      
      return () => clearInterval(progressTimer);
    }
  }, [currentState, isLoadingProfile, retryCount]);
  
  // Tip rotation effect
  useEffect(() => {
    if (currentState === 'loading' || isLoadingProfile) {
      const tipTimer = setInterval(() => {
        setCurrentTip((prev) => (prev + 1) % loadingTips.length);
      }, 3000);
      
      return () => clearInterval(tipTimer);
    }
  }, [currentState, isLoadingProfile, loadingTips.length]);

  const handleWalletConnect = async (publicKey: string) => {
    setWalletAddress(publicKey);
    setIsConnected(true);
    setIsLoadingProfile(true);
    setCurrentState('loading');

    try {
      console.log('🔍 Checking for existing profile:', publicKey);
      
      // Simulate step progression
      setCurrentStep(1);
      setLoadingProgress(25);
      
      // Check if user profile exists
      const existingProfile = await userProfileService.getProfile(publicKey);
      
      setCurrentStep(2);
      setLoadingProgress(75);
      
      if (existingProfile) {
        console.log('✅ Existing profile found:', existingProfile.username);
        setUserProfile(existingProfile);
        setLoadingProgress(100);
        setCurrentStep(3);
        
        // Small delay to show completion
        setTimeout(() => {
          setCurrentState('dashboard');
        }, 500);
      } else {
        console.log('📝 No profile found, redirecting to setup');
        setLoadingProgress(100);
        setTimeout(() => {
          setCurrentState('profile');
        }, 500);
      }
    } catch (error) {
      console.error('💥 Error checking profile:', error);
      setCurrentState('profile'); // Fallback to profile setup
    } finally {
      setIsLoadingProfile(false);
    }
  };
  
  const handleRetryLoading = async () => {
    setRetryCount(prev => prev + 1);
    setShowTimeoutWarning(false);
    await handleWalletConnect(walletAddress);
  };

  const handleShowTerms = () => {
    setCurrentState('terms');
  };

  const handleBackFromTerms = () => {
    setCurrentState('connect');
  };

  const handleBackFromProfile = () => {
    setCurrentState('connect');
    setIsConnected(false);
    setWalletAddress('');
    setUserProfile(null);
  };

  const handleCompleteProfile = async (profileData: { username: string; profilePicture?: string }) => {
    setCurrentState('loading');
    
    try {
      console.log('💾 Creating new profile in database...');
      
      const newProfile = await userProfileService.createProfile({
        wallet_address: walletAddress,
        username: profileData.username,
        profile_image: profileData.profilePicture,
        balance: 0, // Set default USD balance to 0
        sol_balance: 0, // Set default SOL balance to 0
      });

      if (newProfile) {
        console.log('✅ Profile created successfully');
        setUserProfile(newProfile);
        setCurrentState('dashboard');
      } else {
        console.error('❌ Failed to create profile');
        // Still proceed to dashboard with local data
        setUserProfile({
          id: 'temp',
          wallet_address: walletAddress,
          username: profileData.username,
          profile_image: profileData.profilePicture,
          balance: 0, // Set default USD balance to 0
          sol_balance: 0, // Set default SOL balance to 0
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        setCurrentState('dashboard');
      }
    } catch (error) {
      console.error('💥 Error creating profile:', error);
      // Fallback to local profile
      setUserProfile({
        id: 'temp',
        wallet_address: walletAddress,
        username: profileData.username,
        profile_image: profileData.profilePicture,
        balance: 0, // Set default USD balance to 0
        sol_balance: 0, // Set default SOL balance to 0
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setCurrentState('dashboard');
    }
  };

  const handleUpdateBalance = async (newBalance: number) => {
    if (userProfile) {
      // Update local state immediately
      setUserProfile(prev => prev ? { ...prev, balance: newBalance } : null);
      
      // Update in database
      try {
        await userProfileService.updateBalance(walletAddress, newBalance);
        console.log('✅ USD balance updated in database');
      } catch (error) {
        console.error('💥 Error updating USD balance in database:', error);
      }
    }
  };

  const handleUpdateSOLBalance = async (newSOLBalance: number) => {
    if (userProfile) {
      // Update local state immediately
      setUserProfile(prev => prev ? { ...prev, sol_balance: newSOLBalance } : null);
      
      // Update in database
      try {
        await userProfileService.updateSOLBalance(walletAddress, newSOLBalance);
        console.log('✅ SOL balance updated in database');
      } catch (error) {
        console.error('💥 Error updating SOL balance in database:', error);
      }
    }
  };

  const handleUpdateBothBalances = async (newBalance: number, newSOLBalance: number) => {
    if (userProfile) {
      // Update local state immediately
      setUserProfile(prev => prev ? { 
        ...prev, 
        balance: newBalance,
        sol_balance: newSOLBalance 
      } : null);
      
      // Update in database
      try {
        await userProfileService.updateBalances(walletAddress, newBalance, newSOLBalance);
        console.log('✅ Both balances updated in database');
      } catch (error) {
        console.error('💥 Error updating balances in database:', error);
      }
    }
  };

  // Enhanced Loading state
  if (currentState === 'loading' || isLoadingProfile) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-600 opacity-10 rounded-full animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-600 opacity-10 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
        </div>

        <div className="text-center max-w-sm w-full mx-auto relative z-10">
          {/* Enhanced animated logo */}
          <div className="relative w-32 h-32 mx-auto mb-8">
            {/* Main Logo */}
            <img 
              src="https://i.imgur.com/fWVz5td.png" 
              alt="Pump Pumpkin" 
              className="w-full h-full object-cover rounded-2xl relative z-10"
            />
            
            {/* Multi-layer spinning rings */}
            <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-2xl animate-spin"></div>
            <div className="absolute inset-2 border-2 border-transparent border-r-purple-500 rounded-xl animate-spin-reverse" style={{ 
              animationDuration: '3s'
            }}></div>
            <div className="absolute inset-4 border border-transparent border-b-green-500 rounded-lg animate-spin" style={{ 
              animationDuration: '2s' 
            }}></div>
            
            {/* Pulsing glow effect */}
            <div className="absolute inset-0 bg-blue-500 opacity-20 rounded-2xl animate-pulse"></div>
          </div>

          {/* Dynamic brand text */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
              Pump Pumpkin
            </h1>
            <p className="text-sm text-gray-400 mt-1">First-Ever Leverage Trading for Pump.fun</p>
          </div>

          {/* Progress bar with animation */}
          <div className="w-full bg-gray-800 rounded-full h-3 mb-6 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-500 relative"
              style={{ width: `${loadingProgress}%` }}
            >
              <div className="absolute inset-0 bg-white opacity-30 animate-pulse"></div>
            </div>
          </div>

          {/* Current step indicator */}
          <div className="space-y-2 mb-6">
            {loadingSteps.map((step, index) => (
              <div key={step.id} className="flex items-center space-x-3">
                <div className={`w-4 h-4 rounded-full transition-all duration-300 ${
                  index < currentStep ? 'bg-green-500' :
                  index === currentStep ? 'bg-blue-500 animate-pulse' :
                  'bg-gray-600'
                }`} />
                <span className={`text-sm transition-colors duration-300 ${
                  index === currentStep ? 'text-white' : 'text-gray-400'
                }`}>
                  {step.label}
                </span>
                {index < currentStep && (
                  <span className="text-green-400 text-xs">✓</span>
                )}
              </div>
            ))}
          </div>

          {/* Progress percentage */}
          <div className="text-center mb-4">
            <span className="text-2xl font-bold text-white">{Math.round(loadingProgress)}%</span>
            <p className="text-gray-400 text-sm">Loading your trading terminal...</p>
          </div>

          {/* Rotating tips */}
          <div className="bg-gray-900 rounded-lg p-4 mb-6 min-h-[60px] flex items-center justify-center">
            <p className="text-gray-300 text-sm text-center transition-all duration-500">
              {loadingTips[currentTip]}
            </p>
          </div>

          {/* Timeout warning */}
          {showTimeoutWarning && (
            <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-3 mb-4 animate-pulse">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-yellow-400 text-sm font-medium">Taking longer than usual...</p>
                  <p className="text-yellow-300 text-xs">This might be due to network congestion</p>
                </div>
                <button 
                  onClick={handleRetryLoading}
                  className="bg-yellow-600 hover:bg-yellow-500 text-black px-3 py-1 rounded text-xs font-medium transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Loading time indicator */}
          <div className="text-center">
            <div className="text-gray-500 text-xs">Loading time: {loadingTime}s</div>
            {retryCount > 0 && (
              <div className="text-gray-500 text-xs">Attempt: {retryCount + 1}</div>
            )}
          </div>

          {/* Animated dots */}
          <div className="flex justify-center space-x-1 mt-6">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
          </div>
        </div>
      </div>
    );
  }

  // Terms of Service page
  if (currentState === 'terms') {
    return <TermsOfService onBack={handleBackFromTerms} />;
  }

  // Profile Setup page
  if (currentState === 'profile' && isConnected) {
    return (
      <SetupProfile 
        onBack={handleBackFromProfile}
        onComplete={handleCompleteProfile}
        walletAddress={walletAddress}
      />
    );
  }

  // Dashboard
  if (currentState === 'dashboard' && userProfile) {
    return (
      <Dashboard 
        username={userProfile.username}
        profilePicture={userProfile.profile_image}
        walletAddress={walletAddress}
        balance={userProfile.balance}
        solBalance={userProfile.sol_balance} // Pass SOL balance to Dashboard
        onUpdateBalance={handleUpdateBalance}
        onUpdateSOLBalance={handleUpdateSOLBalance}
        onUpdateBothBalances={handleUpdateBothBalances}
        onShowTerms={handleShowTerms}
      />
    );
  }

  // Connect Wallet page (default)
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="text-center max-w-sm w-full mx-auto">
        {/* Character Icon - Mobile optimized */}
        <div className="mb-8">
          <div className="w-24 h-24 mx-auto">
            <img 
              src="https://i.imgur.com/fWVz5td.png" 
              alt="Pump Pumpkin Icon" 
              className="w-full h-full object-cover rounded-xl"
            />
          </div>
        </div>

        {/* Welcome Text - Mobile optimized */}
        <h1 className="text-3xl font-normal mb-4">
          Welcome To <span style={{ color: '#1e7cfa' }}>Pump Pumpkin</span>
        </h1>
        
        {/* Subtitle - Mobile optimized */}
        <p className="text-gray-400 text-lg mb-4">Pump.Fun Leverage Trading</p>
        
        {/* Connect text - Mobile optimized */}
        <p className="text-gray-500 text-sm mb-8">Connect Your Solana Wallet To Start Trading</p>
        
        {/* Wallet Connection Button */}
        <WalletButton onConnect={handleWalletConnect} />
        
        {/* Terms - Larger text for mobile */}
        <p className="text-gray-600 text-sm mt-6">
          By Connecting You Agree To Our{' '}
          <span 
            style={{ color: '#1e7cfa' }} 
            className="underline cursor-pointer hover:text-blue-300 transition-colors"
            onClick={handleShowTerms}
          >
            Terms Of Service
          </span>
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <WalletContextProvider>
      <AppContent />
    </WalletContextProvider>
  );
}

export default App;