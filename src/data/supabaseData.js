// Simplified data layer using only Supabase
import { supabase } from '../../supabaseClient.js';

export class SupabaseDataManager {
  constructor() {
    this.cache = new Map(); // Simple in-memory cache for performance
  }

  // Get all items for the current user
  async getItems() {
    try {
      console.log('🔍 SupabaseDataManager.getItems() called');
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      console.log('👤 User auth result:', { user: user?.id, error: userError });
      
      if (!user) {
        console.log('❌ No user authenticated, returning empty items');
        return [];
      }

      console.log('📡 Fetching items from Supabase for user:', user.id);
      
      // Force fresh fetch with cache-busting headers
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .abortSignal(AbortSignal.timeout(10000)); // 10 second timeout

      console.log('📊 Supabase response:', { dataCount: data?.length, error });

      if (error) {
        console.error('❌ Error fetching items:', error);
        return [];
      }

      // Update cache
      this.cache.clear();
      data?.forEach(item => this.cache.set(item.id, item));

      console.log('✅ Returning items:', data?.length || 0);
      return data || [];
    } catch (error) {
      console.error('❌ Error in getItems:', error);
      return [];
    }
  }

  // Add or update an item
  async addOrUpdateItem(item) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Check if item exists
      const existingItem = await this.getItemByUrl(item.url);
      
      if (existingItem) {
        // Update existing item
        const { data, error } = await supabase
          .from('items')
          .update({
            title: item.title,
            price: item.price || '',
            image: item.image || '',
            domain: item.domain || this.extractDomain(item.url)
          })
          .eq('id', existingItem.id)
          .select()
          .single();

        if (error) throw error;

        // Update cache
        this.cache.set(data.id, data);
        return data;
      } else {
        // Create new item
        const { data, error } = await supabase
          .from('items')
          .insert({
            user_id: user.id,
            url: item.url,
            title: item.title,
            price: item.price || '',
            image: item.image || '',
            domain: item.domain || this.extractDomain(item.url)
          })
          .select()
          .single();

        if (error) throw error;

        // Update cache
        this.cache.set(data.id, data);
        return data;
      }
    } catch (error) {
      console.error('Error in addOrUpdateItem:', error);
      throw error;
    }
  }

  // Delete an item
  async deleteItem(id) {
    try {
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Update cache
      this.cache.delete(id);
      return true;
    } catch (error) {
      console.error('Error in deleteItem:', error);
      throw error;
    }
  }

  // Get item by URL (for checking duplicates)
  async getItemByUrl(url) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('user_id', user.id)
        .eq('url', url)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Error fetching item by URL:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in getItemByUrl:', error);
      return null;
    }
  }

  // Extract domain from URL
  extractDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  // Get cached item (for performance)
  getCachedItem(id) {
    return this.cache.get(id);
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
  }

  // Test Supabase connection
  async testConnection() {
    try {
      console.log('🧪 Testing Supabase connection...');
      
      // Test auth
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      console.log('🔐 Auth test:', { user: user?.id, error: authError });
      
      // Test database access
      const { data, error } = await supabase
        .from('items')
        .select('id')
        .limit(1);
      
      console.log('🗄️ Database test:', { data, error });
      
      return { auth: !!user, database: !error };
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      return { auth: false, database: false, error };
    }
  }
}
