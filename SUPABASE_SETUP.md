# Supabase Setup Guide

## 1. Supabase Dashboard Configuration

### Auth Settings
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `djmvsehwlypqhcqtkman`
3. Go to **Authentication** → **Settings**
4. Set **Site URL**: `https://arkaf.github.io/Want/`
5. Add **Redirect URLs**:
   - `https://arkaf.github.io/Want/`
   - `http://localhost:8054/`

### Google OAuth Setup
1. Go to **Authentication** → **Providers** → **Google**
2. Enable Google provider
3. Add your Google OAuth credentials:
   - **331737665902-rrs33f5allp62fvvi558201ek84nrvu0.apps.googleusercontent.com**: (from Google Cloud Console)
   - **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**: (from Google Cloud Console)
4. Save

### Database Schema
1. Go to **SQL Editor**
2. Run the schema from `supabase/schema.sql`:
   ```sql
   -- Items table
   create table if not exists public.items (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null,
     url text not null,
     domain text generated always as (split_part(replace(replace(regexp_replace(url, '^https?://', ''), 'www.', ''),'/',1), '?', 1)) stored,
     title text,
     image text,
     price text,
     created_at timestamptz not null default now()
   );

   -- index for fast user fetch
   create index if not exists idx_items_user_created on public.items(user_id, created_at desc);

   -- Enable RLS
   alter table public.items enable row level security;

   -- Policies: owner-only
   create policy "Users select own items"
     on public.items for select
     using (auth.uid() = user_id);

   create policy "Users insert own items"
     on public.items for insert
     with check (auth.uid() = user_id);

   create policy "Users delete own items"
     on public.items for delete
     using (auth.uid() = user_id);
   ```

## 2. Google Cloud Console Setup

### OAuth 2.0 Client Configuration
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Edit your OAuth 2.0 Client ID
4. Add **Authorized redirect URIs**:
   - `https://djmvsehwlypqhcqtkman.supabase.co/auth/v1/callback`
   - `http://localhost:8054/` (for development)

## 3. Test the Setup

### Development Testing
1. Start local server: `python3 -m http.server 8054`
2. Visit `http://localhost:8054`
3. Click "Continue with Google"
4. Complete OAuth flow
5. Should redirect back to localhost:8054 with session

### Production Testing
1. Deploy to GitHub Pages
2. Visit `https://arkaf.github.io/Want/`
3. Test complete authentication flow

## 4. Features Now Available

✅ **Google Authentication** - Secure OAuth flow
✅ **Real-time Sync** - Live updates across devices
✅ **PostgreSQL Database** - Reliable data storage
✅ **Row Level Security** - User data isolation
✅ **Automatic Session Management** - Persistent login

## 5. Next Steps

- [ ] Enable Apple Sign In (optional)
- [ ] Add more OAuth providers if needed
- [ ] Configure email templates
- [ ] Set up monitoring and analytics

## 6. Troubleshooting

### Common Issues

1. **Redirect URI Mismatch**
   - Ensure redirect URIs match exactly in both Google Console and Supabase
   - Check for trailing slashes

2. **CORS Errors**
   - Supabase handles CORS automatically
   - No additional configuration needed

3. **Authentication Fails**
   - Check Google OAuth credentials
   - Verify Supabase project settings
   - Check browser console for errors

### Debug Steps

1. Check browser console for errors
2. Verify Supabase logs in dashboard
3. Test with curl:
   ```bash
   curl -H "Authorization: Bearer YOUR_ANON_KEY" \
        https://djmvsehwlypqhcqtkman.supabase.co/rest/v1/items
   ```
