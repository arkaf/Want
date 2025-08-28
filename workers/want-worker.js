// Environment variables will be available as env.GOOGLE_CLIENT_ID, etc.

// Base64 URL encoding utility
function b64url(str) {
    try {
        return btoa(str)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    } catch (error) {
        console.log('b64url error:', error.message, 'for string:', str.substring(0, 50))
        throw error
    }
}

// — Utility: CORS
function cors(res, env) {
  const r = new Response(res.body, res)
  // When using credentials, we must specify the exact origin, not wildcard
  const origin = env.ALLOWED_ORIGIN || 'http://localhost:8054'
  r.headers.set('Access-Control-Allow-Origin', origin)
  r.headers.set('Vary', 'Origin')
  r.headers.set('Access-Control-Allow-Credentials', 'true')
  r.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  r.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  return r
}

// — Utility: CORS with dynamic origin
function corsDynamic(res, req, env) {
  const r = new Response(res.body, res)
  const origin = req.headers.get('origin')
  
  // Allow both localhost and GitHub Pages
  if (origin === 'http://localhost:8054' || origin === 'https://arkaf.github.io') {
    r.headers.set('Access-Control-Allow-Origin', origin)
  } else {
    r.headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN || 'http://localhost:8054')
  }
  
  r.headers.set('Vary', 'Origin')
  r.headers.set('Access-Control-Allow-Credentials', 'true')
  r.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  r.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  return r
}

const preflight = (env) =>
  cors(new Response(null, { status: 204 }), env)

// — Utility: sign/verify JWT (HS256)
async function signJWT(payload, secret, expSec = 60 * 60 * 24 * 30) {
  try {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const now = Math.floor(Date.now() / 1000)
    const body = b64url(JSON.stringify({ iat: now, exp: now + expSec, ...payload }))
    const data = new TextEncoder().encode(`${header}.${body}`)
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', key, data)
    const signature = b64url(String.fromCharCode(...new Uint8Array(sig)))
    return `${header}.${body}.${signature}`
  } catch (error) {
    console.log('JWT signing error:', error.message)
    throw error
  }
}

async function verifyJWT(token, secret) {
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
function setSessionCookie(token) {
  const attrs = [
    `session=${token}`,
    'HttpOnly',
    'Secure',
    'SameSite=None',
    'Path=/',
  ]
  return attrs.join('; ')
}

function clearSessionCookie() {
  return 'session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0'
}

function getCookie(req, name) {
  const c = req.headers.get('cookie') || ''
  const cookies = c.split(';').map(s => s.trim())
  const cookie = cookies.find(s => s.startsWith(name + '='))
  if (!cookie) return null
  return cookie.substring(name.length + 1)
}

// — OAuth endpoints
async function handleGoogleLogin(req, env) {
  const state = crypto.randomUUID()
  const { searchParams } = new URL(req.url)
  const redirect = searchParams.get('redirect') || env.REDIRECT_AFTER_LOGIN || 'http://localhost:8054'
  
  // Store the redirect URL in the state parameter
  const stateData = b64url(JSON.stringify({ state, redirect }))
  
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${new URL(req.url).origin}/auth/callback/google`,
    response_type: 'code',
    scope: 'openid email profile',
    state: stateData
  })
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302)
}

async function handleGoogleCallback(req, env) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    if (!code) return new Response('Missing code', { status: 400 })

    console.log('Google callback received code:', code.substring(0, 10) + '...')

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
    
    if (!tokenRes.ok) {
      const errorText = await tokenRes.text()
      console.log('Token exchange failed:', tokenRes.status, errorText)
      return new Response(`Token error: ${tokenRes.status}`, { status: 400 })
    }
    
    const tokens = await tokenRes.json()
    console.log('Token exchange successful')

    // Get user info
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { authorization: `Bearer ${tokens.access_token}` }
    })
    
    if (!infoRes.ok) {
      const errorText = await infoRes.text()
      console.log('Userinfo failed:', infoRes.status, errorText)
      return new Response(`Userinfo error: ${infoRes.status}`, { status: 400 })
    }
    
    const info = await infoRes.json()
    console.log('User info received:', info.email)

    const user = {
      sub: info.sub,
      name: info.name,
      email: info.email,
      avatar: info.picture
    }
    
    const jwt = await signJWT({ user }, env.JWT_SECRET)
    console.log('JWT created successfully')

    // Get the original redirect URL from state parameter
    const state = searchParams.get('state')
    let redirectUrl = env.REDIRECT_AFTER_LOGIN || 'http://localhost:8054'
    
    if (state) {
      try {
        const stateData = JSON.parse(atob(state.replace(/-/g, '+').replace(/_/g, '/')))
        redirectUrl = stateData.redirect || redirectUrl
      } catch (e) {
        console.log('Failed to parse state:', e.message)
      }
    }
    
    const res = new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl,
        'Set-Cookie': setSessionCookie(jwt)
      }
    })
    console.log('Redirecting to:', redirectUrl)
    return res
    
  } catch (error) {
    console.log('Google callback error:', error.message)
    return new Response(`Callback error: ${error.message}`, { status: 500 })
  }
}

async function handleAppleLogin(req, env) {
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

async function handleAppleCallback(req, env) {
  const formData = await req.formData()
  const code = formData.get('code')
  
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
  const tokens = await tokenRes.json()

  // For Apple, we need to decode the ID token to get user info
  const idToken = tokens.id_token
  const [headerPart, payloadPart] = idToken.split('.')
  const userInfo = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')))

  const user = {
    sub: userInfo.sub,
    name: userInfo.name || 'Apple User',
    email: userInfo.email,
    avatar: null // Apple doesn't provide avatar URLs
  }
  
  const jwt = await signJWT({ user }, env.JWT_SECRET)

  const res = Response.redirect(env.REDIRECT_AFTER_LOGIN, 302)
  res.headers.append('Set-Cookie', setSessionCookie(jwt))
  return res
}

async function handleUser(req, env) {
  const token = getCookie(req, 'session')
  if (!token) {
    console.log('No session cookie found')
    return corsDynamic(new Response('Unauthorized - No session cookie', { status: 401 }), req, env)
  }
  
  const data = await verifyJWT(token, env.JWT_SECRET)
  if (!data?.user) {
    console.log('Invalid JWT or no user data')
    return corsDynamic(new Response('Unauthorized - Invalid JWT', { status: 401 }), req, env)
  }
  
  return corsDynamic(new Response(JSON.stringify(data.user), { 
    status: 200, 
    headers: { 'content-type': 'application/json' }
  }), req, env)
}

async function handleLogout(req, env) {
  const res = new Response(null, { status: 204 })
  res.headers.append('Set-Cookie', clearSessionCookie())
  return cors(res, env)
}

// — Sync functionality
async function handleGetItems(req, env) {
  try {
    const token = getCookie(req, 'session')
    if (!token) {
      return corsDynamic(new Response('Unauthorized', { status: 401 }), req, env)
    }
    
    const data = await verifyJWT(token, env.JWT_SECRET)
    if (!data?.user) {
      return corsDynamic(new Response('Unauthorized', { status: 401 }), req, env)
    }
    
    const userId = data.user.sub
    const itemsKey = `user:${userId}:items`
    
    const items = await env.WANT_KV.get(itemsKey, { type: 'json' })
    
    return corsDynamic(new Response(JSON.stringify(items || []), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }), req, env)
    
  } catch (error) {
    console.log('Get items error:', error.message)
    return corsDynamic(new Response('Server error', { status: 500 }), req, env)
  }
}

async function handleSaveItems(req, env) {
  try {
    const token = getCookie(req, 'session')
    if (!token) {
      return corsDynamic(new Response('Unauthorized', { status: 401 }), req, env)
    }
    
    const data = await verifyJWT(token, env.JWT_SECRET)
    if (!data?.user) {
      return corsDynamic(new Response('Unauthorized', { status: 401 }), req, env)
    }
    
    const userId = data.user.sub
    const itemsKey = `user:${userId}:items`
    
    const items = await req.json()
    
    await env.WANT_KV.put(itemsKey, JSON.stringify(items))
    
    return corsDynamic(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }), req, env)
    
  } catch (error) {
    console.log('Save items error:', error.message)
    return corsDynamic(new Response('Server error', { status: 500 }), req, env)
  }
}

// — Extract functionality (from existing extract.js)
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  })
}

function pickFromJsonLd(blocks) {
  const product = blocks.find(b => (b["@type"] || "").toLowerCase() === "product");
  if (!product) return { title: "", image: "", price: "", currency: "" };

  const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers || {};
  return {
    title: product.name || product.title || "",
    image: Array.isArray(product.image) ? product.image[0] : product.image || "",
    price: offers.price || offers.lowPrice || "",
    currency: offers.priceCurrency || ""
  };
}

function fromJsonLd(html) {
  const matches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
  if (!matches) return null
  
  for (const match of matches) {
    try {
      const jsonStr = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '')
      let data = JSON.parse(jsonStr)
      
      // Handle nested arrays/objects
      if (Array.isArray(data)) {
        data = data.find(item => item && typeof item === 'object')
      }
      
      if (!data || typeof data !== 'object') continue
      
      // Look for Product type
      if (data['@type'] === 'Product' || data['@type'] === 'http://schema.org/Product') {
        const result = pickFromJsonLd([data])
        if (result.title || result.image || result.price) {
          return result
        }
      }
      
      // Handle @graph arrays
      if (data['@graph'] && Array.isArray(data['@graph'])) {
        const result = pickFromJsonLd(data['@graph'])
        if (result.title || result.image || result.price) {
          return result
        }
      }
      
    } catch (e) {
      continue
    }
  }
  return null
}

function normalizeCurrency(price, currency) {
  if (!price) return price
  
  // Normalize currency symbols
  const currencyMap = {
    '£': 'GBP',
    '€': 'EUR',
    '$': 'USD',
    '¥': 'JPY'
  }
  
  if (currency) {
    return `${price} ${currency}`
  }
  
  // Try to detect currency from price string
  for (const [symbol, code] of Object.entries(currencyMap)) {
    if (price.includes(symbol)) {
      return price.replace(symbol, `${symbol} `)
    }
  }
  
  return price
}

function fromMeta(html) {
  // Enhanced meta tag extraction with fallbacks
  const title = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"/i)?.[1] ||
                html.match(/<meta[^>]*name="twitter:title"[^>]*content="([^"]*)"/i)?.[1] ||
                html.match(/<meta[^>]*name="title"[^>]*content="([^"]*)"/i)?.[1] ||
                html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
  
  const image = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i)?.[1] ||
                html.match(/<meta[^>]*name="twitter:image"[^>]*content="([^"]*)"/i)?.[1] ||
                html.match(/<meta[^>]*property="image"[^>]*content="([^"]*)"/i)?.[1] ||
                html.match(/<link[^>]*rel="image_src"[^>]*href="([^"]*)"/i)?.[1]
  
  // Enhanced price extraction with multiple patterns
  let price = html.match(/<meta[^>]*property="product:price:amount"[^>]*content="([^"]*)"/i)?.[1] ||
              html.match(/<meta[^>]*property="og:price:amount"[^>]*content="([^"]*)"/i)?.[1] ||
              html.match(/<meta[^>]*name="twitter:data1"[^>]*content="([^"]*)"/i)?.[1] || // Zara uses this
              html.match(/<meta[^>]*property="price"[^>]*content="([^"]*)"/i)?.[1]
  
  // Extract currency if available
  const currency = html.match(/<meta[^>]*property="product:price:currency"[^>]*content="([^"]*)"/i)?.[1] ||
                   html.match(/<meta[^>]*property="og:price:currency"[^>]*content="([^"]*)"/i)?.[1]
  
  // Normalize price with currency
  price = normalizeCurrency(price, currency)
  
  return { title, image, price }
}

async function fromSiteSpecific(html, pageUrl) {
  // Amazon-specific extraction
  if (pageUrl.hostname.includes('amazon.')) {
    const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>([^<]*)<\/span>/i)
    const title = titleMatch?.[1]?.trim()
    
    // Enhanced Amazon image extraction
    let image = null
    const imagePatterns = [
      /data-old-hires="([^"]*)"/i,
      /landingImage":"([^"]*)"/i,
      /"large":"([^"]*)"/i,
      /"hiRes":"([^"]*)"/i,
      /data-a-dynamic-image="([^"]*)"/i,
      /"mainImage":"([^"]*)"/i,
      /"heroImage":"([^"]*)"/i
    ]
    
    for (const pattern of imagePatterns) {
      const match = html.match(pattern)
      if (match) {
        image = match[1]
        if (pattern.source.includes('data-a-dynamic-image')) {
          try {
            const dynamicData = JSON.parse(image)
            const firstKey = Object.keys(dynamicData)[0]
            image = firstKey
          } catch (e) {
            continue
          }
        }
        break
      }
    }
    
    // Upgrade Amazon image to high resolution
    if (image) {
      image = upgradeAmazonImage(image)
    }
    
    // Enhanced Amazon price extraction
    const pricePatterns = [
      /<span[^>]*class="[^"]*price[^"]*"[^>]*>([^<]*)<\/span>/i,
      /<span[^>]*class="[^"]*a-price[^"]*"[^>]*>([^<]*)<\/span>/i,
      /<span[^>]*class="[^"]*a-price-whole[^"]*"[^>]*>([^<]*)<\/span>/i,
      /<span[^>]*class="[^"]*a-offscreen[^"]*"[^>]*>([^<]*)<\/span>/i
    ]
    
    let price = null
    for (const pattern of pricePatterns) {
      const priceMatch = html.match(pattern)
      if (priceMatch) {
        price = priceMatch[1]?.replace(/[^\d.,]/g, '')
        if (price) break
      }
    }
    
    return { title, image, price }
  }
  
  // Zara-specific extraction
  if (pageUrl.hostname.includes('zara.com')) {
    const titleMatch = html.match(/<h1[^>]*class="[^"]*product-detail-info__product-name[^"]*"[^>]*>([^<]*)<\/h1>/i) ||
                       html.match(/<h1[^>]*class="[^"]*product-name[^"]*"[^>]*>([^<]*)<\/h1>/i)
    const title = titleMatch?.[1]?.trim()
    
    const imageMatch = html.match(/<img[^>]*class="[^"]*product-detail-images__image[^"]*"[^>]*src="([^"]*)"/i) ||
                       html.match(/<img[^>]*class="[^"]*product-image[^"]*"[^>]*src="([^"]*)"/i)
    const image = imageMatch?.[1]
    
    const priceMatch = html.match(/<span[^>]*class="[^"]*price__amount[^"]*"[^>]*>([^<]*)<\/span>/i) ||
                       html.match(/<span[^>]*class="[^"]*price-amount[^"]*"[^>]*>([^<]*)<\/span>/i)
    const price = priceMatch?.[1]?.replace(/[^\d.,]/g, '')
    
    return { title, image, price }
  }
  
  // H&M-specific extraction
  if (pageUrl.hostname.includes('hm.com') || pageUrl.hostname.includes('h&m')) {
    const titleMatch = html.match(/<h1[^>]*class="[^"]*product-name[^"]*"[^>]*>([^<]*)<\/h1>/i) ||
                       html.match(/<h1[^>]*class="[^"]*product-title[^"]*"[^>]*>([^<]*)<\/h1>/i)
    const title = titleMatch?.[1]?.trim()
    
    const imageMatch = html.match(/<img[^>]*class="[^"]*product-image[^"]*"[^>]*src="([^"]*)"/i) ||
                       html.match(/<img[^>]*class="[^"]*main-image[^"]*"[^>]*src="([^"]*)"/i)
    const image = imageMatch?.[1]
    
    const priceMatch = html.match(/<span[^>]*class="[^"]*price[^"]*"[^>]*>([^<]*)<\/span>/i) ||
                       html.match(/<span[^>]*class="[^"]*product-price[^"]*"[^>]*>([^<]*)<\/span>/i)
    const price = priceMatch?.[1]?.replace(/[^\d.,]/g, '')
    
    return { title, image, price }
  }
  
  // Dover Street Market specific extraction
  if (pageUrl.hostname.includes('doverstreetmarket.com')) {
    const titleMatch = html.match(/<h1[^>]*class="[^"]*product-title[^"]*"[^>]*>([^<]*)<\/h1>/i) ||
                       html.match(/<h1[^>]*class="[^"]*product-name[^"]*"[^>]*>([^<]*)<\/h1>/i)
    const title = titleMatch?.[1]?.trim()
    
    const imageMatch = html.match(/<img[^>]*class="[^"]*product-image[^"]*"[^>]*src="([^"]*)"/i) ||
                       html.match(/<img[^>]*class="[^"]*main-image[^"]*"[^>]*src="([^"]*)"/i)
    const image = imageMatch?.[1]
    
    const priceMatch = html.match(/<span[^>]*class="[^"]*price[^"]*"[^>]*>([^<]*)<\/span>/i) ||
                       html.match(/<span[^>]*class="[^"]*product-price[^"]*"[^>]*>([^<]*)<\/span>/i)
    const price = priceMatch?.[1]?.replace(/[^\d.,]/g, '')
    
    return { title, image, price }
  }
  
  return null
}

function extractAnyProductImage(html, pageUrl) {
  // Enhanced image extraction with lazy loading support
  const imagePatterns = [
    // Lazy loading images
    /<img[^>]*data-src="([^"]*)"[^>]*/gi,
    /<img[^>]*data-lazy="([^"]*)"[^>]*/gi,
    /<img[^>]*data-original="([^"]*)"[^>]*/gi,
    // Regular product images
    /<img[^>]*class="[^"]*product[^"]*"[^>]*src="([^"]*)"/gi,
    /<img[^>]*class="[^"]*main[^"]*"[^>]*src="([^"]*)"/gi,
    /<img[^>]*id="[^"]*main[^"]*"[^>]*src="([^"]*)"/gi,
    /<img[^>]*src="([^"]*)"[^>]*class="[^"]*product[^"]*"/gi,
    // Generic high-quality images
    /<img[^>]*src="([^"]*)"[^>]*width="[0-9]{3,}"[^>]*/gi,
    /<img[^>]*src="([^"]*)"[^>]*height="[0-9]{3,}"[^>]*/gi
  ]
  
  for (const pattern of imagePatterns) {
    const matches = html.matchAll(pattern)
    for (const match of matches) {
      const imageUrl = match[1]
      if (imageUrl && 
          !imageUrl.includes('placeholder') && 
          !imageUrl.includes('e-love') && 
          !imageUrl.includes('error') && 
          !imageUrl.includes('default') &&
          !imageUrl.includes('logo') &&
          !imageUrl.includes('icon') &&
          imageUrl.length > 20) { // Filter out very short URLs (likely icons)
        return imageUrl.startsWith('http') ? imageUrl : new URL(imageUrl, pageUrl.origin).href
      }
    }
  }
  
  return null
}

function upgradeAmazonImage(imageUrl) {
  if (!imageUrl || !imageUrl.includes('amazon')) return imageUrl
  
  // Replace various thumbnail patterns with high resolution
  return imageUrl
    .replace(/\._SX\d+_SY\d+_CR,0,0,\d+,\d+_\.jpg/, '._AC_SL1500_.jpg')
    .replace(/\._SY\d+_\.jpg/, '._AC_SL1500_.jpg')
    .replace(/\.__AC_SX\d+_SY\d+__\.jpg/, '._AC_SL1500_.jpg')
    .replace(/\._AC_SX\d+_SY\d+_\.jpg/, '._AC_SL1500_.jpg')
}

function extractAnyPrice(html) {
  const pricePatterns = [
    /£(\d+\.?\d*)/g,
    /\$(\d+\.?\d*)/g,
    /€(\d+\.?\d*)/g,
    /(\d+\.?\d*)\s*(?:GBP|USD|EUR)/gi
  ]
  
  for (const pattern of pricePatterns) {
    const matches = html.matchAll(pattern)
    for (const match of matches) {
      const price = parseFloat(match[1])
      if (price > 0 && price < 10000) {
        return price.toString()
      }
    }
  }
  
  return null
}

async function fetchWithRetry(target, maxRetries = 3) {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  ]

  const antiBotHeaders = [
    {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Referer': 'https://www.google.com/',
      'Cookie': `session=${Math.random().toString(36).substring(2)}`
    },
    {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-GB,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Referer': 'https://www.bing.com/',
      'Cookie': `visitor=${Math.random().toString(36).substring(2)}`
    }
  ]

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const headers = antiBotHeaders[attempt % antiBotHeaders.length]
      
      const res = await fetch(target, {
        headers,
        cf: { cacheTtl: 0, cacheEverything: false }
      })
      
      const html = await res.text()
      const pageUrl = new URL(res.url)
      
      // Check for anti-bot protection
      const botIndicators = [
        'Access Denied',
        'Akamai',
        'detected',
        'blocked',
        'captcha',
        'robot',
        'bot protection',
        'security check'
      ]
      
      const isBlocked = botIndicators.some(indicator => 
        html.toLowerCase().includes(indicator.toLowerCase())
      )
      
      // If blocked and we have more attempts, retry with different headers
      if (isBlocked && attempt < maxRetries - 1) {
        console.log(`Attempt ${attempt + 1}: Bot protection detected, retrying...`)
        continue
      }
      
      // Check if we got meaningful content
      const hasContent = html.includes('product') || 
                        html.includes('amazon') || 
                        html.includes('zara') ||
                        html.includes('hm.com') ||
                        !html.includes('e-love') ||
                        html.length > 1000
      
      if (hasContent) {
        return { html, pageUrl }
      }
      
    } catch (e) {
      console.log(`Attempt ${attempt + 1} failed:`, e.message)
      if (attempt === maxRetries - 1) throw e
    }
  }
  
  throw new Error('Failed to fetch content after all retries')
}

async function handleExtract(req, env) {
  const { searchParams } = new URL(req.url)
  const target = searchParams.get('url')
  if (!target) return json({ error: 'missing url' }, 400)

  const key = 'u:' + new URL(target).href
  // 1) KV cache (if available)
  if (env.WANT_KV) {
    const cached = await env.WANT_KV.get(key, 'json')
    if (cached) return json(cached)
  }

  // 2) Fetch with anti-bot retry logic
  let html, pageUrl
  try {
    const result = await fetchWithRetry(target)
    html = result.html
    pageUrl = result.pageUrl
  } catch (error) {
    console.log('Fetch failed:', error.message)
    return json({ error: 'Failed to fetch content' }, 500)
  }

  // 3) Extract data with priority order
  let data = fromJsonLd(html) || fromMeta(html) || await fromSiteSpecific(html, pageUrl)

  // 4) If no image found, try comprehensive image search
  if (!data?.image) {
    data.image = extractAnyProductImage(html, pageUrl)
  }

  // 5) If no price found, try general price extraction
  if (!data?.price) {
    data.price = extractAnyPrice(html)
  }

  // 6) Normalize output - ensure we always return the expected structure
  const normalizedData = {
    title: data?.title || '',
    image: data?.image || '',
    price: data?.price || '',
    timestamp: Date.now()
  }

  // 7) Site-specific fallbacks
  if (pageUrl.hostname.includes('amazon.')) {
    // Amazon fallback image
    if (!normalizedData.image) {
      normalizedData.image = 'https://images-na.ssl-images-amazon.com/images/G/01/gc/designs/livepreview/amazon_dkblue_noto_email_v2016_us-main._CB468775337_.png'
    }
  }

  // 8) Handle anti-bot protection for specific sites
  if (pageUrl.hostname.includes('zara.com') && (!normalizedData.title || normalizedData.title === '&nbsp;')) {
    // Try to extract from URL if possible
    const urlMatch = pageUrl.pathname.match(/\/uk\/en\/([^\/]+)-p\d+\.html/)
    if (urlMatch) {
      const productName = urlMatch[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      normalizedData.title = `${productName} - Zara`
    } else {
      normalizedData.title = 'Zara Product'
    }
  }

  // 9) Cache the result (if KV available)
  if (env.WANT_KV) {
    await env.WANT_KV.put(key, JSON.stringify(normalizedData), { expirationTtl: 3600 })
  }

  return json(normalizedData)
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return preflight(env)
    }

    // — Auth routes
    if (url.pathname === '/auth/login/google')   return handleGoogleLogin(req, env)
    if (url.pathname === '/auth/callback/google')return handleGoogleCallback(req, env)
    if (url.pathname === '/auth/login/apple')    return handleAppleLogin(req, env)
    if (url.pathname === '/auth/callback/apple') return handleAppleCallback(req, env)
    if (url.pathname === '/auth/user')          return handleUser(req, env)
    if (url.pathname === '/auth/logout' && req.method === 'POST') return handleLogout(req, env)

               // — Sync routes
           if (url.pathname === '/api/items' && req.method === 'GET') return handleGetItems(req, env)
           if (url.pathname === '/api/items' && req.method === 'POST') return handleSaveItems(req, env)
           
           // — Extract routes (existing functionality)
           if (url.pathname === '/extract') return handleExtract(req, env)
           if (url.pathname === '/api/parse') return handleExtract(req, env) // Backward compatibility

    return new Response('Not found', { status: 404 })
  }
}
