import React, { useState } from 'react';
import { ArrowLeft, Save, AlertTriangle, DollarSign, Percent, Clock } from 'lucide-react';

interface TradingSettingsProps {
  onBack: () => void;
}

interface TradingConfig {
  defaultSlippage: number;
  maxSlippage: number;
  defaultLeverage: number;
  maxLeverage: number;
  autoApprove: boolean;
  confirmTransactions: boolean;
  priorityFee: number;
  timeout: number;
}

export default function TradingSettings({ onBack }: TradingSettingsProps) {
  const [config, setConfig] = useState<TradingConfig>({
    defaultSlippage: 0.5,
    maxSlippage: 5.0,
    defaultLeverage: 1,
    maxLeverage: 10,
    autoApprove: false,
    confirmTransactions: true,
    priorityFee: 0.001,
    timeout: 30,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      // Save to localStorage for now (in production, save to database)
      localStorage.setItem('tradingSettings', JSON.stringify(config));
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error saving trading settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateConfig = (key: keyof TradingConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
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
          <h1 className="text-2xl font-bold mb-2">Trading Settings</h1>
          <p className="text-gray-400">Configure your trading preferences</p>
        </div>

        {/* Success Message */}
        {saved && (
          <div className="bg-green-900 border border-green-700 rounded-lg p-3 mb-6">
            <p className="text-green-300 text-sm text-center">Settings saved successfully!</p>
          </div>
        )}

        {/* Settings Form */}
        <div className="space-y-6">
          {/* Slippage Settings */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center mb-3">
              <Percent className="w-5 h-5 text-blue-400 mr-2" />
              <h3 className="text-lg font-medium">Slippage Tolerance</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Default Slippage (%)</label>
                <input
                  type="number"
                  value={config.defaultSlippage}
                  onChange={(e) => updateConfig('defaultSlippage', parseFloat(e.target.value) || 0)}
                  min="0.1"
                  max="10"
                  step="0.1"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-400"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Maximum Slippage (%)</label>
                <input
                  type="number"
                  value={config.maxSlippage}
                  onChange={(e) => updateConfig('maxSlippage', parseFloat(e.target.value) || 0)}
                  min="1"
                  max="50"
                  step="0.5"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
          </div>

          {/* Leverage Settings */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center mb-3">
              <DollarSign className="w-5 h-5 text-green-400 mr-2" />
              <h3 className="text-lg font-medium">Leverage Settings</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Default Leverage (x)</label>
                <input
                  type="number"
                  value={config.defaultLeverage}
                  onChange={(e) => updateConfig('defaultLeverage', parseInt(e.target.value) || 1)}
                  min="1"
                  max="20"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-400"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Maximum Leverage (x)</label>
                <input
                  type="number"
                  value={config.maxLeverage}
                  onChange={(e) => updateConfig('maxLeverage', parseInt(e.target.value) || 1)}
                  min="1"
                  max="50"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
          </div>

          {/* Transaction Settings */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center mb-3">
              <Clock className="w-5 h-5 text-orange-400 mr-2" />
              <h3 className="text-lg font-medium">Transaction Settings</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Priority Fee (SOL)</label>
                <input
                  type="number"
                  value={config.priorityFee}
                  onChange={(e) => updateConfig('priorityFee', parseFloat(e.target.value) || 0)}
                  min="0"
                  max="0.01"
                  step="0.0001"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-400"
                />
                <p className="text-gray-500 text-xs mt-1">Higher fees = faster transaction confirmation</p>
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Transaction Timeout (seconds)</label>
                <input
                  type="number"
                  value={config.timeout}
                  onChange={(e) => updateConfig('timeout', parseInt(e.target.value) || 30)}
                  min="10"
                  max="300"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
          </div>

          {/* Safety Settings */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center mb-3">
              <AlertTriangle className="w-5 h-5 text-red-400 mr-2" />
              <h3 className="text-lg font-medium">Safety Settings</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Auto-approve transactions</p>
                  <p className="text-gray-400 text-sm">Skip confirmation for small trades</p>
                </div>
                <button
                  onClick={() => updateConfig('autoApprove', !config.autoApprove)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.autoApprove ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.autoApprove ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Confirm all transactions</p>
                  <p className="text-gray-400 text-sm">Always show confirmation dialog</p>
                </div>
                <button
                  onClick={() => updateConfig('confirmTransactions', !config.confirmTransactions)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.confirmTransactions ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.confirmTransactions ? 'translate-x-6' : 'translate-x-1'
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
                <span>Save Settings</span>
              </>
            )}
          </button>

          {/* Reset Button */}
          <button
            onClick={() => {
              setConfig({
                defaultSlippage: 0.5,
                maxSlippage: 5.0,
                defaultLeverage: 1,
                maxLeverage: 10,
                autoApprove: false,
                confirmTransactions: true,
                priorityFee: 0.001,
                timeout: 30,
              });
            }}
            className="w-full bg-transparent border border-gray-600 hover:border-gray-500 text-gray-400 hover:text-gray-300 font-medium py-3 px-6 rounded-lg transition-colors"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}