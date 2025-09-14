import { supabase } from './supabaseClient.js';

// Email OTP functions
export async function sendEmailOtp(email) {
    // Clear any existing session before sending OTP
    await supabase.auth.signOut();
    
    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
            emailRedirectTo: window.location.origin
        }
    });
    
    if (error) throw error;
}

export async function verifyEmailOtp({ email, code }) {
    const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email'
    });
    
    if (error) throw error;
    return data.user;
}

// Google sign-in
export async function signInWithGoogle() {
    // Clear any existing session before Google sign-in
    await supabase.auth.signOut();
    
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin
        }
    });
    
    if (error) throw error;
}

// User management
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

// Clear all authentication state and cache
export async function clearAuthState() {
    try {
        console.log('Clearing auth state...');
        
        // Sign out from Supabase
        await supabase.auth.signOut();
        
        // Comprehensive localStorage cleanup
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.includes('supabase') || key.includes('auth') || key.includes('sb-') || key.includes('gotrue')) {
                localStorage.removeItem(key);
            }
        });
        
        // Clear sessionStorage completely
        sessionStorage.clear();
        
        
        if ('indexedDB' in window) {
            try {
                await indexedDB.deleteDatabase('supabase-auth-token');
                await indexedDB.deleteDatabase('supabase');
            } catch (e) {
                console.warn('Could not clear IndexedDB:', e);
            }
        }
        
        
        if ('caches' in window) {
            try {
                const cacheNames = await caches.keys();
                await Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName.includes('auth') || cacheName.includes('supabase')) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            } catch (e) {
                console.warn('Could not clear caches:', e);
            }
        }
        
        console.log('Auth state cleared completely');
    } catch (error) {
        console.error('Error clearing auth state:', error);
    }
}


export function onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
}