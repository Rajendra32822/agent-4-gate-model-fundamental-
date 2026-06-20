const https = require('https');

/**
 * Sends an outbound alert to a configured Telegram channel/chat.
 * Falls back to console warning if credentials are not set.
 *
 * @param {string} message The text message to alert (markdown supported by Telegram bot)
 * @returns {Promise<boolean>} True if sent successfully or handled by fallback, false on failure.
 */
async function sendAlert(message) {
  const cleanMsg = String(message || '').trim();
  if (!cleanMsg) return false;

  console.log(`[Alerting] ${cleanMsg}`);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[Alerting] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured. Skipping outbound alert.');
    return true; // Handled gracefully by fallback log
  }

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text: `🔔 *ValueSight Alert*\n\n${cleanMsg}`,
      parse_mode: 'Markdown',
    });

    const req = https.request({
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${token}/sendMessage`,

      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          console.error(`[Alerting] Telegram API returned code ${res.statusCode}: ${body}`);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[Alerting] Telegram connection error: ${err.message}`);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('[Alerting] Telegram connection timed out.');
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

module.exports = { sendAlert };
