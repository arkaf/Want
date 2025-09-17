// Supabase functionality will be accessed via window.db

// Import the new modular architecture
import { renderCard } from './src/ui/renderCard.js';
import { isProbablyUrl } from './src/utils/url.js';
import { openSheet, closeSheet } from './src/ui/bottomSheet.js';
import { EXTRACT_ENDPOINT } from './src/config.js';
import { withStableBust } from './src/utils/cacheBust.js';
import { SupabaseDataManager } from './src/data/supabaseData.js';

// Import Supabase auth and items API
import { supabase } from './supabaseClient.js';
import { subscribeItems } from './itemsApi.js';
import { sendEmailOtp, verifyEmailOtp, signInWithGoogle, getCurrentUser, logout, clearAuthState } from './auth.js';

// Track pending adds to prevent duplicates



// Constants & utils
const PASTE_DEBOUNCE_MS = 120;

// Simple router helpers for auth
const $ = (s) => document.querySelector(s);

// Sync status management
function updateSyncStatus(status) {
  const syncStatus = document.getElementById('syncStatus');
  if (!syncStatus) return;
  
  const indicator = syncStatus.querySelector('.sync-indicator');
  const text = syncStatus.querySelector('.sync-text');
  
  // Check if mobile Safari
  const isMobileSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent);
  
  if (status === 'SUBSCRIBED') {
    indicator.className = 'sync-indicator connected';
    text.textContent = 'Synced';
  } else if (status === 'DISABLED') {
    indicator.className = 'sync-indicator error';
    text.textContent = isMobileSafari ? 'Periodic Sync' : 'Disabled';
  } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
    indicator.className = 'sync-indicator error';
    text.textContent = 'Offline';
  } else {
    indicator.className = 'sync-indicator';
    text.textContent = isMobileSafari ? 'Periodic Sync' : 'Syncing...';
  }
}

// Keep the email used for OTP
let pendingEmail = '';

// Avatar helper function
function getAvatarData(user) {
  console.log('getAvatarData called with user:', user);
  
  const md = user?.user_metadata || {};
  const identities = user?.identities || [];
  const fromIdentity = identities[0]?.identity_data || {};

  console.log('User metadata:', md);
  console.log('Identities:', identities);
  console.log('From identity:', fromIdentity);

  let picture =
    md.avatar_url ||
    md.picture ||
    fromIdentity.picture ||
    '';

  console.log('Avatar picture URL:', picture);
  console.log('User metadata:', md);
  console.log('User identity:', fromIdentity);

  // Only skip Instagram URLs that are known to cause 403 errors
  if (picture && picture.includes('cdninstagram.com') && picture.includes('scontent-')) {
    console.log('Instagram CDN URL detected - skipping to avoid 403 errors:', picture);
    picture = ''; // Clear the picture URL to force fallback
  }

  let fallback = '';
  const email = user?.email || '';
  if (!picture && email) {
    const m = email.match(/[a-zA-Z0-9]/g);
    fallback = (m?.slice(0, 2).join('') || '').toUpperCase();
  }
  const name = md.full_name || md.name || fromIdentity.name || email;
  
  console.log('Final avatar data:', { picture, fallback, name });
  return { picture, fallback, name };
}

function domainFrom(url) {
    try { return new URL(url).hostname.replace(/^www\./,''); } catch { return ""; }
}

// Auth helper functions
function isStandalonePWA() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() { 
    return /iPhone|iPad|iPod/i.test(navigator.userAgent); 
}

// Supabase authentication functions
export async function authInit() {
  // Debounce auth state updates to prevent login/home bouncing
  let renderQueued = false;
  
  function renderOnceStable() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      // Render logic will be handled by the auth state change
    });
  }

  // Function to hide the initial loader
  function hideInitialLoader() {
    const loader = document.getElementById('initial-loader');
    if (loader) {
      loader.classList.add('hidden');
      // Remove the loader from DOM after animation
      setTimeout(() => {
        if (loader.parentNode) {
          loader.parentNode.removeChild(loader);
        }
      }, 300);
    }
    
    // Clear any loading timeout
    if (window.loadingTimeout) {
      clearTimeout(window.loadingTimeout);
      window.loadingTimeout = null;
    }
  }

  // Track current auth state to prevent duplicate calls
  let currentUser = null;
  let isInitializing = false;

  // Listen to auth state changes
  const unsub = supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth state change:', { event, session: !!session, user: !!session?.user });
    
    // Prevent duplicate initialization
    if (isInitializing) {
      console.log('Already initializing, skipping auth state change');
      return;
    }
    
    const newUser = session?.user;
    const userChanged = currentUser?.id !== newUser?.id;
    
    if (newUser && userChanged) {
      console.log('User logged in or changed:', newUser.id);
      currentUser = newUser;
      isInitializing = true;
      
      try {
        await showAppForUser(newUser);
      } catch (error) {
        console.error('Failed to show app for user:', error);
        // Fallback: reload page
        window.location.reload();
      } finally {
        isInitializing = false;
      }
    } else if (!newUser && currentUser) {
      console.log('User logged out');
      currentUser = null;
      showLoginScreen();
    }
    
    hideInitialLoader();
    renderOnceStable();
  });

  // Initial session check
  const { data: { session } } = await supabase.auth.getSession();
  console.log('Initial session check:', { session: !!session, user: !!session?.user });
  
  if (session?.user) {
    currentUser = session.user;
    isInitializing = true;
    
    try {
      await showAppForUser(session.user);
    } catch (error) {
      console.error('Failed to show app for user on initial load:', error);
      // Fallback: show login screen
      showLoginScreen();
    } finally {
      isInitializing = false;
    }
  } else {
    showLoginScreen();
  }
  
  hideInitialLoader();
}

export function loginWithGoogle() {
  // For local development, hardcode the redirect URL
  const redirectTo = window.location.hostname === 'localhost' 
    ? 'http://localhost:8000' 
    : window.location.href.split('?')[0]; // Remove any query params
  console.log('OAuth redirectTo =', redirectTo); // keep for debugging

  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,            // <- IMPORTANT
      // (optional) better tokens:
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
}

// Apple: wire later when Apple is ready in dashboard
export function loginWithApple() {
  // For local development, hardcode the redirect URL
  const redirectTo = window.location.hostname === 'localhost' 
    ? 'http://localhost:8000' 
    : window.location.href.split('?')[0]; // Remove any query params
  console.log('Apple OAuth redirectTo =', redirectTo);

  return supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { 
      redirectTo,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
}



// Email OTP Event Handlers
export function setupEmailOtpHandlers() {
  console.log('Setting up Email OTP handlers...');
  
  // Query DOM elements when function is called
  const authMain = $('#authMain');
  const otpMain = $('#otpMain');
  const authEmail = $('#authEmail');
  const btnEmailContinue = $('#btnEmailContinue');
  const btnGoogle = $('#btnGoogle');
  const authMsg = $('#authMsg');
  const otpEmailLabel = $('#otpEmail');
  const otpMsg = $('#otpMsg');
  const btnOtpVerify = $('#btnOtpVerify');
  const btnOtpBack = $('#btnOtpBack');
  const otpGrid = $('#otpGrid');
  
  console.log('btnEmailContinue:', btnEmailContinue);
  console.log('authEmail:', authEmail);
  console.log('otpMain:', otpMain);
  console.log('authMain:', authMain);
  
  if (!btnEmailContinue || !authEmail || !otpMain || !authMain) {
    console.error('Missing required DOM elements for Email OTP');
    return;
  }
  
  // Email → send OTP
  btnEmailContinue.addEventListener('click', async () => {
    console.log('Email continue button clicked');
    const email = (authEmail.value || '').trim();
    authMsg.textContent = '';
    
    if (!email) {
      authMsg.textContent = 'Please enter a valid email.';
      return;
    }
    
    console.log('Sending OTP to:', email);
    
    try {
      btnEmailContinue.disabled = true;
      
      // Sign out from any existing session before sending OTP
      await supabase.auth.signOut();
      
      await sendEmailOtp(email);
      pendingEmail = email;
      otpEmailLabel.textContent = email;
      
      // Show email confirmation screen instead of OTP screen
      const emailConfirm = document.getElementById('emailConfirm');
      const confirmEmail = document.getElementById('confirmEmail');
      
      console.log('emailConfirm element:', emailConfirm);
      console.log('confirmEmail element:', confirmEmail);
      
      if (emailConfirm && confirmEmail) {
        console.log('Showing email confirmation screen');
        confirmEmail.textContent = email;
        authMain.style.display = 'none';
        emailConfirm.style.display = '';
        console.log('Email confirmation screen should now be visible');
      } else {
        console.log('Email confirmation elements not found, falling back to OTP screen');
        // Fallback to OTP screen if confirmation screen not found
        authMain.style.display = 'none';
        otpMain.style.display = '';
        otpGrid.querySelector('input').focus();
      }
    } catch (e) {
      console.error('OTP send error:', e);
      authMsg.textContent = e?.message || String(e);
    } finally {
      btnEmailContinue.disabled = false;
    }
  });

  // OTP capture & verify
  // Auto-advance inputs
  otpGrid.querySelectorAll('input').forEach((input, idx, all) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g,'').slice(0,1);
      if (input.value && idx < all.length - 1) all[idx+1].focus();
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) all[idx-1].focus();
    });
  });

  btnOtpVerify.addEventListener('click', verifyOtpAndLogin);
  btnOtpBack.addEventListener('click', () => {
    otpMain.style.display = 'none';
    authMain.style.display = '';
  });

  // Email confirmation back button
  const btnConfirmBack = document.getElementById('btnConfirmBack');
  if (btnConfirmBack) {
    btnConfirmBack.addEventListener('click', () => {
      const emailConfirm = document.getElementById('emailConfirm');
      if (emailConfirm) {
        emailConfirm.style.display = 'none';
        authMain.style.display = '';
      }
    });
  }

  // Enter code manually button
  const btnEnterCode = document.getElementById('btnEnterCode');
  if (btnEnterCode) {
    btnEnterCode.addEventListener('click', () => {
      console.log('Enter code manually button clicked');
      const emailConfirm = document.getElementById('emailConfirm');
      const otpMain = document.getElementById('otpMain');
      const otpGrid = document.getElementById('otpGrid');
      
      console.log('emailConfirm:', emailConfirm);
      console.log('otpMain:', otpMain);
      console.log('otpGrid:', otpGrid);
      
      if (emailConfirm && otpMain && otpGrid) {
        console.log('Hiding email confirmation, showing OTP screen');
        emailConfirm.style.display = 'none';
        otpMain.style.display = '';
        otpGrid.querySelector('input').focus();
        console.log('OTP screen should now be visible');
      } else {
        console.error('Missing required elements for OTP screen');
      }
    });
  }

  // Google sign-in button
  if (btnGoogle) {
    btnGoogle.addEventListener('click', async () => {
      try {
        btnGoogle.disabled = true;
        await signInWithGoogle();
      } catch (e) {
        console.error('Google sign-in error:', e);
        authMsg.textContent = e?.message || String(e);
      } finally {
        btnGoogle.disabled = false;
      }
    });
  }
}

async function verifyOtpAndLogin() {
  console.log('Verifying OTP...');
  otpMsg.textContent = '';
  const code = Array.from(otpGrid.querySelectorAll('input')).map(i => i.value).join('');
  
  console.log('OTP code:', code);
  
  if (code.length < 6) {
    otpMsg.textContent = 'Enter the 6-digit code.';
    return;
  }
  
  try {
    btnOtpVerify.disabled = true;
    console.log('Verifying OTP for email:', pendingEmail);
    const user = await verifyEmailOtp({ email: pendingEmail, code });
    console.log('OTP verified, user:', user);
    showAppForUser(user);
  } catch (e) {
    console.error('OTP verification error:', e);
    otpMsg.textContent = e?.message || String(e);
  } finally {
    btnOtpVerify.disabled = false;
  }
}

function setupAvatar(img, avatarBtn, user) {
  // Use the new avatar helper function
  const { picture, fallback, name } = getAvatarData(user);
  
  if (picture) {
    console.log('Loading avatar:', picture);
    console.log('Avatar button element:', avatarBtn);
    console.log('Image element:', img);
    
    console.log('Loading avatar image');
    
    // No timeout - let the image load naturally
    // Only fallback on actual errors, not timeouts
    
    // Try to load the avatar image
    console.log('Setting image src to:', picture);
    
    // Clear any existing content first
    avatarBtn.innerHTML = '';
    avatarBtn.appendChild(img);
    
    // Set CORS for Google images
    if (picture && picture.includes('googleusercontent.com')) {
      img.crossOrigin = 'anonymous';
    }
    
    img.src = picture;
    img.style.display = 'block';
    
    // Handle image load errors - only fallback on actual network errors
    img.onerror = (error) => {
      console.warn('Avatar failed to load, using fallback. Error:', error);
      console.log('Failed image URL:', picture);
      
      // For Google avatars, try a different approach
      if (picture && picture.includes('googleusercontent.com')) {
        console.log('Google avatar failed, trying alternative approach...');
        
        // Try multiple Google avatar formats
        const alternatives = [
          picture.replace(/=s\d+/, '=s96-c'), // Smaller size with crop
          picture.replace(/=s\d+/, '=s64-c'), // Even smaller
          picture.replace(/=s\d+/, '=s48-c'), // Very small
          picture.replace(/=s\d+/, '=s32-c'), // Tiny
          picture.replace(/=s\d+/, '=s96'),   // No crop
          picture.replace(/=s\d+/, '=s64'),   // No crop smaller
        ];
        
        let attemptIndex = 0;
        
        const tryNextAlternative = () => {
          if (attemptIndex >= alternatives.length) {
            console.log('All Google avatar alternatives failed, using fallback');
            img.style.display = 'none';
            avatarBtn.innerHTML = `<div class="avatar-fallback">${fallback || 'ME'}</div>`;
            return;
          }
          
          const altUrl = alternatives[attemptIndex];
          console.log(`Trying alternative ${attemptIndex + 1}/${alternatives.length}:`, altUrl);
          
          const altImg = new Image();
          altImg.crossOrigin = 'anonymous'; // Try with CORS
          altImg.onload = () => {
            console.log('Alternative Google avatar loaded successfully:', altUrl);
            img.src = altUrl;
            img.style.display = 'block';
            avatarBtn.innerHTML = '';
            avatarBtn.appendChild(img);
          };
          altImg.onerror = () => {
            console.log(`Alternative ${attemptIndex + 1} failed, trying next...`);
            attemptIndex++;
            tryNextAlternative();
          };
          altImg.src = altUrl;
        };
        
        tryNextAlternative();
        return;
      }
      
      img.style.display = 'none';
      // Create a fallback avatar with user's initials
      avatarBtn.innerHTML = `<div class="avatar-fallback">${fallback || 'ME'}</div>`;
    };
    
    // Let the image load naturally - only fallback on actual errors
    
    // Handle successful load
    img.onload = () => {
      console.log('Avatar loaded successfully');
      // Ensure the image stays visible
      img.style.display = 'block';
      // Make sure it's still in the button
      if (!avatarBtn.contains(img)) {
        avatarBtn.innerHTML = '';
        avatarBtn.appendChild(img);
      }
    };
  } else {
    console.log('No avatar URL, using fallback');
    // No avatar URL - use fallback immediately
    img.style.display = 'none';
    avatarBtn.innerHTML = `<div class="avatar-fallback">${fallback || 'ME'}</div>`;
  }
  
  img.alt = name || 'Account';

  // Wire avatar click
  avatarBtn.onclick = (e) => {
    e.stopPropagation();
    // Always use the bottom sheet modal for consistency
    openAccountSheet(user);
  };
}

async function showAppForUser(user) {
  // User is authenticated - show app
  const authScreen = document.getElementById('auth-screen');
  const topbar = document.getElementById('topbar');
  const avatarBtn = document.getElementById('avatarBtn');
  const appMain = document.getElementById('appMain');
  
  if (authScreen) authScreen.style.display = 'none';
  if (topbar) topbar.style.display = 'block';
  if (avatarBtn) {
    avatarBtn.hidden = false;
    console.log('Avatar button shown, children:', avatarBtn.children.length);
  }
  if (appMain) appMain.style.display = 'block';
  
  // Set avatar with error handling for 429 rate limits
  // Use multiple requestAnimationFrame calls to ensure DOM is fully updated
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const img = document.getElementById('avatarImg');
      
      // Check if elements exist before proceeding
      if (!img || !avatarBtn) {
        console.warn('Avatar elements not found, skipping avatar setup');
        console.log('Available elements:', {
          avatarBtn: !!document.getElementById('avatarBtn'),
          avatarImg: !!document.getElementById('avatarImg'),
          topbar: !!document.getElementById('topbar')
        });
        
        // Try to create the img element if it doesn't exist
        if (avatarBtn && !img) {
          console.log('Creating missing avatarImg element');
          const newImg = document.createElement('img');
          newImg.id = 'avatarImg';
          newImg.alt = '';
          avatarBtn.appendChild(newImg);
          setupAvatar(newImg, avatarBtn, user);
        }
        return;
      }
      
      setupAvatar(img, avatarBtn, user);
    });
  });

  // 1) Load initial items - wait for WantApp to be ready
  const waitForWantApp = async () => {
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max wait
    
    while (!window.wantApp && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!window.wantApp) {
      throw new Error('WantApp instance not available after waiting');
    }
    
    return window.wantApp;
  };
  
  try {
    console.log('Waiting for WantApp instance...');
    const wantApp = await waitForWantApp();
    console.log('WantApp instance ready, loading items...');
    
    // Clear any previous data to ensure fresh start
    wantApp.items = [];
    wantApp.dataManager.clearCache();
    
    const items = await wantApp.dataManager.getItems(); // Load from Supabase
    console.log('Loaded items from Supabase:', items.length);
    
    // Items are now stored only in Supabase - no local sync needed
    wantApp.items = items; // Store items in the instance
    wantApp.renderItems(items);
    console.log('Items rendered successfully');
    
    // Force UI update to ensure items are visible
    setTimeout(() => {
      if (wantApp.items.length > 0) {
        wantApp.renderItems(wantApp.items);
        console.log('📱 Forced UI re-render for mobile Safari');
      }
    }, 1000);
    
  } catch (error) {
    console.error('Failed to load items:', error);
    
    // Multiple retry attempts with increasing delays
    const retryAttempts = [2000, 5000, 10000]; // 2s, 5s, 10s
    
    retryAttempts.forEach((delay, index) => {
      setTimeout(() => {
        console.log(`Retry attempt ${index + 1} - app initialization...`);
        if (window.wantApp) {
          window.wantApp.dataManager.clearCache();
          window.wantApp.loadItems();
        }
      }, delay);
    });
  }

  // 2) Realtime sync with error handling
  try {
    if (window.__unsubItems) window.__unsubItems();
    
    // Try real-time sync for all devices, with better error handling
    const isMobileSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent);
    const skipRealtime = localStorage.getItem('skip-realtime-sync') === 'true';
    
    if (skipRealtime) {
      console.log('Real-time sync disabled by user preference');
      updateSyncStatus?.('DISABLED');
    } else {
      window.__unsubItems = await subscribeItems(
      async (row) => {
        console.log('Real-time item added:', row);
        try {
          // Item is already in Supabase - no local sync needed
          // Update UI
          if (window.wantApp && window.wantApp.onItemAdded) {
            window.wantApp.onItemAdded(row);
          }
        } catch (error) {
          console.error('Error handling real-time item add:', error);
        }
      },
      async (row) => {
        console.log('Real-time item deleted:', row);
        console.log('Delete event details:', {
          id: row.id,
          userAgent: navigator.userAgent,
          isMobileSafari: /iPad|iPhone|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent)
        });
        try {
          // Item is already deleted from Supabase - no local sync needed
          // Update UI
          if (window.wantApp && window.wantApp.onItemDeleted) {
            console.log('Calling onItemDeleted for item:', row.id);
            window.wantApp.onItemDeleted(row.id);
          } else {
            console.error('window.wantApp or onItemDeleted not available!');
            console.log('window.wantApp:', window.wantApp);
            console.log('onItemDeleted method:', window.wantApp?.onItemDeleted);
          }
        } catch (error) {
          console.error('Error handling real-time item delete:', error);
        }
      },
      updateSyncStatus
    );
    console.log('✅ Real-time sync initialized successfully');
    }
    
    // Start periodic sync as fallback
    if (window.wantApp) {
      window.wantApp.startPeriodicSync();
      
      // Start session refresh interval for mobile Safari
      const isMobileSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent);
      if (isMobileSafari) {
        console.log('📱 Starting session refresh interval for mobile Safari');
        setInterval(async () => {
          try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error || !session) {
              console.log('📱 Session expired, refreshing...');
              const { error: refreshError } = await supabase.auth.refreshSession();
              if (refreshError) {
                console.error('📱 Session refresh failed:', refreshError);
                // Force re-login
                window.location.reload();
              }
            }
          } catch (error) {
            console.error('📱 Session check failed:', error);
          }
        }, 30000); // Check every 30 seconds
      }
      
      // Trigger initial sync check after app loads
      setTimeout(() => {
        window.wantApp.triggerSyncCheck();
      }, 2000); // Wait 2 seconds for app to fully initialize
    }
  } catch (error) {
    console.error('❌ Failed to initialize real-time sync:', error);
    
    // Log error but continue with periodic sync
    console.log('Real-time sync failed, continuing with periodic sync');
    
    // Show user-friendly message
    if (window.wantApp && window.wantApp.showToast) {
      window.wantApp.showToast('Real-time sync unavailable - changes may not sync across devices', 'warning');
    }
    
    // Start periodic sync as fallback even if real-time fails
    if (window.wantApp) {
      window.wantApp.startPeriodicSync();
    }
  }
}

function showLoginScreen() {
  // Not authenticated - show login screen
  const authScreen = document.getElementById('auth-screen');
  const topbar = document.getElementById('topbar');
  const avatarBtn = document.getElementById('avatarBtn');
  const appMain = document.getElementById('appMain');
  
  // Reset all auth screens to default state
  const authMain = document.getElementById('authMain');
  const otpMain = document.getElementById('otpMain');
  const emailConfirm = document.getElementById('emailConfirm');
  
  if (authScreen) authScreen.style.display = 'flex';
  if (topbar) topbar.style.display = 'none';
  if (avatarBtn) avatarBtn.hidden = true;
  if (appMain) appMain.style.display = 'none';
  
  // Show main auth screen and hide others
  if (authMain) authMain.style.display = '';
  if (otpMain) otpMain.style.display = 'none';
  if (emailConfirm) emailConfirm.style.display = 'none';
  
  // Clear any pending email state
  pendingEmail = '';
  
  // Clear any auth messages
  const authMsg = document.getElementById('authMsg');
  const otpMsg = document.getElementById('otpMsg');
  if (authMsg) authMsg.textContent = '';
  if (otpMsg) otpMsg.textContent = '';
  
  // Reset email input
  const authEmail = document.getElementById('authEmail');
  if (authEmail) authEmail.value = '';
  
  // Reset OTP inputs
  const otpGrid = document.getElementById('otpGrid');
  if (otpGrid) {
    otpGrid.querySelectorAll('input').forEach(input => {
      input.value = '';
    });
  }

  // Google login with loading spinner
  document.getElementById('btnGoogle').onclick = async () => {
    const btn = document.getElementById('btnGoogle');
    
    // Show loading state
    btn.innerHTML = `
      <div class="auth-loading-spinner">
        <div class="spinner"></div>
      </div>
      <span>Connecting...</span>
    `;
    btn.disabled = true;
    
    try {
      // Start OAuth flow using new auth function
      await signInWithGoogle();
    } catch (error) {
      console.error('Google sign-in failed:', error);
      // Reset button state
      btn.innerHTML = `
        <span class="gmark"></span>
        Continue with Google
      `;
      btn.disabled = false;
    }
  };
}

function openAccountSheet(user) {
    // Populate user data
    const name = user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || '—';
    const email = user.email || '—';
    
    // Create the account sheet HTML
    const html = `
        <header class="sheet-header">
            <h2>Account</h2>
        </header>
        <div class="sheet-body">
            <div class="account-row">
                <div class="account-label">Name</div>
                <div class="account-value">${name}</div>
            </div>
            <div class="account-row">
                <div class="account-label">Email</div>
                <div class="account-value">${email}</div>
            </div>
            <hr class="sheet-divider" />
            <button id="btn-logout" class="account-danger">
                <span class="icon" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16 17L21 12M21 12L16 7M21 12H9M9 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </span>
                <span>Log out</span>
            </button>
        </div>
    `;
    
    // Use the shared sheet system
    openSheet(html);
    
    // Wire logout button after the sheet is open
    setTimeout(() => {
        const logoutBtn = document.getElementById('btn-logout');
        if (logoutBtn) {
            logoutBtn.onclick = async () => {
                try {
                    logoutBtn.disabled = true;
                    logoutBtn.innerHTML = '<span class="icon">⏳</span><span>Logging out...</span>';
                    
                    await logout();
                    closeSheet();
                } catch (error) {
                    console.error('Logout failed:', error);
                    // Force reload on error
                    window.location.reload();
                }
            };
        }
    }, 100);
}



let accountPopoverEl;
function openAccountPopover(anchorEl, user) {
    closeAccountPopover();
    const pop = document.createElement('div');
    pop.id = 'account-popover';
    pop.className = 'account-popover';
    pop.setAttribute('role', 'dialog');
    pop.innerHTML = `
        <div class="acc-name">${(user.name || user.email || 'Signed in').replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}</div>
        <div class="acc-email">${(user.email || '').replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}</div>
        <div class="acc-divider"></div>
        <button class="acc-logout" id="acc-logout-pop">Log out</button>
    `;
    document.body.appendChild(pop);
    positionPopoverBelow(pop, anchorEl);
    document.getElementById('acc-logout-pop').onclick = async () => {
        try {
            const btn = document.getElementById('acc-logout-pop');
            btn.disabled = true;
            btn.textContent = 'Logging out...';
            
            await logout();
            closeAccountPopover();
        } catch (error) {
            console.error('Logout failed:', error);
            // Force reload on error
            window.location.reload();
        }
    };
    const onDocClick = (e) => { if (!pop.contains(e.target) && e.target !== anchorEl) closeAccountPopover(); };
    const onKey = (e) => { if (e.key === 'Escape') closeAccountPopover(); };
    setTimeout(() => {
        document.addEventListener('click', onDocClick, { capture: true });
        document.addEventListener('keydown', onKey);
        pop._cleanup = () => {
            document.removeEventListener('click', onDocClick, { capture: true });
            document.removeEventListener('keydown', onKey);
        };
    });
    accountPopoverEl = pop;
}

function closeAccountPopover() { 
    accountPopoverEl?._cleanup?.(); 
    accountPopoverEl?.remove(); 
    accountPopoverEl = null; 
}

function positionPopoverBelow(pop, anchorEl) {
    const r = anchorEl.getBoundingClientRect();
    pop.style.position = 'absolute';
    pop.style.top = `${r.bottom + 8 + window.scrollY}px`;
    pop.style.left = `${Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - pop.offsetWidth - 12)}px`;
}



// Cloudflare Worker API functions (DISABLED - Local storage only)
// const LIST_ID = localStorage.getItem('want.syncKey') || 'want-main';

// async function loadItems() {
//     try {
//         console.log(`Fetching items from ${API}/items?listId=${encodeURIComponent(LIST_ID)}`);
//         const r = await fetch(`${API}/items?listId=${encodeURIComponent(LIST_ID)}`);
//         
//         if (!r.ok) {
//             console.error(`Worker API error: ${r.status} ${r.statusText}`);
//             const errorText = await r.text();
//             console.error('Error response:', errorText);
//             throw new Error(`Worker API error: ${r.status} ${r.statusText}`);
//         }
//         
//         const responseText = await r.text();
//         console.log('Worker response:', responseText);
//         
//         const data = JSON.parse(responseText);
//         const { items } = data;
//         return items || [];
//     } catch (error) {
//         console.error('Error in loadItems:', error);
//         throw error;
//     }
// }

// async function saveItemRemote(item) {
//     try {
//         console.log(`Saving item to ${API}/items`);
//         const r = await fetch(`${API}/items`, {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ listId: LIST_ID, item })
//         });
//         
//         if (!r.ok) {
//             console.error(`Worker API error: ${r.status} ${r.statusText}`);
//             const errorText = await r.text();
//             console.error('Error response:', errorText);
//             throw new Error(`Worker API error: ${r.status} ${r.statusText}`);
//         }
//         
//         const result = await r.json();
//         return result;
//     } catch (error) {
//         console.error('Error in saveItemRemote:', error);
//         throw error;
//     }
// }

// async function deleteItemRemote(id) {
//     try {
//         console.log(`Deleting item from ${API}/items?id=${encodeURIComponent(id)}&listId=${encodeURIComponent(LIST_ID)}`);
//         const r = await fetch(`${API}/items?id=${encodeURIComponent(id)}&listId=${encodeURIComponent(LIST_ID)}`, {
//             method: "DELETE"
//         });
//         
//         if (!r.ok) {
//             console.error(`Worker API error: ${r.status} ${r.statusText}`);
//             const errorText = await r.text();
//             console.error('Error response:', errorText);
//             throw new Error(`Worker API error: ${r.status} ${r.statusText}`);
//         }
//         
//         const result = await r.json();
//         return result;
//     } catch (error) {
//         console.error('Error in deleteItemRemote:', error);
//         throw error;
//     }
// }

// Main application logic
export class WantApp {
    constructor() {
        this.dataManager = new SupabaseDataManager();
        this.selectedStore = null; // null = All
        this.pasteTimer = null;
        this.addInFlight = false; // NEW: prevents double-firing
        this.items = []; // Initialize items array
        this.lastSyncTime = Date.now();
        this.syncInterval = null; // For periodic sync fallback
        this.syncCount = 0; // Debug counter
        
        // Add empty state fallback for mobile Safari
        const isMobileSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent);
        if (isMobileSafari) {
            // Check for empty state after 10 seconds and retry loading
            setTimeout(() => {
                if (this.items.length === 0) {
                    console.log('📱 Empty state detected on mobile Safari, retrying data load...');
                    this.loadItems();
                }
            }, 10000);
        }
        
        // Wait for DOM to be ready before initializing
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.init();
            });
        } else {
            this.init();
        }
    }

    async init() {
        // Initialize Supabase auth
        await authInit();
        
        // Test Supabase connection
        console.log('🧪 Testing Supabase connection on mobile Safari...');
        const connectionTest = await this.dataManager.testConnection();
        console.log('🔍 Connection test result:', connectionTest);
        
        // Wire UI immediately when DOM is ready
        this.wireUI();
        this.enableGlobalPaste();
        this.hydrateFromQueryParams();
        
        // Database initialization removed - using Supabase only
        
        // Guard duplicate IDs forever
        ['openAddBtn','addItemBtn','urlInput','addForm'].forEach(id => {
            const els = document.querySelectorAll('#'+id);
            if (els.length > 1) console.warn('Duplicate id:', id, els);
        });
        
        // Restore selection on load (optional)
        try {
            const s = localStorage.getItem('want.selectedStore');
            if (s !== null && s !== "") this.selectedStore = s;
        } catch {}
        
        // Process hash for add.html redirects
        this.processHashAdd();
        
        // Check for success message from add.html
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('added') === 'true') {
            this.showToast('Item saved to Want');
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
    


    wireUI() {
        const openAddBtn = document.getElementById('openAddBtn');        // "+ Add"
        const headerSettingsBtn = document.getElementById('settingsBtn'); // gear icon

        // Always mark as non-submit buttons to avoid form submissions
        openAddBtn?.setAttribute('type', 'button');
        headerSettingsBtn?.setAttribute('type', 'button');

        // Log helpful errors if buttons are not found
        if (!openAddBtn) console.warn('openAddBtn not found');
        if (!headerSettingsBtn) console.warn('settingsBtn not found');

        openAddBtn?.removeEventListener('click', () => this.showAddSheet());
        openAddBtn?.addEventListener('click', () => this.showAddSheet(), { passive: true });

        headerSettingsBtn?.removeEventListener('click', () => this.showSettingsSheet());
        headerSettingsBtn?.addEventListener('click', () => this.showSettingsSheet(), { passive: true });

        // Swipe to close is handled by the bottom sheet component

        // Form submission will be handled by attachAddFormHandler()

        // URL field auto-extraction and other handlers will be attached dynamically

        // More menu controller
        this.setupMoreMenu();

        // Scroll shadow effect
        this.setupScrollShadow();

        // Single click delegation for delete buttons
        this.setupDeleteDelegation();

        // Setup Email OTP handlers
        setupEmailOtpHandlers();

    }

    enableGlobalPaste() {
        window.addEventListener('paste', (e) => {
            // If user is typing in an input/textarea or a modal is open, do NOT auto-add
            const active = document.activeElement;
            const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
            const modalOpen = !!document.querySelector('.sheet.is-open');
            const dt = e.clipboardData || window.clipboardData;
            const text = dt?.getData('text')?.trim() || '';

            if (!text) return;

            if (typing || modalOpen) {
                // Existing behavior: let the paste go to the input (or the modal's URL field handler will pick it up)
                return;
            }

            if (!isProbablyUrl(text)) return;

            e.preventDefault();

            clearTimeout(this.pasteTimer);
            this.pasteTimer = setTimeout(() => {
                this.addItemDirectly(text);
            }, PASTE_DEBOUNCE_MS);
        });
    }

    hydrateFromQueryParams() {
        const u = new URLSearchParams(location.search).get('url');
        if (u) {
            const url = decodeURIComponent(u.trim());
            if (isProbablyUrl(url)) {
                // Clear query params immediately to prevent duplicate processing
                history.replaceState(null, '', location.pathname);
                this.handleUrlPaste(url);
            }
        }
    }

    async handleUrlPaste(url) {
        // Open the Add sheet, pre-fill the URL input, start auto-extraction
        this.showAddSheet();
        const urlInput = document.getElementById('urlInput');
        if (urlInput) {
            urlInput.value = url;
            urlInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    showAddSheet() {
        const html = `
            <form id="addForm">
                <div class="input-container">
                    <input type="url" id="urlInput" name="url" required placeholder="Paste product URL" autofocus>
                    <button type="submit" id="addItemBtn" class="add-button" disabled>
                        <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 19V5M12 5L5 12M12 5L19 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>

                <div id="metaPreview" class="hidden preview">
                    <div class="preview-img-wrap">
                        <img id="previewImg" alt="Preview" />
                    </div>
                    <div class="preview-title" id="previewTitle"></div>
                    <div class="preview-meta">
                        <span id="previewPrice"></span>
                        <span id="previewDomain"></span>
                    </div>
                    <button type="button" id="toggleAdvanced" class="linklike">Edit details</button>
                </div>

                <!-- Advanced fields (hidden by default) -->
                <div id="advanced" class="hidden">
                    <div class="form-group">
                        <label for="titleInput">Title</label>
                        <input type="text" id="titleInput" name="title">
                    </div>
                    <div class="form-group">
                        <label for="priceInput">Price</label>
                        <input type="text" id="priceInput" name="price" placeholder="$99.99">
                    </div>
                    <div class="form-group">
                        <label for="imageInput">Image URL</label>
                        <input type="url" id="imageInput" name="image" placeholder="https://example.com/image.jpg">
                    </div>
                </div>
            </form>
        `;
        
        openSheet(html);
        
        // Attach form handler
        this.attachAddFormHandler();
    }

    hideAddSheet() {
        closeSheet();
        
        // Clear form
        const form = document.getElementById('addForm');
        if (form) form.reset();
        
        this.hidePreview();
        const advanced = document.getElementById('advanced');
        if (advanced) advanced.classList.add('hidden');
        const toggleAdvanced = document.getElementById('toggleAdvanced');
        if (toggleAdvanced) toggleAdvanced.textContent = 'Edit details';
        this.updateAddButton(false);
    }

    showSettingsSheet() {
        const html = `
            <div class="settings-content">
                <div class="settings-section">
                    <h3>Data Management</h3>
                    <div class="settings-actions">
                        <button id="exportBtn" class="btn-secondary">Export Data</button>
                        <button id="importBtn" class="btn-secondary">Import Data</button>
                        <button id="syncBtn" class="btn-secondary">Manual Sync</button>
                    </div>
                    <input type="file" id="importFile" accept=".json" style="display: none;">
                </div>
                <div class="settings-section">
                    <h3>About</h3>
                    <p>Want - Your personal wishlist</p>
                    <p>Version 1.0.0</p>
                    <p>Made in London by JAG Studio Ltd</p>
                </div>
            </div>
        `;
        
        openSheet(html);
        
        // Attach settings handlers
        this.attachSettingsHandlers();
    }

    hideSettingsSheet() {
        closeSheet();
    }

    attachAddFormHandler() {
        const form = document.getElementById('addForm');
        const addBtn = document.getElementById('addItemBtn');
        const urlInput = document.getElementById('urlInput');

        if (!form || !addBtn || !urlInput) return;

        // Remove existing handlers
        form.removeEventListener('submit', this.handleAddFormSubmit);
        
        // Add new handler
        this.handleAddFormSubmit = async (e) => {
            e.preventDefault();
            const raw = urlInput.value.trim();
            const url = this.normalizeUrl(raw);
            if (!isProbablyUrl(url)) { 
                alert('Paste a valid URL'); 
                return; 
            }

            addBtn.disabled = true;
            try {
                await this.addItemDirectly(url);
                this.hideAddSheet();
            } catch (error) {
                console.error('Failed to add item:', error);
                alert('Failed to add item. Please try again.');
            } finally {
                addBtn.disabled = false;
            }
        };
        
        form.addEventListener('submit', this.handleAddFormSubmit);

        // URL field auto-extraction
        urlInput.addEventListener('input', () => {
            this.updateAddButton(!!urlInput.value.trim());
        });
        
        urlInput.addEventListener('paste', (e) => {
            // Let the paste happen first, then process
            setTimeout(() => {
                const value = urlInput.value.trim();
                this.updateAddButton(!!value);
            }, 10);
        });
        
        urlInput.addEventListener('blur', () => {
            this.updateAddButton(!!urlInput.value.trim());
        });

        // Toggle advanced fields
        const toggleAdvanced = document.getElementById('toggleAdvanced');
        if (toggleAdvanced) {
            toggleAdvanced.addEventListener('click', () => {
                this.toggleAdvancedFields();
            });
        }
    }

    attachSettingsHandlers() {
        // Export/Import
        const exportBtn = document.getElementById('exportBtn');
        const importBtn = document.getElementById('importBtn');
        const importFile = document.getElementById('importFile');
        const syncBtn = document.getElementById('syncBtn');

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportData();
            });
        }

        if (importBtn) {
            importBtn.addEventListener('click', () => {
                if (importFile) importFile.click();
            });
        }

        if (importFile) {
            importFile.addEventListener('change', (e) => {
                this.importData(e.target.files[0]);
            });
        }

        if (syncBtn) {
            syncBtn.addEventListener('click', async () => {
                syncBtn.disabled = true;
                syncBtn.textContent = 'Syncing...';
                try {
                    // Force fresh data fetch
                    this.dataManager.clearCache();
                    await this.loadItems();
                    this.showToast('Data refreshed from server');
                } catch (error) {
                    console.error('Manual sync failed:', error);
                    this.showToast('Sync failed', 'error');
                } finally {
                    syncBtn.disabled = false;
                    syncBtn.textContent = 'Manual Sync';
                }
            });
        }
    }





    async loadItems() {
        try {
            console.log('Loading items from Supabase...');
            const items = await this.dataManager.getItems();
            console.log('Loaded items:', items.length);
            this.items = items; // Store items in instance
            this.renderItems(items);
            this.updateStats();
        } catch (error) {
            console.error('Error loading items:', error);
            this.showToast('Failed to load items', 'error');
        }
    }



    renderItems(items) {
        const grid = document.getElementById('itemsGrid');
        const emptyState = document.getElementById('emptyState');

        if (items.length === 0) {
            grid.innerHTML = '';
            emptyState.style.display = 'block';
            // Update store tags even when no items
            this.renderStoreTags(items);
            return;
        }

        emptyState.style.display = 'none';
        grid.innerHTML = items.map(item => this.createItemCard(item)).join('');
        
        // Update store tags with current items
        this.renderStoreTags(items);
        
        // More menu events are handled by delegation in setupMoreMenu()
    }

    // Real-time sync methods for Supabase
    onItemAdded(item) {
        // Check if item already exists to avoid duplicates
        const existingItem = this.items.find(i => i.id === item.id);
        if (existingItem) return;
        
        // Add to local array
        this.items.unshift(item);
        
        // Re-render the grid
        this.renderItems(this.items);
    }

    onItemDeleted(itemId) {
        console.log('onItemDeleted called with itemId:', itemId);
        console.log('Current items before deletion:', this.items.length);
        console.log('Items before deletion:', this.items.map(item => ({ id: item.id, title: item.title })));
        
        // Remove from local array
        const beforeCount = this.items.length;
        this.items = this.items.filter(item => item.id !== itemId);
        const afterCount = this.items.length;
        
        console.log('Items after deletion:', afterCount);
        console.log('Items after deletion:', this.items.map(item => ({ id: item.id, title: item.title })));
        
        // Check if the item was actually removed
        if (beforeCount === afterCount) {
            console.warn('Item was not found in local array, forcing full refresh...');
            // Force a full refresh from server
            this.loadItems();
            return;
        }
        
        // Re-render the grid
        this.renderItems(this.items);
        
        // Update stats
        this.updateStats();
        
        console.log('Item deletion UI update completed');
        
        // Trigger sync checks after delete
        const isMobileSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent);
        if (isMobileSafari) {
            // Multiple sync checks for mobile Safari
            this.triggerSyncCheck(); // Immediate
            setTimeout(() => this.triggerSyncCheck(), 500); // 0.5s
            setTimeout(() => this.triggerSyncCheck(), 1000); // 1s
            setTimeout(() => this.triggerSyncCheck(), 2000); // 2s
        } else {
            // Single sync check for other devices
            setTimeout(() => {
                this.triggerSyncCheck();
            }, 2000);
        }
    }

    // Periodic sync as fallback for real-time sync issues
    startPeriodicSync() {
        // Clear any existing interval
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        // Use faster sync interval for mobile Safari, normal for others
        const isMobileSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent);
        const syncInterval = isMobileSafari ? 5000 : 30000; // 5s for mobile Safari, 30s for others
        
        console.log(`Starting periodic sync every ${syncInterval/1000}s`);
        
        this.syncInterval = setInterval(async () => {
            try {
                this.syncCount++;
                console.log(`🔄 Periodic sync check (#${this.syncCount})...`);
                console.log('Current items count:', this.items.length);
                const freshItems = await this.dataManager.getItems();
                console.log('Fresh items count:', freshItems.length);
                
                // Check if items have changed (by count or by comparing IDs)
                const currentIds = this.items.map(item => item.id).sort();
                const freshIds = freshItems.map(item => item.id).sort();
                const hasChanged = freshItems.length !== this.items.length || 
                                 JSON.stringify(currentIds) !== JSON.stringify(freshIds);
                
            console.log('Has changed:', hasChanged);
            console.log('Current IDs:', currentIds);
            console.log('Fresh IDs:', freshIds);
            console.log('Current IDs JSON:', JSON.stringify(currentIds));
            console.log('Fresh IDs JSON:', JSON.stringify(freshIds));
            console.log('IDs match:', JSON.stringify(currentIds) === JSON.stringify(freshIds));
            
            // Show first few characters of each ID for easier comparison
            console.log('Current ID samples:', currentIds.slice(0, 3).map(id => id.substring(0, 8) + '...'));
            console.log('Fresh ID samples:', freshIds.slice(0, 3).map(id => id.substring(0, 8) + '...'));
                
                if (hasChanged) {
                    console.log('✅ Items changed during periodic sync, updating UI');
                    console.log('Previous count:', this.items.length, 'New count:', freshItems.length);
                    this.items = freshItems;
                    this.renderItems(this.items);
                    this.updateStats();
                    console.log('✅ UI updated with fresh items');
                } else {
                    console.log('ℹ️ No changes detected during periodic sync');
                }
            } catch (error) {
                console.error('❌ Periodic sync failed:', error);
            }
        }, syncInterval);
        
        console.log('Periodic sync started as fallback');
        
        
        // Enhanced visibility change handler for all devices
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('App became visible, triggering fresh data fetch...');
                // Clear cache and force fresh fetch
                this.dataManager.clearCache();
                this.loadItems();
            }
        });
        
        // Additional handlers for mobile Safari
        if (isMobileSafari) {
            // Page show/hide events for better mobile coverage
            window.addEventListener('pageshow', () => {
                console.log('📱 Page shown, triggering fresh data fetch...');
                this.dataManager.clearCache();
                this.loadItems();
            });
            
            window.addEventListener('pagehide', () => {
                console.log('📱 Page hidden, clearing cache...');
                this.dataManager.clearCache();
            });
            
            // Focus events
            window.addEventListener('focus', () => {
                console.log('📱 Window focused, triggering fresh data fetch...');
                this.dataManager.clearCache();
                this.loadItems();
            });
        }
        
        // Add immediate sync triggers for mobile Safari
        if (isMobileSafari) {
            console.log('📱 Mobile Safari detected - adding immediate sync triggers');
            
            // Sync on user interactions
            const immediateSync = () => {
                console.log('📱 User interaction detected, triggering immediate sync...');
                this.triggerSyncCheck();
            };
            
            // Add multiple event listeners for comprehensive coverage
            document.addEventListener('click', immediateSync);
            document.addEventListener('touchstart', immediateSync);
            document.addEventListener('touchend', immediateSync);
            document.addEventListener('scroll', immediateSync);
            document.addEventListener('resize', immediateSync);
            
            // Add sync triggers for specific UI elements
            const addButton = document.getElementById('openAddBtn');
            const settingsButton = document.getElementById('settingsBtn');
            
            if (addButton) addButton.addEventListener('click', immediateSync);
            if (settingsButton) settingsButton.addEventListener('click', immediateSync);
        }
    }

    // Trigger immediate sync check
    async triggerSyncCheck() {
        try {
            this.syncCount++;
            console.log(`🔄 Sync check triggered (#${this.syncCount})...`);
            
            const freshItems = await this.dataManager.getItems();
            
            // Check if items have changed
            const currentIds = this.items.map(item => item.id).sort();
            const freshIds = freshItems.map(item => item.id).sort();
            const hasChanged = freshItems.length !== this.items.length || 
                             JSON.stringify(currentIds) !== JSON.stringify(freshIds);
            
            if (hasChanged) {
                console.log('✅ Items changed, updating UI');
                console.log('Previous count:', this.items.length, 'New count:', freshItems.length);
                this.items = freshItems;
                this.renderItems(this.items);
                this.updateStats();
            } else {
                console.log('ℹ️ No changes detected');
            }
        } catch (error) {
            console.error('❌ Sync check failed:', error);
        }
    }

    // Stop periodic sync
    stopPeriodicSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('Periodic sync stopped');
        }
    }



    normalizeUrl(str) {
        const s = String(str).trim();
        if (!s) return "";
        if (/^https?:\/\//i.test(s)) return s;
        if (/^[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(s)) return `https://${s}`;
        return s;
    }

    hostnameOf(u) {
        try { 
            return new URL(u).hostname.replace(/^www\./i,''); 
        } catch { 
            return ''; 
        }
    }

    proxiedImage(url, w = 800, h = 800) {
        if (!url) return "";
        return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=${w}&h=${h}&fit=cover`;
    }

    async buildItemFromUrl(url) {
        const host = this.hostnameOf(url);
        const meta = this.extractBasicMetadata(url); // Use local fallback instead of Worker

        // Enhanced image handling for problematic sites
        let original = meta?.image || '';
        let proxied = '';
        let fallback = `https://www.google.com/s2/favicons?domain=${host}&sz=128`;

        // Special handling for known problematic sites
        if (host.includes('zara.com')) {
            fallback = 'https://www.google.com/s2/favicons?domain=zara.com&sz=128&scale=2';
        } else if (host.includes('hm.com') || host.includes('h&m')) {
            fallback = 'https://www.google.com/s2/favicons?domain=hm.com&sz=128&scale=2';
        } else if (host.includes('amazon.')) {
            fallback = 'https://www.google.com/s2/favicons?domain=amazon.com&sz=128&scale=2';
        }

        // Only try to proxy if we have an original image and it's not from a problematic site
        if (original && !host.includes('zara.com') && !host.includes('hm.com') && !host.includes('amazon.')) {
            proxied = this.proxiedImage(original);
        }

        const createdAt = Date.now();
        return {
            id: crypto?.randomUUID ? crypto.randomUUID() : String(createdAt),
            url,
            title: meta?.title || this.getDomainDisplayName(host),
            price: meta?.price || '',
            image: withStableBust(proxied || fallback, createdAt), // stable cache bust
            originalImage: original, // keep for onerror fallback in render
            domain: this.normalizedDomainFrom(url),
            createdAt,
        };
    }

    // Legacy method - no longer used (replaced by addItemDirectly)

    // Load items from Cloudflare Worker (DISABLED)
    // async loadItemsFromWorker() {
    //     try {
    //         console.log('Loading items from Cloudflare Worker...');
    //         const items = await loadItems();
    //         
    //         // Update local items array
    //         this.items = items;
    //         
    //         // Also cache in IndexedDB for offline access
    //         for (const item of items) {
    //             await this.db.upsertItem(item);
    //         }
    //         
    //         console.log(`Loaded ${items.length} items from Worker`);
    //         
    //         // Render the grid
    //         await this.renderGridFiltered();
    //     } catch (error) {
    //         console.error('Error loading items from Worker:', error);
    //         // Fallback to local IndexedDB
    //         await this.renderGridFiltered();
    //     }
    // }



    // Returns eTLD+1 in most cases (simple heuristic, handles common multi-part TLDs)
    getMainDomain(urlStr) {
        try {
            const host = new URL(urlStr).hostname.replace(/^www\./i, "");
            const parts = host.split(".");
            const multiTLD = new Set([
                "co.uk","com.au","com.br","co.jp","com.cn","com.hk","com.sg",
                "com.tr","com.mx","com.ar","co.kr","com.tw","com.my","co.in"
            ]);
            if (parts.length <= 2) return host;
            const last2 = parts.slice(-2).join(".");
            const last3 = parts.slice(-3).join(".");
            return multiTLD.has(last2) && parts.length >= 3 ? last3 : last2;
        } catch {
            return "";
        }
    }

    // When saving items, ensure we store a normalized domain
    normalizedDomainFrom(urlStr) {
        const d = this.getMainDomain(urlStr);
        return d || (function(){ try { return new URL(urlStr).hostname.replace(/^www\./i,""); } catch { return ""; }})();
    }

    // Store tags functionality
    getDomainCounts(items) {
        const counts = new Map();
        for (const it of items) {
            const d = it.domain || this.getMainDomain(it.url);
            if (!d) continue;
            counts.set(d, (counts.get(d) || 0) + 1);
        }
        return counts;
    }

    renderStoreTags(items) {
        const el = document.getElementById('storeTags');
        if (!el) return;

        // Hide tags when there are no items
        if (items.length === 0) {
            el.style.display = 'none';
            return;
        }

        // Show tags when there are items
        el.style.display = 'block';

        const counts = this.getDomainCounts(items);
        const entries = Array.from(counts.entries())
            .sort((a, b) => a[0].localeCompare(b[0])); // sort alphabetically

        const chips = [];
        chips.push(`
            <button class="tag-chip ${this.selectedStore ? "" : "active"}" data-store="">
                All<span class="tag-count">${items.length}</span>
            </button>
        `);
        
        for (const [domain, count] of entries) {
            chips.push(`
                <button class="tag-chip ${this.selectedStore === domain ? "active" : ""}" data-store="${domain}">
                    ${domain}<span class="tag-count">${count}</span>
                </button>
            `);
        }
        
        el.innerHTML = chips.join("");

        // Events (delegate)
        el.querySelectorAll('.tag-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const store = btn.dataset.store || null;
                console.log('Tag clicked:', { store, currentItems: this.items?.length });
                
                this.selectedStore = store;
                // persist (optional)
                try { 
                    localStorage.setItem('want.selectedStore', store ?? ""); 
                } catch {}
                this.renderStoreTags(items); // re-highlight
                this.renderGridFiltered();   // apply filter
            });
        });
    }

    // Refresh store tags with current items
    async refreshStoreTags() {
        // Use the items already loaded from Supabase
        if (this.items) {
            this.renderStoreTags(this.items);
        }
    }

    async renderGridFiltered() {
        // Use the items already loaded from Supabase (this.items)
        if (!this.items) {
            console.warn('No items available for filtering');
            return;
        }
        
        const filtered = this.selectedStore
            ? this.items.filter(it => (it.domain || this.getMainDomain(it.url)) === this.selectedStore)
            : this.items;

        console.log('Filtering items:', {
            total: this.items.length,
            selectedStore: this.selectedStore,
            filtered: filtered.length
        });

        // Reuse existing renderItems but pass filtered
        this.renderItems(filtered);

        // Always (re)build tags from the full list so counts are accurate
        this.renderStoreTags(this.items);
    }

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Swipe to close is now handled by the bottom sheet component

        renderOverflowButton(item) {
        return `
            <button class="overflow-btn" aria-label="More options" aria-haspopup="menu" aria-expanded="false" data-id="${item.id}">
                <!-- three dots (vertical) -->
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 13c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M12 6c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M12 20c.55 0 1-.45 1-1s-.45-1-1-1-1 .45-1 1 .45 1 1 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        `;
    }

    createItemCard(item) {
        const domain = item.domain || this.hostnameOf(item.url);
        const title = item.title || domain;
        
        // Check for video first, then image
        const hasVideo = item.video && item.video.trim();
        const hasRealImage = item.image && !this.isFavicon(item.image);

        const thumbClasses = [
            'thumb',
            (hasVideo || hasRealImage) ? '' : 'placeholder no-image'
        ].join(' ').trim();

        let mediaTag = '';
        if (hasVideo) {
            mediaTag = `<div class="video-container" style="position: relative; width: 100%; height: 100%;">
                <video
                    src="${this.escapeHtml(item.video)}"
                    muted
                    loop
                    playsinline
                    style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;"
                    onloadstart="this.parentElement.classList.add('loaded')"
                    onclick="this.play(); this.nextElementSibling.style.display='none';">
                </video>
                <div class="play-button-overlay" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.7); border-radius: 50%; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                </div>
            </div>`;
        } else if (hasRealImage) {
            mediaTag = `<img src="${this.escapeHtml(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"
                   onload="this.parentElement.classList.add('loaded')" />`;
        }

        return `
            <article class="item-card" data-id="${item.id}">
                <a href="${this.escapeHtml(item.url)}" target="_blank" rel="noopener" class="card-link">
                    <div class="${thumbClasses}">
                        ${mediaTag}
                    </div>
                    <div class="meta">
                        <h3 class="title">${this.escapeHtml(title)}</h3>
                        ${item.price ? `<div class="price">${this.escapeHtml(item.price)}</div>` : ''}
                        <div class="domain">${this.escapeHtml(domain)}</div>
                    </div>
                </a>
                ${this.renderOverflowButton(item)}
            </article>
        `;
    }

    // Render a single item card (for optimistic UI)
    renderItemCard(item) {
        const grid = document.getElementById('itemsGrid');
        const emptyState = document.getElementById('emptyState');
        
        // Hide empty state if we have items
        emptyState.style.display = 'none';
        
        // Create the card HTML
        const cardHtml = this.createItemCard(item);
        
        // Add optimistic styling if needed
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cardHtml;
        const card = tempDiv.firstElementChild;
        
        if (item._optimistic) {
            card.classList.add('optimistic');
            // Shimmer effect is handled by CSS, no inline opacity needed
        }
        
        // Insert at the beginning of the grid
        grid.insertBefore(card, grid.firstChild);
        
        // Update store tags when adding first item
        if (this.items.length === 0) {
            // This is the first item, update store tags immediately
            this.renderStoreTags([item]);
        }
        
        // Overflow button events are handled by delegation in setupMoreMenu()
    }

    getDefaultImage(domain) {
        // Try to get favicon from domain
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    }

    // upsertItem method removed - now using dataManager.addOrUpdateItem directly

    async deleteItem(id) {
        try {
            console.log('Deleting item:', id);
            console.log('Items before delete:', this.items.length);
            
            // Delete from Supabase
            await this.dataManager.deleteItem(id);
            
            // Update local items array
            this.items = this.items.filter(item => item.id !== id);
            
            console.log('Items after delete:', this.items.length);
            
            // Re-render the grid with updated items
            this.renderItems(this.items);
            this.updateStats();
            this.showToast('Item deleted', 'success');
            
            // Trigger a single sync check after delete
            setTimeout(() => {
                this.triggerSyncCheck();
            }, 1000);
        } catch (error) {
            console.error('Error deleting item:', error);
            this.showToast('Error deleting item', 'error');
        }
    }

    // Helper to detect favicons
    isFavicon(url) {
        if (!url) return false;
        return /google\.com\/s2\/favicons/i.test(url);
    }

    // 1) URL helpers
    isProbablyUrl(str) {
        try {
            const u = new URL(str);
            return /^https?:$/.test(u.protocol);
        } catch {
            return /^[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(str);
        }
    }

    normalizeUrl(str) {
        if (/^https?:\/\//i.test(str)) return str.trim();
        if (/^[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(str)) return `https://${str.trim()}`;
        return str.trim();
    }

    hostnameOf(u) { 
        try { 
            return new URL(u).hostname; 
        } catch { 
            return ''; 
        } 
    }

    async handleUrlInput(url) {
        console.log('handleUrlInput called with:', url);
        
        if (!url) {
            this.hidePreview();
            this.updateAddButton(false);
            return;
        }

        // Check if URL is valid
        if (!isProbablyUrl(url)) {
            console.log('URL not valid:', url);
            this.hidePreview();
            this.updateAddButton(false);
            return;
        }

        console.log('Processing URL:', url);

        // Enable add button for valid URL
        this.updateAddButton(true);

        // Show loading state
        this.showPreviewLoading();

        try {
            // Use the new Worker endpoint for robust extraction
            console.log('Fetching metadata from worker for:', url);
            const res = await fetch(`${EXTRACT_ENDPOINT}?url=${encodeURIComponent(url)}`, {
                mode: 'cors',
                credentials: 'omit',
                redirect: 'follow',
                headers: { 'Accept': 'application/json' },
            });
            
            console.log('Worker response status:', res.status);
            
            if (res.ok) {
                const meta = await res.json();
                console.log('Preview data (Worker):', meta);
                
                // Check if worker returned useful data
                if (meta && (meta.title || meta.image || meta.price)) {
                    this.updatePreview(meta);
                    this.showPreview();
                    
                    // Update advanced fields if they're visible
                    if (!document.getElementById('advanced').classList.contains('hidden')) {
                        this.setAdvancedFormValues(meta);
                    }
                } else {
                    console.log('Worker returned empty data, using fallback');
                    throw new Error('Worker returned empty data');
                }
            } else {
                const errorText = await res.text();
                console.error('Worker error response:', errorText);
                throw new Error(`Worker returned ${res.status}: ${errorText}`);
            }
        } catch (error) {
            console.error('Error handling URL input:', error);
            // Show fallback preview
            const fallbackMeta = this.extractBasicMetadata(url);
            console.log('Using fallback metadata:', fallbackMeta);
            this.updatePreview(fallbackMeta);
            this.showPreview();
        }
    }



    // async enrichFromMeta(url) {
    //     if (!this.META_ENDPOINT) return null;
    //     try {
    //         const r = await fetch(`${this.META_ENDPOINT}/meta?url=${encodeURIComponent(url)}`, {
    //             method: 'GET',
    //             mode: 'cors',
    //             headers: {
    //                 'Accept': 'application/json',
    //             }
    //         });
    //         if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    //         const d = await r.json();
    //         
    //         if (d.error) {
    //             console.log('Worker returned error:', d.error);
    //             return null;
    //         }
    //         
    //         // Process image URL - store original for fallback
    //         let image = '';
    //         if (d.image) {
    //             // Store original URL for fallback, use weserv.nl for display
    //         }
    //         
    //         return {
    //             title: d.title || '',
    //             image,
    //             price: d.price || '',
    //         };
    //     } catch (error) {
    //         console.log('enrichFromMeta failed:', error.message);
    //         // Return null to trigger fallback
    //         return null;
    //     }
    // }

    // Fallback metadata extraction when worker fails
    extractBasicMetadata(url) {
        const host = this.hostnameOf(url);
        
        // Enhanced fallback image handling for problematic sites
        let fallbackImg = `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
        
        // Special handling for known problematic sites with better favicon URLs
        if (host.includes('zara.com')) {
            fallbackImg = 'https://www.google.com/s2/favicons?domain=zara.com&sz=128&scale=2';
        } else if (host.includes('hm.com') || host.includes('h&m')) {
            fallbackImg = 'https://www.google.com/s2/favicons?domain=hm.com&sz=128&scale=2';
        } else if (host.includes('amazon.')) {
            fallbackImg = 'https://www.google.com/s2/favicons?domain=amazon.com&sz=128&scale=2';
        }
        
        // Try to extract title from URL path with better parsing
        let title = this.getDomainDisplayName(host);
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
            
            // Enhanced title extraction for problematic e-commerce sites
            if (host.includes('zara.com') || host.includes('hm.com') || host.includes('amazon.')) {
                // Site-specific patterns
                let productPatterns = [];
                
                if (host.includes('zara.com')) {
                    // Zara specific patterns
                    productPatterns = [
                        /\/product\/([^\/\?]+)/i,
                        /\/[a-z-]+\/([^\/\?]+)/i, // e.g., /women/dresses/product-name
                        /\/[A-Z0-9]{8,}/i, // Zara product codes
                    ];
                } else if (host.includes('amazon.')) {
                    // Amazon specific patterns
                    productPatterns = [
                        /\/dp\/([A-Z0-9]{10})/i, // Amazon ASIN
                        /\/gp\/product\/([A-Z0-9]{10})/i, // Amazon product
                        /\/[A-Z0-9]{10,}/i, // Long alphanumeric (likely product ID)
                        /\/[^\/]+\/dp\/([A-Z0-9]{10})/i, // Product with category
                    ];
                } else {
                    // Generic e-commerce patterns
                    productPatterns = [
                        /\/product\/([^\/\?]+)/i,
                        /\/item\/([^\/\?]+)/i,
                        /\/p\/([^\/\?]+)/i,
                        /\/dp\/([A-Z0-9]+)/i,
                        /\/[A-Z0-9]{10,}/i,
                    ];
                }
                
                for (const pattern of productPatterns) {
                    const match = url.match(pattern);
                    if (match && match[1]) {
                        let productName = match[1]
                            .replace(/[-_]/g, ' ')
                            .replace(/\.[^/.]+$/, '') // Remove file extensions
                            .replace(/\?.*$/, '') // Remove query parameters
                            .replace(/#.*$/, '') // Remove hash fragments
                            .trim();
                        
                        // Special handling for Amazon ASINs - use a more descriptive title
                        if (host.includes('amazon.') && /^[A-Z0-9]{10}$/.test(productName)) {
                            // For Amazon ASINs, try to get a better title from the URL path
                            const pathMatch = url.match(/\/[^\/]+\/dp\/[A-Z0-9]{10}\/?/i);
                            if (pathMatch) {
                                const pathBeforeAsin = pathMatch[0].replace(/\/dp\/[A-Z0-9]{10}\/?/i, '');
                                const category = pathBeforeAsin.split('/').pop();
                                if (category && category.length > 2) {
                                    productName = category.replace(/[-_]/g, ' ');
                                }
                            }
                        }
                        
                        // Special handling for Zara product codes
                        if (host.includes('zara.com') && /^[A-Z0-9]{8,}$/.test(productName)) {
                            // For Zara product codes, try to get category from URL
                            const categoryMatch = url.match(/\/([a-z-]+)\/[A-Z0-9]{8,}/i);
                            if (categoryMatch && categoryMatch[1]) {
                                productName = categoryMatch[1].replace(/[-_]/g, ' ');
                            }
                        }
                        
                        if (productName.length > 2 && !/^\d+$/.test(productName)) {
                            title = productName;
                            break;
                        }
                    }
                }
            }
            
            // Enhanced fallback to path-based extraction
            if (pathParts.length > 0 && title === this.getDomainDisplayName(host)) {
                // For Zara, try to get category from path
                if (host.includes('zara.com')) {
                    const categoryIndex = pathParts.findIndex(part => 
                        ['women', 'men', 'kids', 'home', 'beauty'].includes(part.toLowerCase())
                    );
                    if (categoryIndex !== -1 && categoryIndex < pathParts.length - 1) {
                        const category = pathParts[categoryIndex];
                        const subcategory = pathParts[categoryIndex + 1];
                        if (subcategory && subcategory !== 'index.html') {
                            title = `${category} ${subcategory}`.replace(/[-_]/g, ' ');
                        } else {
                            title = category.replace(/[-_]/g, ' ');
                        }
                    }
                }
                // For Amazon, try to get category from path
                else if (host.includes('amazon.')) {
                    const categoryIndex = pathParts.findIndex(part => 
                        part.length > 3 && !/^[A-Z0-9]{10,}$/.test(part) && !/^\d+$/.test(part)
                    );
                    if (categoryIndex !== -1) {
                        const category = pathParts[categoryIndex];
                        if (category && category !== 'index.html' && category !== 'dp' && category !== 'gp') {
                            title = category.replace(/[-_]/g, ' ');
                        }
                    }
                }
                // Generic fallback
                else {
                    // Use last meaningful path segment as title
                    const lastPart = pathParts[pathParts.length - 1];
                    if (lastPart && lastPart !== 'index.html' && lastPart !== 'index') {
                        // Clean up the title
                        let cleanTitle = lastPart
                            .replace(/[-_]/g, ' ')
                            .replace(/\.[^/.]+$/, '') // Remove file extensions
                            .replace(/\?.*$/, '') // Remove query parameters
                            .replace(/#.*$/, '') // Remove hash fragments
                            .trim();
                        
                        // Only use if it's meaningful (not just numbers or single chars)
                        if (cleanTitle.length > 2 && !/^\d+$/.test(cleanTitle)) {
                            title = cleanTitle;
                        }
                    }
                }
            }
            
            // Try to extract from search params for e-commerce sites
            const searchParams = urlObj.searchParams;
            if (searchParams.has('q') || searchParams.has('search')) {
                const searchTerm = searchParams.get('q') || searchParams.get('search');
                if (searchTerm && searchTerm.length > 2) {
                    title = decodeURIComponent(searchTerm);
                }
            }
        } catch (e) {
            // Keep domain name as title
        }
        
        return {
            title: title,
            image: fallbackImg,
            price: '',
            domain: host,
        };
    }

    // Get user-friendly domain display names
    getDomainDisplayName(host) {
        const domainMap = {
            'zara.com': 'Zara',
            'www.zara.com': 'Zara',
            'hm.com': 'H&M',
            'www.hm.com': 'H&M',
            'www2.hm.com': 'H&M',
            'amazon.com': 'Amazon',
            'www.amazon.com': 'Amazon',
            'amazon.co.uk': 'Amazon UK',
            'www.amazon.co.uk': 'Amazon UK',
            'amazon.de': 'Amazon Germany',
            'www.amazon.de': 'Amazon Germany',
            'amazon.fr': 'Amazon France',
            'www.amazon.fr': 'Amazon France',
            'amazon.it': 'Amazon Italy',
            'www.amazon.it': 'Amazon Italy',
            'amazon.es': 'Amazon Spain',
            'www.amazon.es': 'Amazon Spain',
            'amazon.ca': 'Amazon Canada',
            'www.amazon.ca': 'Amazon Canada',
            'amazon.com.au': 'Amazon Australia',
            'www.amazon.com.au': 'Amazon Australia',
            'amazon.co.jp': 'Amazon Japan',
            'www.amazon.co.jp': 'Amazon Japan',
            'instagram.com': 'Instagram',
            'www.instagram.com': 'Instagram',
        };
        
        return domainMap[host] || host.replace(/^www\./, '');
    }

    showPreviewLoading() {
        const preview = document.getElementById('metaPreview');
        const previewImg = document.getElementById('previewImg');
        const previewTitle = document.getElementById('previewTitle');
        const previewPrice = document.getElementById('previewPrice');
        const previewDomain = document.getElementById('previewDomain');

        preview.classList.remove('hidden');
        previewImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiBmaWxsPSIjRjFGNUY5Ii8+CjxwYXRoIGQ9Ik02MCAzNEM0OC45NTQzIDM0IDQwIDQyLjk1NDMgNDAgNTBDNDAgNTcuMDQ2IDQ4Ljk1NDMgNjYgNjAgNjZDNzEuMDQ2IDY2IDgwIDU3LjA0NiA4MCA1MEM4MCA0Mi45NTQzIDcxLjA0NiAzNCA2MCAzNFoiIGZpbGw9IiNDQkQtNDY2Ii8+CjxwYXRoIGQ9Ijk2IDk2SDI0QzI0IDk2IDI0IDk2IDI0IDk2VjcyQzI0IDcyIDI0IDcyIDI0IDcySDk2Qzk2IDcyIDk2IDcyIDk2IDcyVjk2WiIgZmlsbD0iI0NCQi00NjYiLz4KPC9zdmc+Cg==';
        previewTitle.textContent = 'Loading...';
        previewPrice.textContent = '';
        previewDomain.textContent = '';
    }

    updatePreview({ title, image, price, domain }) {
        const previewImg = document.getElementById('previewImg');
        const previewTitle = document.getElementById('previewTitle');
        const previewPrice = document.getElementById('previewPrice');
        const previewDomain = document.getElementById('previewDomain');

        // Set image with proxy-first approach
        const fallbackImg = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
        
        if (image) {
            const original = image;
            const proxied = original ? this.proxiedImage(original) : '';

            if (previewImg) {
                previewImg.referrerPolicy = 'no-referrer';
                previewImg.src = proxied || fallbackImg;
                previewImg.onerror = () => {
                    if (original && previewImg.src !== original) {
                        previewImg.src = original; // fallback to original
                    } else {
                        previewImg.src = fallbackImg; // final fallback to favicon
                    }
                };
            }
        } else {
            previewImg.src = fallbackImg;
        }
        
        previewTitle.textContent = title;
        previewPrice.textContent = price || 'N/A';
        previewDomain.textContent = domain;
    }

    showPreview() {
        document.getElementById('metaPreview').classList.remove('hidden');
    }

    hidePreview() {
        document.getElementById('metaPreview').classList.add('hidden');
    }

    toggleAdvancedFields() {
        const advanced = document.getElementById('advanced');
        const toggleBtn = document.getElementById('toggleAdvanced');
        
        if (advanced.classList.contains('hidden')) {
            advanced.classList.remove('hidden');
            toggleBtn.textContent = 'Hide details';
            
            // Pre-fill advanced fields with current preview data
            const urlInput = document.getElementById('urlInput');
            if (urlInput.value) {
                this.handleUrlInput(urlInput.value.trim());
            }
        } else {
            advanced.classList.add('hidden');
            toggleBtn.textContent = 'Edit details';
        }
    }

    setAdvancedFormValues({ title, image, price }) {
        const titleInput = document.getElementById('titleInput');
        const priceInput = document.getElementById('priceInput');
        const imageInput = document.getElementById('imageInput');
        
        titleInput.value = title;
        priceInput.value = price;
        imageInput.value = image;
    }

    updateAddButton(enabled) {
        const addBtn = document.getElementById('addItemBtn');
        console.log('updateAddButton called with enabled:', enabled);
        addBtn.disabled = !enabled;
        console.log('Button disabled state:', addBtn.disabled);
    }

    async exportData() {
        try {
            // Export data from Supabase
            const items = await this.dataManager.getItems();
            const dataStr = JSON.stringify(items, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `want-backup-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(url);
            this.showToast('Data exported successfully');
        } catch (error) {
            console.error('Error exporting data:', error);
            this.showToast('Error exporting data', 'error');
        }
    }

    async importData(file) {
        if (!file) return;
        
        try {
            const text = await file.text();
            const items = JSON.parse(text);
            
            let imported = 0;
            let updated = 0;
            
            for (const item of items) {
                try {
                    await this.dataManager.addOrUpdateItem(item);
                    imported++;
                } catch (error) {
                    console.error('Error importing item:', error);
                }
            }
            
            await this.loadItems();
            this.showToast(`Imported ${imported} items`);
            this.hideSettingsModal();
        } catch (error) {
            console.error('Error importing data:', error);
            this.showToast('Error importing data', 'error');
        }
        
        // Reset file input
        document.getElementById('importFile').value = '';
    }

    openEditForUrl(url) {
        // Find the item by URL and open edit modal
        this.dataManager.getItemByUrl(url).then(item => {
            if (item) {
                // Pre-fill the form with existing data
                document.getElementById('urlInput').value = item.url;
                document.getElementById('titleInput').value = item.title;
                document.getElementById('priceInput').value = item.price;
                document.getElementById('imageInput').value = item.image;
                
                // Show advanced fields and update preview
                document.getElementById('advanced').classList.remove('hidden');
                document.getElementById('toggleAdvanced').textContent = 'Hide details';
                
                // Update preview
                this.updatePreview({ 
                    title: item.title, 
                    image: item.image, 
                    price: item.price, 
                    domain: item.domain 
                });
                this.showPreview();
                this.updateAddButton(true);
                
                // Show the modal
                this.showModal();
            }
        }).catch(error => {
            console.error('Error finding item for edit:', error);
        });
    }

    // Utility: toast
    showToast(msg, type = 'success', duration = 3000) {
        let t = document.getElementById('toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'toast';
            t.setAttribute('aria-live', 'polite');
            t.setAttribute('aria-atomic', 'true');
            document.body.appendChild(t);
        }
        
        // Clear any existing classes
        t.className = '';
        
        // Set message and type
        t.textContent = msg;
        t.classList.add(type);
        
        // Show toast
        t.classList.add('show');
        
        // Auto-hide after duration
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            t.classList.remove('show');
        }, duration);
    }

    setupMoreMenu() {
        const moreMenu = document.getElementById('moreMenu');
        const moreBackdrop = document.getElementById('moreMenuBackdrop');
        let moreCurrentId = null;

        const openMoreMenuFor = (targetBtn, itemId) => {
            moreCurrentId = itemId;

            // First show the menu to get its dimensions
            moreMenu.hidden = false;
            moreBackdrop.hidden = false;
            
            // Compute position near the button
            const r = targetBtn.getBoundingClientRect();
            const menuRect = moreMenu.getBoundingClientRect();
            const pad = 8;
            
            // Calculate initial position (below the button)
            // Use viewport coordinates directly since menu is position: fixed
            let top = r.bottom + pad;
            let left = r.left;
            
            // Ensure menu doesn't go off-screen horizontally
            if (left + menuRect.width > window.innerWidth - pad) {
                left = window.innerWidth - menuRect.width - pad;
            }
            if (left < pad) {
                left = pad;
            }
            
            // Ensure menu doesn't go off-screen vertically
            if (top + menuRect.height > window.innerHeight - pad) {
                // Position above the button instead
                top = r.top - menuRect.height - pad;
            }
            if (top < pad) {
                top = pad;
            }
            
            // Apply position using viewport coordinates (no scroll offset needed for fixed positioning)
            moreMenu.style.top = `${top}px`;
            moreMenu.style.left = `${left}px`;
            
            // Debug logging
            console.log('Menu positioned:', {
                buttonRect: r,
                menuRect: menuRect,
                finalPosition: { top, left },
                menuStyle: { top: moreMenu.style.top, left: moreMenu.style.left }
            });
            
            requestAnimationFrame(() => {
                moreBackdrop.classList.add('active');
            });

            // A11y
            targetBtn.setAttribute('aria-expanded', 'true');
            moreMenu.focus?.();
        };

        const closeMoreMenu = () => {
            moreBackdrop.classList.remove('active');
            moreBackdrop.hidden = true;
            moreMenu.hidden = true;

            // Reset any expanded button
            document.querySelectorAll('.overflow-btn[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
            moreCurrentId = null;
        };

        // Delegate click on overflow buttons
        document.addEventListener('click', (e) => {
            const btn = e.target.closest?.('.overflow-btn');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            
            // Debug logging
            console.log('Overflow button clicked:', {
                id: btn.dataset.id,
                rect: btn.getBoundingClientRect(),
                scrollY: window.scrollY,
                scrollX: window.scrollX,
                viewport: { width: window.innerWidth, height: window.innerHeight }
            });
            
            openMoreMenuFor(btn, btn.dataset.id);
        });

        // Backdrop / outside click / ESC
        moreBackdrop.addEventListener('click', closeMoreMenu);
        document.addEventListener('keydown', (e) => { 
            if (e.key === 'Escape' && !moreMenu.hidden) closeMoreMenu(); 
        });

        // Menu actions
        moreMenu.addEventListener('click', async (e) => {
            const actionBtn = e.target.closest('.menu-item');
            if (!actionBtn) return;
            
            const action = actionBtn.dataset.action;
            if (!moreCurrentId) {
                console.error('No current item ID for menu action');
                closeMoreMenu();
                return;
            }

            try {
                // Get item from local items array (Supabase items are already loaded)
                console.log('Looking for item with ID:', moreCurrentId);
                console.log('Available items:', this.items?.map(i => ({ id: i.id, title: i.title })));
                
                const item = this.items?.find(i => i.id === moreCurrentId);
                
                if (!item) { 
                    console.error('Item not found for ID:', moreCurrentId);
                    console.error('Available item IDs:', this.items?.map(i => i.id));
                    this.showToast('Item not found');
                    closeMoreMenu(); 
                    return; 
                }

                if (action === 'share') {
                    try {
                        if (navigator.share) {
                            await navigator.share({ 
                                title: item.title || item.domain, 
                                url: item.url 
                            });
                        } else {
                            await navigator.clipboard.writeText(item.url);
                            this.showToast('Link copied', 'info');
                        }
                    } catch(error) { 
                        console.log('Share cancelled or failed:', error);
                        // Don't show error for user cancellation
                    }
                }

                if (action === 'copy') {
                    const url = item.url;
                    try {
                        if (navigator.clipboard?.writeText) {
                            await navigator.clipboard.writeText(url);
                        } else {
                            // Fallback
                            const ta = document.createElement('textarea');
                            ta.value = url;
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand('copy');
                            ta.remove();
                        }
                        this.showToast('Link copied', 'info');
                    } catch (e) {
                        this.showToast('Could not copy link', 'error');
                        console.error('Copy failed', e);
                    }
                }

                if (action === 'delete') {
                    const ok = confirm('Delete this item?');
                    if (ok) {
                        try {
                            // Delete from Supabase
                            await this.dataManager.deleteItem(item.id);
                            
                            // Update local items array
                            this.items = this.items.filter(i => i.id !== item.id);
                            
                            // Re-render the grid
                            this.renderItems(this.items);
                            this.showToast('Item deleted', 'success');
                        } catch (error) {
                            console.error('Failed to delete item:', error);
                            this.showToast('Failed to delete item', 'error');
                        }
                    }
                }
            } catch (error) {
                console.error('Menu action failed:', error);
                this.showToast('Action failed', 'error');
            } finally {
                closeMoreMenu();
            }
        });
    }

    setupScrollShadow() {
        const topbar = document.getElementById('topbar');
        let last = 0;
        document.addEventListener('scroll', () => {
            const y = window.scrollY || 0;
            if ((y > 2) !== (last > 2)) {
                topbar.style.boxShadow = y > 2 ? '0 2px 12px rgba(0,0,0,0.06)' : 'none';
            }
            last = y;
        }, { passive: true });
    }

    setupDeleteDelegation() {
        const grid = document.getElementById('grid');
        if (!grid) return;

        grid.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="delete"]');
            if (!btn) return;

            e.preventDefault();
            e.stopPropagation();

            const id = btn.getAttribute('data-id');
            if (!id) return;

            // Confirm exactly once
            if (!confirm('Delete this item?')) return;

            this.deleteItem(id);
        });
    }

    processHashAdd() {
        const h = location.hash || '';
        if (!h.startsWith('#add=')) return;
        try {
            const payload = JSON.parse(decodeURIComponent(h.slice(5)));
            // Clear hash immediately to avoid re-processing on refresh/back
            history.replaceState(null, '', location.pathname);

            const url = (payload.url || '').trim();
            if (!url) return;

            // Prevent duplicate add while another is running
            if (!window.pendingAdds) window.pendingAdds = new Set();
            if (window.pendingAdds.has(url)) return;
            window.pendingAdds.add(url);

            // Show optimistic card (no opacity, just shimmer)
            const tempId = this.addOptimisticCard(url);

            // Enrich + write once
            (async () => {
                try {
                    // Save to Supabase only
                    const final = await this.dataManager.addOrUpdateItem(payload); // Save to Supabase only
                    
                    this.reconcileCard(tempId, final);
                    this.showToast('Item added');
                } catch (e) {
                    console.error('hash add failed', e);
                    this.reconcileCard(tempId, null, e);
                    this.showToast('Failed to add item');
                } finally {
                    window.pendingAdds.delete(url);
                }
            })();
        } catch (e) {
            console.warn('Invalid #add payload', e);
            history.replaceState(null, '', location.pathname);
        }
    }

    // Direct add pipeline (optimistic UI)
    
    // Show an optimistic placeholder card
    addOptimisticCard(url) {
        const id = `temp_${Date.now()}`;
        const card = {
            id,
            title: "Loading…",
            url,
            site: domainFrom(url),
            price: "",
            image: "",       // <-- keep empty so we show placeholder, not favicon
            _optimistic: true,
            createdAt: Date.now(),
        };
        this.renderItemCard(card); // existing renderer should handle "loading" skeleton by checking _optimistic or empty image
        
        // Add data-url attribute to the card for removal by URL
        const renderedCard = document.querySelector(`[data-item-id="${id}"]`);
        if (renderedCard) {
            renderedCard.setAttribute('data-url', url);
        }
        
        return id;
    }

    removeOptimisticCardByUrl(url) {
        console.log('Removing optimistic card for URL:', url);
        
        // Try to find the optimistic card by URL first
        const card = document.querySelector(`.item-card.optimistic[data-url="${CSS.escape(url)}"]`);
        if (card) {
            console.log('Removing optimistic card by URL:', card);
            card.remove();
            return;
        }
        
        // If not found by URL, try to find any optimistic card that might be for this URL
        const optimisticCards = document.querySelectorAll('.item-card.optimistic');
        optimisticCards.forEach(card => {
            const cardUrl = card.getAttribute('data-url');
            if (cardUrl === url) {
                console.log('Removing optimistic card by URL match:', card);
                card.remove();
            }
        });
    }

    // Fetch meta from Worker (DISABLED - using local extraction)
    // async fetchMeta(url) {
    //     const r = await fetch(`${META_ENDPOINT}?url=${encodeURIComponent(url)}`, { mode: 'cors' });
    //     if (!r.ok) throw new Error(`meta ${r.status}`);
    //     const data = await r.json();
    //     return {
    //         title: data.title || domainFrom(url),
    //         image: data.image || "",
    //         price: data.price || "",
    //     };
    // }

    // Legacy method - no longer used (replaced by itemManager.createItemFromUrl)

    // Replace placeholder with real card or remove on error
    reconcileCard(tempId, finalObj, err) {
        console.log('Reconciling card:', tempId, finalObj, err);
        
        if (err) {
            this.removeItemCard(tempId);  // delete skeleton
            this.showToast("Couldn't add link. Try again."); // small non-blocking toast
            return;
        }
        
        // Count optimistic cards before removal
        const optimisticCardsBefore = document.querySelectorAll('.item-card.optimistic').length;
        console.log('Optimistic cards before removal:', optimisticCardsBefore);
        
        // Remove ALL optimistic cards to ensure we don't have duplicates
        const allOptimisticCards = document.querySelectorAll('.item-card.optimistic');
        allOptimisticCards.forEach(card => {
            console.log('Removing optimistic card:', card);
            card.remove();
        });
        
        // Count optimistic cards after removal
        const optimisticCardsAfter = document.querySelectorAll('.item-card.optimistic').length;
        console.log('Optimistic cards after removal:', optimisticCardsAfter);
        
        // Add the real card
        this.renderItemCard(finalObj);
        
        // Refresh store tags to include the new item
        this.refreshStoreTags();
    }

    // Main direct-add flow
    async addItemDirectly(url) {
        if (!window.pendingAdds) window.pendingAdds = new Set();
        if (window.pendingAdds.has(url)) {
            console.log('URL already being added, skipping');
            return;
        }
        window.pendingAdds.add(url);
        
        // Check if we already have any optimistic cards and remove them
        const existingOptimisticCards = document.querySelectorAll('.item-card.optimistic');
        if (existingOptimisticCards.length > 0) {
            console.log('Found existing optimistic cards, removing them:', existingOptimisticCards.length);
            existingOptimisticCards.forEach(card => {
                console.log('Removing existing optimistic card:', card);
                card.remove();
            });
        }

        try {
            // Create optimistic card first
            const tempId = this.addOptimisticCard(url);
            
            let metadata = null;
            
            // Try to fetch metadata from worker first
            try {
                console.log('Fetching metadata from worker for addItemDirectly:', url);
                const response = await fetch(`${EXTRACT_ENDPOINT}?url=${encodeURIComponent(url)}`);
                console.log('Worker response status for addItemDirectly:', response.status);
                
                if (response.ok) {
                    metadata = await response.json();
                    console.log('Worker metadata for addItemDirectly:', metadata);
                    
                    // Check if worker returned useful data
                    if (!metadata || (!metadata.title && !metadata.image && !metadata.price)) {
                        console.log('Worker returned empty data, using fallback');
                        metadata = null;
                    }
                } else {
                    const errorText = await response.text();
                    console.error('Worker error for addItemDirectly:', errorText);
                    metadata = null;
                }
            } catch (workerError) {
                console.warn('Worker metadata extraction failed, using fallback:', workerError);
                metadata = null;
            }
            
            // If worker failed or returned no useful data, use local fallback
            if (!metadata) {
                console.log('Using local metadata fallback for:', url);
                metadata = this.extractBasicMetadata(url);
            }
            
            // Add item to Supabase only
            const itemData = {
                url: url,
                title: metadata.title || '',
                image: metadata.image || '',
                video: metadata.video || '',
                price: metadata.price || ''
            };
            
            const item = await this.dataManager.addOrUpdateItem(itemData); // Save to Supabase only
            
            // When the worker returns, update only if it's a real image or video
            if (item && item.video && item.video.trim()) {
                // Keep the video
            } else if (item && item.image && !this.isFavicon(item.image)) {
                // Keep the real image
            } else if (item) {
                // Clear favicon or empty image
                item.image = '';
                item.video = '';
            }
            
            if (item) {
                // Replace optimistic card with real card
                this.reconcileCard(tempId, item);
                this.showToast('Item added', 'success');
                
                // Trigger sync checks after add
                const isMobileSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent);
                if (isMobileSafari) {
                    // Multiple sync checks for mobile Safari
                    this.triggerSyncCheck(); // Immediate
                    setTimeout(() => this.triggerSyncCheck(), 500); // 0.5s
                    setTimeout(() => this.triggerSyncCheck(), 1000); // 1s
                    setTimeout(() => this.triggerSyncCheck(), 2000); // 2s
                } else {
                    // Single sync check for other devices
                    setTimeout(() => {
                        this.triggerSyncCheck();
                    }, 1000);
                }
            }
        } catch (error) {
            console.error('addItemDirectly failed', error);
            this.removeOptimisticCardByUrl(url);
            this.showToast(error?.message === 'Item already exists' ? 'Item already exists' : 'Failed to add item', 'error');
        } finally {
            window.pendingAdds.delete(url);
        }
    }

    // Helper methods for card manipulation
    removeItemCard(id) {
        const card = document.querySelector(`[data-item-id="${id}"]`);
        if (card) {
            card.remove();
        }
    }

    updateItemCard(id, obj) {
        const card = document.querySelector(`[data-item-id="${id}"]`);
        if (card) {
            // Update the card content in-place
            const titleEl = card.querySelector('.title');
            const priceEl = card.querySelector('.price');
            const domainEl = card.querySelector('.domain');
            const thumb = card.querySelector('.thumb');
            
            if (titleEl) titleEl.textContent = obj.title || '';
            if (priceEl) priceEl.textContent = obj.price || '';
            if (domainEl) domainEl.textContent = obj.domain || this.hostnameOf(obj.url) || '';
            
            // Handle media replacement (placeholder → real image/video)
            const hasVideo = obj.video && obj.video.trim();
            const hasRealImage = obj.image && !this.isFavicon(obj.image);
            
            if (hasVideo || hasRealImage) {
                // Remove placeholder classes
                thumb.classList.remove('placeholder', 'no-image');
                
                // Remove any existing media
                const existingMedia = thumb.querySelector('img, video');
                if (existingMedia) existingMedia.remove();
                
                if (hasVideo) {
                    // Create video container with play button overlay
                    const videoContainer = document.createElement('div');
                    videoContainer.className = 'video-container';
                    videoContainer.style.cssText = 'position: relative; width: 100%; height: 100%;';
                    
                    // Create video element
                    const video = document.createElement('video');
                    video.src = obj.video;
                    video.muted = true;
                    video.loop = true;
                    video.playsInline = true;
                    video.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 12px;';
                    video.onloadstart = function() {
                        this.parentElement.classList.add('loaded');
                        // Remove optimistic state when video loads
                        card.classList.remove('optimistic');
                    };
                    video.onclick = function() {
                        this.play();
                        this.nextElementSibling.style.display = 'none';
                    };
                    
                    // Create play button overlay
                    const playButton = document.createElement('div');
                    playButton.className = 'play-button-overlay';
                    playButton.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.7); border-radius: 50%; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2;';
                    playButton.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';
                    
                    videoContainer.appendChild(video);
                    videoContainer.appendChild(playButton);
                    thumb.appendChild(videoContainer);
                } else if (hasRealImage) {
                    // Add image
                    const img = document.createElement('img');
                    img.src = obj.image;
                    img.alt = '';
                    img.loading = 'lazy';
                    img.referrerPolicy = 'no-referrer';
                    img.onload = function() {
                        this.parentElement.classList.add('loaded');
                        // Remove optimistic state when image loads
                        card.classList.remove('optimistic');
                    };
                    thumb.appendChild(img);
                }
            } else {
                
                thumb.classList.add('placeholder', 'no-image');
                
                const existingMedia = thumb.querySelector('img, video');
                if (existingMedia) existingMedia.remove();
            }
            
            return true;
        }
        return false;
    }

    // Update stats display (placeholder for now)
    updateStats() {
        // This method is called but there's no stats display in the current UI
        // It's safe to leave it empty or add stats functionality later
        console.log('Stats updated - items count:', this.items.length);
    }

}