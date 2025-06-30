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

  const handleWalletConnect = async (publicKey: string) => {
    setWalletAddress(publicKey);
    setIsConnected(true);
    setIsLoadingProfile(true);
    setCurrentState('loading');

    try {
      console.log('🔍 Checking for existing profile:', publicKey);
      
      // Check if user profile exists
      const existingProfile = await userProfileService.getProfile(publicKey);
      
      if (existingProfile) {
        console.log('✅ Existing profile found:', existingProfile.username);
        setUserProfile(existingProfile);
        setCurrentState('dashboard');
      } else {
        console.log('📝 No profile found, redirecting to setup');
        setCurrentState('profile');
      }
    } catch (error) {
      console.error('💥 Error checking profile:', error);
      setCurrentState('profile'); // Fallback to profile setup
    } finally {
      setIsLoadingProfile(false);
    }
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

  // Loading state
  if (currentState === 'loading' || isLoadingProfile) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm w-full mx-auto">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <img 
              src="https://i.imgur.com/fWVz5td.png" 
              alt="Loading" 
              className="w-full h-full object-cover rounded-xl"
            />
            <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-xl animate-spin"></div>
          </div>
          <p className="text-gray-400 text-lg">Loading your profile...</p>
          <p className="text-gray-500 text-base mt-3">Connecting to database...</p>
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