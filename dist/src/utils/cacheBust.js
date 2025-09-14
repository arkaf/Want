export function withStableBust(url, token) {
  try {
    const u = new URL(url, location.origin);
    if (u.searchParams.has('v')) return u.toString(); // don't rebust
    u.searchParams.set('v', String(token || '1'));     // stable token
    return u.toString();
  } catch {
    return url;
  }
}
