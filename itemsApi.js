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

export async function subscribeItems(onInsert, onDelete, updateSyncStatus) {
  console.log('Setting up real-time subscription...');
  
  // Get current user for filtering
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError) {
    console.error('Error getting user for real-time subscription:', userError);
    return () => {};
  }
  
  if (!user) {
    console.error('No user found for real-time subscription');
    return () => {};
  }
  
  console.log('User authenticated for real-time subscription:', user.id);
  
  // Test database access first
  try {
    const { data: testData, error: testError } = await supabase
      .from('items')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);
    
    if (testError) {
      console.error('Database access test failed:', testError);
      return () => {};
    }
    
    console.log('Database access confirmed for real-time subscription');
  } catch (error) {
    console.error('Error testing database access:', error);
    return () => {};
  }
  
  const channel = supabase
    .channel('items-changes', {
      config: {
        broadcast: { self: false },
        presence: { key: 'items' },
        // Mobile Safari WebSocket optimization
        heartbeat: { interval: 30000, timeout: 60000 }
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
        console.log('DELETE payload details:', {
          old: payload.old,
          eventType: payload.eventType,
          schema: payload.schema,
          table: payload.table
        });
        onDelete?.(payload.old);
      }
    )
    .subscribe((status, err) => {
      console.log('Real-time subscription status:', status);
      
      // Update sync status indicator
      if (typeof updateSyncStatus === 'function') {
        updateSyncStatus(status);
      }
      
      if (status === 'SUBSCRIBED') {
        console.log('✅ Real-time sync connected');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Real-time sync error:', err);
        
        // Check if it's a mobile Safari WebSocket issue
        const isMobileSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent);
        
        // For mobile Safari, disable real-time sync after multiple failures
        if (isMobileSafari) {
          const failureCount = parseInt(localStorage.getItem('realtime-failures') || '0') + 1;
          localStorage.setItem('realtime-failures', failureCount.toString());
          
          if (failureCount >= 3) {
            console.log('Too many real-time sync failures on mobile Safari, disabling real-time sync');
            localStorage.setItem('skip-realtime-sync', 'true');
            updateSyncStatus?.('DISABLED');
            return;
          }
        }
        
        const retryDelay = isMobileSafari ? 15000 : 5000; // Longer delay for mobile Safari
        
        console.log(`Retrying real-time subscription after ${retryDelay/1000}s (Mobile Safari: ${isMobileSafari})...`);
        
        // Retry after a delay
        setTimeout(() => {
          console.log('Retrying real-time subscription after error...');
          subscribeItems(onInsert, onDelete, updateSyncStatus);
        }, retryDelay);
      } else if (status === 'TIMED_OUT') {
        console.warn('⏰ Real-time sync timed out, retrying...');
        
        setTimeout(() => {
          console.log('Retrying real-time subscription...');
          subscribeItems(onInsert, onDelete, updateSyncStatus);
        }, 5000);
      } else if (status === 'CLOSED') {
        console.log('Real-time subscription closed');
      }
    });
    
  return () => {
    console.log('Cleaning up real-time subscription...');
    supabase.removeChannel(channel);
  };
}