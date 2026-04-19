import supabase from './supabase';

const SESSION_TIMEOUT_MS = 5000;   // max wait for Supabase session
const REQUEST_TIMEOUT_MS = 45000;  // max wait for backend (Render cold start can be ~30s)

async function getSessionToken() {
  try {
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('getSession timeout')), SESSION_TIMEOUT_MS)
    );
    const { data } = await Promise.race([sessionPromise, timeoutPromise]);
    return data?.session?.access_token ?? null;
  } catch (err) {
    console.warn('[authFetch] Session token unavailable:', err.message);
    return null;
  }
}

export default async function authFetch(url, options = {}) {
  const token = await getSessionToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. The server may be waking up — please try again in a moment.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
