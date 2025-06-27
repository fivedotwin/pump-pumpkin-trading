import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

// Create Supabase client with anonymous access
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // We don't need session persistence for anonymous access
    autoRefreshToken: false,
  },
});

// Database types
export interface UserProfile {
  id: string;
  wallet_address: string;
  username: string;
  profile_image?: string;
  balance: number;
  sol_balance: number; // Add SOL balance tracking
  created_at: string;
  updated_at: string;
}

export interface CreateUserProfileData {
  wallet_address: string;
  username: string;
  profile_image?: string;
  balance?: number;
  sol_balance?: number; // Add SOL balance to creation data
}

export interface UpdateUserProfileData {
  username?: string;
  profile_image?: string;
  balance?: number;
  sol_balance?: number; // Add SOL balance to update data
}

export interface WithdrawalRequest {
  id: string;
  wallet_address: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  admin_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWithdrawalRequestData {
  wallet_address: string;
  amount: number;
}

// User profile service
export class UserProfileService {
  /**
   * Set the current wallet address for RLS policies
   */
  private async setCurrentWalletAddress(walletAddress: string) {
    await supabase.rpc('set_config', {
      setting_name: 'app.current_wallet_address',
      setting_value: walletAddress,
      is_local: true
    });
  }

  /**
   * Create a new user profile
   */
  async createProfile(data: CreateUserProfileData): Promise<UserProfile | null> {
    try {
      console.log('🔄 Creating user profile:', data.wallet_address);
      
      await this.setCurrentWalletAddress(data.wallet_address);
      
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .insert([{
          wallet_address: data.wallet_address,
          username: data.username,
          profile_image: data.profile_image,
          balance: data.balance || 0,
          sol_balance: data.sol_balance || 0, // Initialize SOL balance
        }])
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating profile:', error);
        return null;
      }

      console.log('✅ Profile created successfully:', profile.wallet_address);
      return profile;
    } catch (error) {
      console.error('💥 Error in createProfile:', error);
      return null;
    }
  }

  /**
   * Get user profile by wallet address
   */
  async getProfile(walletAddress: string): Promise<UserProfile | null> {
    try {
      console.log('🔍 Fetching profile for:', walletAddress);
      
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('wallet_address', walletAddress)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('📝 No profile found for wallet:', walletAddress);
          return null;
        }
        console.error('❌ Error fetching profile:', error);
        return null;
      }

      console.log('✅ Profile found:', profile.username);
      return profile;
    } catch (error) {
      console.error('💥 Error in getProfile:', error);
      return null;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(
    walletAddress: string, 
    updates: UpdateUserProfileData
  ): Promise<UserProfile | null> {
    try {
      console.log('🔄 Updating profile for:', walletAddress);
      
      await this.setCurrentWalletAddress(walletAddress);
      
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('wallet_address', walletAddress)
        .select()
        .single();

      if (error) {
        console.error('❌ Error updating profile:', error);
        return null;
      }

      console.log('✅ Profile updated successfully');
      return profile;
    } catch (error) {
      console.error('💥 Error in updateProfile:', error);
      return null;
    }
  }

  /**
   * Update user balance (USD trading balance)
   */
  async updateBalance(walletAddress: string, newBalance: number): Promise<boolean> {
    try {
      console.log('💰 Updating USD balance for:', walletAddress, 'to:', newBalance);
      
      await this.setCurrentWalletAddress(walletAddress);
      
      const { error } = await supabase
        .from('user_profiles')
        .update({ balance: newBalance })
        .eq('wallet_address', walletAddress);

      if (error) {
        console.error('❌ Error updating balance:', error);
        return false;
      }

      console.log('✅ USD balance updated successfully');
      return true;
    } catch (error) {
      console.error('💥 Error in updateBalance:', error);
      return false;
    }
  }

  /**
   * Update user SOL balance (simplified after fixing RLS policy)
   */
  async updateSOLBalance(walletAddress: string, newSOLBalance: number): Promise<boolean> {
    try {
      console.log('💰 Updating SOL balance for:', walletAddress, 'to:', newSOLBalance);
      
      const { data: updateResult, error: updateError } = await supabase
        .from('user_profiles')
        .update({ 
          sol_balance: newSOLBalance,
          updated_at: new Date().toISOString()
        })
        .eq('wallet_address', walletAddress)
        .select('id, wallet_address, sol_balance');

      if (updateError) {
        console.error('❌ SOL Balance Update FAILED:', updateError);
        return false;
      }

      if (!updateResult || updateResult.length === 0) {
        console.error('❌ UPDATE QUERY MATCHED ZERO ROWS!');
        return false;
      }
      
      console.log('✅ SOL balance updated successfully');
      console.log('📊 New SOL balance in DB:', updateResult[0].sol_balance);
      return true;
      
    } catch (error: any) {
      console.error('💥 Error in updateSOLBalance:', error);
      return false;
    }
  }

  /**
   * Update both USD and SOL balances
   */
  async updateBalances(
    walletAddress: string, 
    newBalance: number, 
    newSOLBalance: number
  ): Promise<boolean> {
    try {
      console.log('💰 Updating both balances for:', walletAddress);
      
      await this.setCurrentWalletAddress(walletAddress);
      
      const { error } = await supabase
        .from('user_profiles')
        .update({ 
          balance: newBalance,
          sol_balance: newSOLBalance 
        })
        .eq('wallet_address', walletAddress);

      if (error) {
        console.error('❌ Error updating balances:', error);
        return false;
      }

      console.log('✅ Both balances updated successfully');
      return true;
    } catch (error) {
      console.error('💥 Error in updateBalances:', error);
      return false;
    }
  }

  /**
   * Check if profile exists
   */
  async profileExists(walletAddress: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('wallet_address', walletAddress)
        .single();

      return !error && !!data;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all profiles (for admin/debugging)
   */
  async getAllProfiles(): Promise<UserProfile[]> {
    try {
      const { data: profiles, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching all profiles:', error);
        return [];
      }

      return profiles || [];
    } catch (error) {
      console.error('💥 Error in getAllProfiles:', error);
      return [];
    }
  }

  /**
   * Create a withdrawal request and deduct SOL balance immediately
   */
  async createWithdrawalRequest(
    walletAddress: string, 
    amount: number
  ): Promise<WithdrawalRequest | null> {
    try {
      console.log('💸 Creating withdrawal request for:', walletAddress, 'amount:', amount);
      
      // First, get current SOL balance
      const profile = await this.getProfile(walletAddress);
      if (!profile) {
        console.error('❌ Profile not found for withdrawal request');
        return null;
      }

      if (profile.sol_balance < amount) {
        console.error('❌ Insufficient SOL balance for withdrawal request');
        return null;
      }

      // Create the withdrawal request
      const { data: withdrawalRequest, error: requestError } = await supabase
        .from('withdrawal_requests')
        .insert([{
          wallet_address: walletAddress,
          amount: amount,
          status: 'pending'
        }])
        .select()
        .single();

      if (requestError) {
        console.error('❌ Error creating withdrawal request:', requestError);
        return null;
      }

      // Deduct the amount from user's SOL balance immediately
      const newSOLBalance = profile.sol_balance - amount;
      const balanceUpdated = await this.updateSOLBalance(walletAddress, newSOLBalance);
      
      if (!balanceUpdated) {
        console.error('❌ Failed to update SOL balance after withdrawal request');
        // TODO: In production, we might want to delete the withdrawal request if balance update fails
        return null;
      }

      console.log('✅ Withdrawal request created and balance deducted');
      console.log(`📊 SOL balance: ${profile.sol_balance} → ${newSOLBalance}`);
      
      return withdrawalRequest;
    } catch (error) {
      console.error('💥 Error in createWithdrawalRequest:', error);
      return null;
    }
  }

  /**
   * Get withdrawal requests for a user
   */
  async getWithdrawalRequests(walletAddress: string): Promise<WithdrawalRequest[]> {
    try {
      console.log('📋 Fetching withdrawal requests for:', walletAddress);
      
      const { data: requests, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('wallet_address', walletAddress)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching withdrawal requests:', error);
        return [];
      }

      console.log(`✅ Found ${requests?.length || 0} withdrawal requests`);
      return requests || [];
    } catch (error) {
      console.error('💥 Error in getWithdrawalRequests:', error);
      return [];
    }
  }

  /**
   * Check if user has pending withdrawal requests
   */
  async hasPendingWithdrawalRequest(walletAddress: string): Promise<boolean> {
    try {
      const { data: requests, error } = await supabase
        .from('withdrawal_requests')
        .select('id')
        .eq('wallet_address', walletAddress)
        .eq('status', 'pending')
        .limit(1);

      if (error) {
        console.error('❌ Error checking pending withdrawal requests:', error);
        return false;
      }

      return (requests?.length || 0) > 0;
    } catch (error) {
      console.error('💥 Error in hasPendingWithdrawalRequest:', error);
      return false;
    }
  }
}

// Export singleton instance
export const userProfileService = new UserProfileService();