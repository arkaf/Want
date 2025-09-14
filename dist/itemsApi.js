import { supabase } from './supabaseClient.js';

export async function loadItems() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user');
  
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .order('created_at', { ascending: false });
    
  if (error) throw error;
  return data;
}

export async function addItem({ url, title, image, price }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No user');
  
  const { data, error } = await supabase
    .from('items')
    .insert([{ user_id: user.id, url, title, image, price }])
    .select()
    .single();
    
  if (error) throw error;
  return data;
}

export async function deleteItem(id) {
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) throw error;
}

export async function subscribeItems(onInsert, onDelete) {
  console.log('Setting up real-time subscription...');
  
  // Get current user for filtering
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('No user found for real-time subscription');
    return () => {};
  }
  
  const channel = supabase
    .channel('items-changes', {
      config: {
        broadcast: { self: false },
        presence: { key: 'items' }
      }
    })
    .on(
      'postgres_changes',
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'items',
        filter: `user_id=eq.${user.id}`
      },
      (payload) => {
        console.log('Real-time INSERT received:', payload);
        onInsert?.(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { 
        event: 'DELETE', 
        schema: 'public', 
        table: 'items',
        filter: `user_id=eq.${user.id}`
      },
      (payload) => {
        console.log('Real-time DELETE received:', payload);
        onDelete?.(payload.old);
      }
    )
    .subscribe((status) => {
      console.log('Real-time subscription status:', status);
      
      // Update sync status indicator
      if (typeof updateSyncStatus === 'function') {
        updateSyncStatus(status);
      }
      
      if (status === 'SUBSCRIBED') {
        console.log('✅ Real-time sync connected');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Real-time sync error');
      } else if (status === 'TIMED_OUT') {
        console.warn('⏰ Real-time sync timed out, retrying...');
        
        setTimeout(() => {
          console.log('Retrying real-time subscription...');
          subscribeItems(onInsert, onDelete);
        }, 5000);
      }
    });
    
  return () => {
    console.log('Cleaning up real-time subscription...');
    supabase.removeChannel(channel);
  };
}