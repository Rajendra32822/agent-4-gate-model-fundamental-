import { getAccessToken } from './tokenStore';

const REQUEST_TIMEOUT_MS = 45000;

export default async function authFetch(url, options = {}) {
  const token = getAccessToken();

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
