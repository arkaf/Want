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
        // Sign out from Supabase
        await supabase.auth.signOut();
        
        // Clear localStorage
        localStorage.removeItem('sb-' + supabase.supabaseUrl.split('//')[1].split('.')[0] + '-auth-token');
        
        // Clear sessionStorage
        sessionStorage.clear();
        
        // Clear any other auth-related storage
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.includes('supabase') || key.includes('auth')) {
                localStorage.removeItem(key);
            }
        });
        
        console.log('Authentication state cleared');
    } catch (error) {
        console.error('Error clearing auth state:', error);
    }
}

// Auth state listener
export function onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
}
