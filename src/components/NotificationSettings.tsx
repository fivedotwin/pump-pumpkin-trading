import React, { useState } from 'react';
import { ArrowLeft, Save, Bell, Mail, Smartphone, TrendingUp, AlertCircle, DollarSign } from 'lucide-react';

interface NotificationSettingsProps {
  onBack: () => void;
}

interface NotificationConfig {
  pushNotifications: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;
  priceAlerts: boolean;
  tradeConfirmations: boolean;
  portfolioUpdates: boolean;
  marketNews: boolean;
  systemUpdates: boolean;
  liquidationWarnings: boolean;
  profitLossAlerts: boolean;
  emailAddress: string;
  phoneNumber: string;
}

export default function NotificationSettings({ onBack }: NotificationSettingsProps) {
  const [config, setConfig] = useState<NotificationConfig>({
    pushNotifications: true,
    emailNotifications: false,
    smsNotifications: false,
    priceAlerts: true,
    tradeConfirmations: true,
    portfolioUpdates: true,
    marketNews: false,
    systemUpdates: true,
    liquidationWarnings: true,
    profitLossAlerts: true,
    emailAddress: '',
    phoneNumber: '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      // Save to localStorage for now (in production, save to database)
      localStorage.setItem('notificationSettings', JSON.stringify(config));
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error saving notification settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateConfig = (key: keyof NotificationConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const toggleSetting = (key: keyof NotificationConfig) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center mb-8">
          <button 
            onClick={onBack}
            className="flex items-center text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4">
            <img 
              src="https://i.imgur.com/fWVz5td.png" 
              alt="Pump Pumpkin Icon" 
              className="w-full h-full object-cover rounded-lg"
            />
          </div>
          <h1 className="text-2xl font-bold mb-2">Notifications</h1>
          <p className="text-gray-400">Manage your notification preferences</p>
        </div>

        {/* Success Message */}
        {saved && (
          <div className="bg-green-900 border border-green-700 rounded-lg p-3 mb-6">
            <p className="text-green-300 text-sm text-center">Notification settings saved!</p>
          </div>
        )}

        {/* Settings Form */}
        <div className="space-y-6">
          {/* Delivery Methods */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center mb-4">
              <Bell className="w-5 h-5 text-blue-400 mr-2" />
              <h3 className="text-lg font-medium">Delivery Methods</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Smartphone className="w-4 h-4 text-gray-400 mr-2" />
                  <div>
                    <p className="text-white">Push Notifications</p>
                    <p className="text-gray-400 text-sm">Browser notifications</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleSetting('pushNotifications')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.pushNotifications ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.pushNotifications ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Mail className="w-4 h-4 text-gray-400 mr-2" />
                  <div>
                    <p className="text-white">Email Notifications</p>
                    <p className="text-gray-400 text-sm">Important updates via email</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleSetting('emailNotifications')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.emailNotifications ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.emailNotifications ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {config.emailNotifications && (
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Email Address</label>
                  <input
                    type="email"
                    value={config.emailAddress}
                    onChange={(e) => updateConfig('emailAddress', e.target.value)}
                    placeholder="your@email.com"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-400"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Trading Notifications */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center mb-4">
              <TrendingUp className="w-5 h-5 text-green-400 mr-2" />
              <h3 className="text-lg font-medium">Trading Alerts</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Price Alerts</p>
                  <p className="text-gray-400 text-sm">Token price movements</p>
                </div>
                <button
                  onClick={() => toggleSetting('priceAlerts')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.priceAlerts ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.priceAlerts ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Trade Confirmations</p>
                  <p className="text-gray-400 text-sm">Successful trade notifications</p>
                </div>
                <button
                  onClick={() => toggleSetting('tradeConfirmations')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.tradeConfirmations ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.tradeConfirmations ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Portfolio Updates</p>
                  <p className="text-gray-400 text-sm">Daily portfolio summaries</p>
                </div>
                <button
                  onClick={() => toggleSetting('portfolioUpdates')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.portfolioUpdates ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.portfolioUpdates ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Profit/Loss Alerts</p>
                  <p className="text-gray-400 text-sm">Significant P&L changes</p>
                </div>
                <button
                  onClick={() => toggleSetting('profitLossAlerts')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.profitLossAlerts ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.profitLossAlerts ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Risk Management */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center mb-4">
              <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
              <h3 className="text-lg font-medium">Risk Management</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Liquidation Warnings</p>
                  <p className="text-gray-400 text-sm">Critical position alerts</p>
                </div>
                <button
                  onClick={() => toggleSetting('liquidationWarnings')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.liquidationWarnings ? 'bg-red-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.liquidationWarnings ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* General */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center mb-4">
              <DollarSign className="w-5 h-5 text-yellow-400 mr-2" />
              <h3 className="text-lg font-medium">General</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Market News</p>
                  <p className="text-gray-400 text-sm">Crypto market updates</p>
                </div>
                <button
                  onClick={() => toggleSetting('marketNews')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.marketNews ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.marketNews ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">System Updates</p>
                  <p className="text-gray-400 text-sm">Platform maintenance & features</p>
                </div>
                <button
                  onClick={() => toggleSetting('systemUpdates')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.systemUpdates ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.systemUpdates ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full text-black font-medium py-3 px-6 rounded-lg transition-colors disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            style={{ 
              backgroundColor: isSaving ? '#374151' : '#1e7cfa',
              color: isSaving ? '#9ca3af' : 'black'
            }}
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Preferences</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}