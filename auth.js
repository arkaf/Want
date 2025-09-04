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
        console.log('Starting comprehensive auth state clearing...');
        
        // Sign out from Supabase
        await supabase.auth.signOut();
        console.log('Supabase signOut completed');
        
        // Clear localStorage - more comprehensive approach
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.includes('supabase') || key.includes('auth') || key.includes('sb-') || key.toLowerCase().includes('token')) {
                console.log('Removing localStorage key:', key);
                localStorage.removeItem(key);
            }
        });
        
        // Clear sessionStorage completely
        sessionStorage.clear();
        console.log('SessionStorage cleared');
        
        // Clear any remaining auth-related storage
        const remainingKeys = Object.keys(localStorage);
        remainingKeys.forEach(key => {
            if (key.toLowerCase().includes('auth') || key.toLowerCase().includes('token') || key.toLowerCase().includes('session')) {
                console.log('Removing remaining auth key:', key);
                localStorage.removeItem(key);
            }
        });
        
        console.log('Authentication state cleared successfully');
    } catch (error) {
        console.error('Error clearing auth state:', error);
    }
}

// Make clearAuthState available globally for emergency use
window.clearAuthState = clearAuthState;

// Auth state listener
export function onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
}
