const { test } = require('node:test');
const assert = require('node:assert/strict');
const https = require('https');
const { sendAlert } = require('../platform/alerting');

test('sendAlert: returns false if message is empty', async () => {
  const result = await sendAlert('');
  assert.equal(result, false);
});

test('sendAlert: falls back to console.log and returns true when env vars are missing', async () => {
  const oldToken = process.env.TELEGRAM_BOT_TOKEN;
  const oldChatId = process.env.TELEGRAM_CHAT_ID;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;

  try {
    const result = await sendAlert('Test alert fallback');
    assert.equal(result, true);
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = oldToken;
    process.env.TELEGRAM_CHAT_ID = oldChatId;
  }
});

test('sendAlert: calls telegram API with correct parameters when env vars are present', async () => {
  const oldToken = process.env.TELEGRAM_BOT_TOKEN;
  const oldChatId = process.env.TELEGRAM_CHAT_ID;
  process.env.TELEGRAM_BOT_TOKEN = '123456:mock_token';
  process.env.TELEGRAM_CHAT_ID = '987654321';

  const originalRequest = https.request;
  let requestOptions = null;
  let requestBody = '';

  // Mock https.request
  https.request = (options, callback) => {
    requestOptions = options;
    return {
      write: (data) => {
        requestBody = data;
      },
      end: () => {
        // Trigger a successful response callback
        const mockRes = {
          statusCode: 200,
          on: (event, handler) => {
            if (event === 'data') {
              handler('{"ok":true}');
            }
            if (event === 'end') {
              handler();
            }
          }
        };
        callback(mockRes);
      },
      on: () => {},
      timeout: () => {},
      destroy: () => {}
    };
  };

  try {
    const result = await sendAlert('Hello world from tests');
    assert.equal(result, true);
    assert.ok(requestOptions, 'https.request was not called');
    assert.equal(requestOptions.hostname, 'api.telegram.org');
    assert.equal(requestOptions.method, 'POST');
    assert.equal(requestOptions.path, '/bot123456:mock_token/sendMessage');
    
    const parsedBody = JSON.parse(requestBody);
    assert.equal(parsedBody.chat_id, '987654321');
    assert.ok(parsedBody.text.includes('Hello world from tests'));
  } finally {
    // Restore original https.request and env vars
    https.request = originalRequest;
    process.env.TELEGRAM_BOT_TOKEN = oldToken;
    process.env.TELEGRAM_CHAT_ID = oldChatId;
  }
});
