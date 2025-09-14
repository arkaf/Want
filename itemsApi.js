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

export function subscribeItems(onInsert, onDelete) {
  const channel = supabase
    .channel('items-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'items' },
      payload => onInsert?.(payload.new)
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'items' },
      payload => onDelete?.(payload.old)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}