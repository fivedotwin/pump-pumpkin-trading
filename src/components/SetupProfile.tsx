import React, { useState, useRef } from 'react';
import { ArrowLeft, Upload, User } from 'lucide-react';

interface SetupProfileProps {
  onBack: () => void;
  onComplete: (profileData: { username: string; profilePicture?: string }) => void;
  walletAddress: string;
}

export default function SetupProfile({ onBack, onComplete, walletAddress }: SetupProfileProps) {
  const [step, setStep] = useState<'username' | 'picture' | 'loading'>('username');
  const [username, setUsername] = useState('');
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setStep('picture');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setProfilePicture(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSkipPicture = async () => {
    setStep('loading');
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    onComplete({ username, profilePicture: undefined });
  };

  const handleCompleteSetup = async () => {
    setStep('loading');
    
    // Simulate API call with profile picture
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    onComplete({ username, profilePicture: profilePicture || undefined });
  };

  const formatWalletAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const handleBackFromPicture = () => {
    setStep('username');
    setProfilePicture(null);
  };

  // Loading Step
  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto">
            {/* Main Icon */}
            <img 
              src="https://i.imgur.com/fWVz5td.png" 
              alt="Pump Pumpkin Icon" 
              className="w-full h-full object-cover rounded-lg"
            />
            
            {/* Spinning Border */}
            <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-lg animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  // Username Step
  if (step === 'username') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="text-center max-w-md w-full">
          {/* Back Button - positioned absolutely */}
          <button 
            onClick={onBack}
            className="absolute top-6 left-6 flex items-center text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>

          {/* Connected Wallet Status - positioned absolutely */}
          <div className="absolute top-6 right-6 flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-gray-400">
              {formatWalletAddress(walletAddress)}
            </span>
          </div>

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

          {/* Welcome Text */}
          <h1 className="text-3xl font-normal mb-2">
            Setup Your <span style={{ color: '#1e7cfa' }}>Profile</span>
          </h1>
          
          {/* Subtitle */}
          <p className="text-gray-400 text-lg mb-2">Choose Your Trading Name</p>
          
          {/* Connect text */}
          <p className="text-gray-500 text-sm mb-8">Enter A Username To Complete Your Profile</p>
          
          {/* Profile Form */}
          <form onSubmit={handleUsernameSubmit} className="space-y-6">
            {/* Username Input */}
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              maxLength={20}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-4 text-white text-lg placeholder-gray-500 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all text-center"
              placeholder="Enter your trading name"
            />

            {/* Continue Button */}
            <button
              type="submit"
              disabled={!username.trim()}
              className="w-full text-black font-medium py-4 px-6 rounded-lg text-lg transition-colors disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed"
              style={{ 
                backgroundColor: !username.trim() ? '#374151' : '#1e7cfa',
                color: !username.trim() ? '#9ca3af' : 'black'
              }}
              onMouseEnter={(e) => {
                if (username.trim()) {
                  e.target.style.backgroundColor = '#1a6ce8';
                }
              }}
              onMouseLeave={(e) => {
                if (username.trim()) {
                  e.target.style.backgroundColor = '#1e7cfa';
                }
              }}
            >
              Continue
            </button>
          </form>
          
          {/* Terms */}
          <p className="text-gray-600 text-xs mt-4">
            By Continuing You Agree To Our{' '}
            <span 
              style={{ color: '#1e7cfa' }} 
              className="underline cursor-pointer hover:text-blue-300 transition-colors"
            >
              Terms Of Service
            </span>
          </p>
        </div>
      </div>
    );
  }

  // Profile Picture Step
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="text-center max-w-md w-full">
        {/* Back Button - positioned absolutely */}
        <button 
          onClick={handleBackFromPicture}
          className="absolute top-6 left-6 flex items-center text-blue-400 hover:text-blue-300 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </button>

        {/* Connected Wallet Status - positioned absolutely */}
        <div className="absolute top-6 right-6 flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm text-gray-400">
            {formatWalletAddress(walletAddress)}
          </span>
        </div>

        {/* Profile Picture or Default Icon */}
        <div className="mb-8">
          <div className="w-20 h-20 mx-auto">
            {profilePicture ? (
              <img 
                src={profilePicture} 
                alt="Profile Picture" 
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <div className="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-600">
                <User className="w-8 h-8 text-gray-500" />
              </div>
            )}
          </div>
        </div>

        {/* Welcome Text */}
        <h1 className="text-3xl font-normal mb-2">
          Upload Profile <span style={{ color: '#1e7cfa' }}>Picture</span>
        </h1>
        
        {/* Subtitle */}
        <p className="text-gray-400 text-lg mb-2">Hello, {username}!</p>
        
        {/* Connect text */}
        <p className="text-gray-500 text-sm mb-8">Add A Profile Picture To Complete Your Setup</p>
        
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Upload Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full bg-gray-800 border border-gray-600 hover:border-blue-400 text-white font-medium py-4 px-6 rounded-lg text-lg transition-all mb-4 flex items-center justify-center space-x-2"
        >
          <Upload className="w-5 h-5" />
          <span>{profilePicture ? 'Change Picture' : 'Upload Picture'}</span>
        </button>

        {/* Action Buttons */}
        <div className="space-y-3">
          {profilePicture && (
            <button
              onClick={handleCompleteSetup}
              className="w-full text-black font-medium py-4 px-6 rounded-lg text-lg transition-colors"
              style={{ backgroundColor: '#1e7cfa' }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#1a6ce8';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#1e7cfa';
              }}
            >
              Complete Setup
            </button>
          )}

          <button
            onClick={handleSkipPicture}
            className="w-full bg-transparent border border-gray-600 hover:border-gray-500 text-gray-400 hover:text-gray-300 font-medium py-4 px-6 rounded-lg text-lg transition-colors"
          >
            Skip For Now
          </button>
        </div>
        
        {/* Terms */}
        <p className="text-gray-600 text-xs mt-4">
          By Completing Setup You Agree To Our{' '}
          <span 
            style={{ color: '#1e7cfa' }} 
            className="underline cursor-pointer hover:text-blue-300 transition-colors"
          >
            Terms Of Service
          </span>
        </p>
      </div>
    </div>
  );
}