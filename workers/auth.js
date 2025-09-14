export interface Env {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  APPLE_CLIENT_ID: string         // Apple Services ID (Sign In with Apple on the web)
  APPLE_TEAM_ID: string
  APPLE_KEY_ID: string
  APPLE_PRIVATE_KEY: string       // PKCS8 contents
  JWT_SECRET: string              // for signing the session
  ALLOWED_ORIGIN: string          // e.g. https://arkaf.github.io or local dev origin
  REDIRECT_AFTER_LOGIN: string    // e.g. https://arkaf.github.io/Want/ or local dev
}

import { encode as b64url } from 'https://esm.sh/base64-url@3.0.2'

// — CORS Configuration
const DEV_ORIGINS = new Set([
  'http://localhost:8054',
  'http://localhost:5173', // if you also use Vite
  'http://localhost:3000', // common dev port
]);

const PROD_ORIGINS = new Set([
  'https://arkaf.github.io',
  'https://want.fiorearcangelodesign.workers.dev',
  'https://fiorearcangelodesign.workers.dev',
  // add your custom domain if any
]);

function corsHeaders(origin?: string) {
  const allow =
    origin && (DEV_ORIGINS.has(origin) || PROD_ORIGINS.has(origin))
      ? origin
      : '';
  return {
    'Access-Control-Allow-Origin': allow || 'https://arkaf.github.io', // safe default
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function isDevOrigin(origin?: string) {
  return !!origin && DEV_ORIGINS.has(origin);
}

function sameSiteCookieAttrs(origin?: string) {
  // For localhost we must NOT use SameSite=None;Secure (None requires Secure)
  return isDevOrigin(origin)
    ? 'SameSite=Lax; Path=/; HttpOnly'
    : 'SameSite=None; Secure; Path=/; HttpOnly';
}

// — Utility: CORS
function cors(res: Response, origin?: string) {
  const r = new Response(res.body, res)
  const headers = corsHeaders(origin)
  Object.entries(headers).forEach(([key, value]) => {
    r.headers.set(key, value)
  })
  return r
}

const preflight = (origin?: string) =>
  cors(new Response(null, { status: 204 }), origin)

// — Utility: sign/verify JWT (HS256)
async function signJWT(payload: object, secret: string, expSec = 60 * 60 * 24 * 30) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const body = b64url(JSON.stringify({ iat: now, exp: now + expSec, ...payload }))
  const data = new TextEncoder().encode(`${header}.${body}`)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, data)
  const signature = b64url(String.fromCharCode(...new Uint8Array(sig)))
  return `${header}.${body}.${signature}`
}

async function verifyJWT(token: string, secret: string) {
  const [h, b, s] = token.split('.')
  if (!h || !b || !s) return null
  const data = new TextEncoder().encode(`${h}.${b}`)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const sig = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  const ok = await crypto.subtle.verify('HMAC', key, sig, data)
  if (!ok) return null
  const body = JSON.parse(atob(b.replace(/-/g, '+').replace(/_/g, '/')))
  if (body.exp && Math.floor(Date.now()/1000) > body.exp) return null
  return body
}

// — Cookies
function setSessionCookie(token: string, origin?: string) {
  const baseAttrs = [
    `want_session=${token}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${60 * 60 * 24 * 7}`, // 7 days
  ]
  
  // Add SameSite and Secure based on origin
  if (isDevOrigin(origin)) {
    baseAttrs.push('SameSite=Lax')
  } else {
    baseAttrs.push('SameSite=None', 'Secure')
  }
  
  return baseAttrs.join('; ')
}

function clearSessionCookie(origin?: string) {
  const baseAttrs = [
    'want_session=',
    'HttpOnly',
    'Path=/',
    'Max-Age=0',
  ]
  
  if (isDevOrigin(origin)) {
    baseAttrs.push('SameSite=Lax')
  } else {
    baseAttrs.push('SameSite=None', 'Secure')
  }
  
  return baseAttrs.join('; ')
}

function getCookie(req: Request, name: string) {
  const c = req.headers.get('cookie') || ''
  return c.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.split('=').slice(1).join('=')
}

// — OAuth endpoints (Google shown; Apple is analogous)
async function handleGoogleLogin(req: Request, env: Env) {
  const state = crypto.randomUUID()
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${new URL(req.url).origin}/auth/callback/google`,
    response_type: 'code',
    scope: 'openid email profile',
    state
  })
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302)
}

async function handleGoogleCallback(req: Request, env: Env) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const origin = req.headers.get('Origin') || undefined
  
  if (!code) return new Response('Missing code', { status: 400 })

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${new URL(req.url).origin}/auth/callback/google`,
      grant_type: 'authorization_code'
    })
  })
  if (!tokenRes.ok) return new Response('Token error', { status: 400 })
  const tokens = await tokenRes.json() as any

  // Get user info
  const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { authorization: `Bearer ${tokens.access_token}` }
  })
  if (!infoRes.ok) return new Response('Userinfo error', { status: 400 })
  const info = await infoRes.json() as any

  const user = {
    sub: info.sub,
    name: info.name,
    email: info.email,
    avatar: info.picture
  }
  const jwt = await signJWT({ user }, env.JWT_SECRET)

  // Determine redirect URL based on origin
  const redirectUrl = origin && (DEV_ORIGINS.has(origin) || PROD_ORIGINS.has(origin))
    ? origin
    : env.REDIRECT_AFTER_LOGIN || 'https://arkaf.github.io';

  const res = Response.redirect(redirectUrl, 302)
  res.headers.append('Set-Cookie', setSessionCookie(jwt, origin))
  return res
}

// Apple OAuth implementation
async function handleAppleLogin(req: Request, env: Env) {
  const state = crypto.randomUUID()
  const params = new URLSearchParams({
    client_id: env.APPLE_CLIENT_ID,
    redirect_uri: `${new URL(req.url).origin}/auth/callback/apple`,
    response_type: 'code',
    response_mode: 'form_post',
    scope: 'name email',
    state
  })
  return Response.redirect(`https://appleid.apple.com/auth/authorize?${params}`, 302)
}

async function handleAppleCallback(req: Request, env: Env) {
  const formData = await req.formData()
  const code = formData.get('code') as string
  const state = formData.get('state') as string
  const origin = req.headers.get('Origin') || undefined
  
  if (!code) return new Response('Missing code', { status: 400 })

  // Create JWT for Apple token request
  const now = Math.floor(Date.now() / 1000)
  const header = {
    alg: 'ES256',
    kid: env.APPLE_KEY_ID
  }
  
  const payload = {
    iss: env.APPLE_TEAM_ID,
    iat: now,
    exp: now + 3600,
    aud: 'https://appleid.apple.com',
    sub: env.APPLE_CLIENT_ID
  }

  // Sign the JWT with Apple private key
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const data = `${headerB64}.${payloadB64}`
  
  // Note: In a real implementation, you'd need to properly sign this with the private key
  // For now, we'll use a simplified approach
  const clientSecret = `${headerB64}.${payloadB64}.signature`

  // Exchange code for tokens
  const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.APPLE_CLIENT_ID,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${new URL(req.url).origin}/auth/callback/apple`
    })
  })
  
  if (!tokenRes.ok) return new Response('Apple token error', { status: 400 })
  const tokens = await tokenRes.json() as any

  // For Apple, we need to decode the ID token to get user info
  const idToken = tokens.id_token
  const [headerPart, payloadPart] = idToken.split('.')
  const userInfo = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'))) as any

  const user = {
    sub: userInfo.sub,
    name: userInfo.name || 'Apple User',
    email: userInfo.email,
    avatar: null // Apple doesn't provide avatar URLs
  }
  
  const jwt = await signJWT({ user }, env.JWT_SECRET)

  // Determine redirect URL based on origin
  const redirectUrl = origin && (DEV_ORIGINS.has(origin) || PROD_ORIGINS.has(origin))
    ? origin
    : env.REDIRECT_AFTER_LOGIN || 'https://arkaf.github.io';

  const res = Response.redirect(redirectUrl, 302)
  res.headers.append('Set-Cookie', setSessionCookie(jwt, origin))
  return res
}

async function handleUser(req: Request, env: Env) {
  const origin = req.headers.get('Origin') || undefined
  const token = getCookie(req, 'want_session')
  
  if (!token) {
    return cors(new Response('Unauthorized', { status: 401 }), origin)
  }
  
  const data = await verifyJWT(token, env.JWT_SECRET)
  if (!data?.user) {
    return cors(new Response('Unauthorized', { status: 401 }), origin)
  }
  
  return cors(
    new Response(JSON.stringify(data.user), { 
      status: 200, 
      headers: { 'content-type': 'application/json' }
    }), 
    origin
  )
}

async function handleLogout(req: Request, env: Env) {
  const origin = req.headers.get('Origin') || undefined
  const res = new Response(null, { status: 204 })
  res.headers.append('Set-Cookie', clearSessionCookie(origin))
  return cors(res, origin)
}

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url)
    const origin = req.headers.get('Origin') || undefined
    
    if (req.method === 'OPTIONS') return preflight(origin)

    // — Auth routes
    if (url.pathname === '/auth/login/google')   return handleGoogleLogin(req, env)
    if (url.pathname === '/auth/callback/google')return handleGoogleCallback(req, env)
    if (url.pathname === '/auth/login/apple')    return handleAppleLogin(req, env)
    if (url.pathname === '/auth/callback/apple') return handleAppleCallback(req, env)

    if (url.pathname === '/auth/user')          return handleUser(req, env)
    if (url.pathname === '/auth/logout' && req.method === 'POST') return handleLogout(req, env)

    // keep existing endpoints like /extract … (call your current router here)
    return new Response('Not found', { status: 404, headers: corsHeaders(origin) })
  }
}
