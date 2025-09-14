# Auth Worker Deployment Guide

## Overview
This guide explains how to deploy the updated authentication worker with proper CORS configuration and session handling.

## 1. Deploy the Auth Worker

### Using Wrangler CLI
```bash
# Navigate to the workers directory
cd workers

# Deploy the auth worker
wrangler deploy auth.js --name want-auth
```

### Or using Cloudflare Dashboard
1. Go to [Cloudflare Workers](https://dash.cloudflare.com/?to=/:account/workers)
2. Create a new worker
3. Copy the contents of `workers/auth.js` into the editor
4. Deploy the worker

## 2. Configure Environment Variables

In your Cloudflare Worker dashboard, add these environment variables:

### Required Variables
- `GOOGLE_CLIENT_ID` - Your Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET` - Your Google OAuth Client Secret
- `JWT_SECRET` - A secure random string for signing JWTs (32+ characters)

### Optional Variables
- `APPLE_CLIENT_ID` - Apple Services ID (if using Sign in with Apple)
- `APPLE_TEAM_ID` - Apple Team ID
- `APPLE_KEY_ID` - Apple Key ID
- `APPLE_PRIVATE_KEY` - Apple Private Key (PKCS8 format)
- `REDIRECT_AFTER_LOGIN` - Fallback redirect URL

## 3. Configure Google OAuth

In Google Cloud Console → APIs & Services → Credentials:

### Authorized JavaScript origins:
- `http://localhost:8054` (development)
- `https://arkaf.github.io` (production)
- `https://want.fiorearcangelodesign.workers.dev` (if serving app there)

### Authorized redirect URIs:
- `https://want-auth.fiorearcangelodesign.workers.dev/auth/callback/google`
- `http://localhost:8787/auth/callback/google` (for local testing)

## 4. Update Frontend Configuration

Update your `app.js` to use the correct auth worker URL:

```javascript
// Update this to your actual auth worker URL
const AUTH_BASE = 'https://want-auth.fiorearcangelodesign.workers.dev';
```

## 5. Test the Authentication Flow

### Development Testing
1. Start your local server: `python3 -m http.server 8054`
2. Visit `http://localhost:8054`
3. Click "Continue with Google"
4. Complete OAuth flow
5. Should redirect back to localhost:8054 with session

### Production Testing
1. Deploy your frontend to GitHub Pages or your domain
2. Visit your production URL
3. Test the complete authentication flow

## 6. CORS Configuration

The worker now supports multiple origins:

### Development Origins
- `http://localhost:8054`
- `http://localhost:5173`
- `http://localhost:3000`

### Production Origins
- `https://arkaf.github.io`
- `https://want.fiorearcangelodesign.workers.dev`
- `https://fiorearcangelodesign.workers.dev`

## 7. Session Cookie Configuration

### Development (localhost)
- `SameSite=Lax`
- `HttpOnly`
- `Path=/`
- `Max-Age=604800` (7 days)

### Production
- `SameSite=None`
- `Secure`
- `HttpOnly`
- `Path=/`
- `Max-Age=604800` (7 days)

## 8. Troubleshooting

### Common Issues

1. **CORS Errors**
   - Check that your origin is in the allowed origins list
   - Ensure `credentials: 'include'` is set in fetch requests

2. **Cookie Not Set**
   - Check that the worker URL is correct
   - Verify SameSite settings for your environment

3. **401 Unauthorized**
   - Check that JWT_SECRET is set
   - Verify Google OAuth configuration

4. **Redirect Issues**
   - Ensure redirect URIs are configured in Google Console
   - Check that the worker can determine the correct redirect URL

### Debug Steps

1. Check browser console for errors
2. Verify worker logs in Cloudflare dashboard
3. Test with curl:
   ```bash
   curl -H "Origin: http://localhost:8054" \
        -H "Cookie: want_session=your_token" \
        https://want-auth.fiorearcangelodesign.workers.dev/auth/user
   ```

## 9. Security Considerations

- Use a strong JWT_SECRET (32+ random characters)
- Keep environment variables secure
- Regularly rotate secrets
- Monitor worker logs for suspicious activity
- Consider rate limiting for auth endpoints

## 10. Performance

- The worker is optimized for minimal latency
- JWT verification is fast and secure
- CORS headers are set efficiently
- Session cookies have appropriate expiration

## Files Modified

- `workers/auth.js` - Updated with proper CORS and session handling
- `app.js` - Updated to use correct cookie name and headers
- `AUTH_WORKER_DEPLOYMENT.md` - This deployment guide
