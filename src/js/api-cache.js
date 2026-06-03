const fs = require('fs');
const path = require('path');
const axios = require('axios');

let installed = false;

const SENSITIVE_KEY_RE = /(api[-_ ]?key|api[-_ ]?secret|secret|signature|sign|passphrase|authorization|token|password|x-bapi-api-key|x-bapi-sign|ok-access-key|ok-access-sign|ok-access-passphrase|x-mbx-apikey)/i;

function getCacheDir() {
  return process.env.CRYPTOAI_CACHE_DIR || path.join(process.cwd(), 'cache');
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    // Ignore cache errors; API calls must not fail because of cache.
  }
}

function maskValue(value) {
  if (value === undefined || value === null) return value;
  const text = String(value);
  if (text.length <= 8) return '***';
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function sanitize(value, depth = 0) {
  if (depth > 8) return '[MaxDepth]';
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => sanitize(item, depth + 1));

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY_RE.test(key) ? maskValue(val) : sanitize(val, depth + 1);
  }
  return out;
}

function safeFilename(input) {
  return String(input || 'request')
    .replace(/^https?:\/\//i, '')
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/_+/g, '_')
    .slice(0, 140);
}

function writeApiCache(entry) {
  try {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const dir = path.join(getCacheDir(), day);
    ensureDir(dir);

    const url = entry?.request?.url || 'request';
    const time = now.toISOString().replace(/[:.]/g, '-');
    const file = `${time}_${entry.status || 'unknown'}_${safeFilename(url)}.json`;
    fs.writeFileSync(path.join(dir, file), JSON.stringify(sanitize(entry), null, 2), 'utf8');
  } catch (e) {
    // Never throw from cache writer.
  }
}

function requestSnapshot(config = {}) {
  const fullUrl = (() => {
    try {
      if (config.baseURL) return new URL(config.url, config.baseURL).toString();
      return config.url;
    } catch (e) {
      return config.url;
    }
  })();

  return {
    method: (config.method || 'GET').toUpperCase(),
    url: fullUrl,
    headers: config.headers || {},
    params: config.params,
    data: config.data
  };
}

function installAxiosCache() {
  if (installed) return;
  installed = true;
  ensureDir(getCacheDir());

  axios.interceptors.request.use(config => {
    config.metadata = { ...(config.metadata || {}), cryptoAiStartedAt: Date.now() };
    return config;
  });

  axios.interceptors.response.use(
    response => {
      writeApiCache({
        createdAt: new Date().toISOString(),
        status: 'success',
        durationMs: Date.now() - (response.config?.metadata?.cryptoAiStartedAt || Date.now()),
        request: requestSnapshot(response.config),
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data
        }
      });
      return response;
    },
    error => {
      writeApiCache({
        createdAt: new Date().toISOString(),
        status: 'error',
        durationMs: Date.now() - (error.config?.metadata?.cryptoAiStartedAt || Date.now()),
        request: requestSnapshot(error.config || {}),
        error: {
          message: error.message,
          code: error.code,
          responseStatus: error.response?.status,
          responseStatusText: error.response?.statusText,
          responseHeaders: error.response?.headers,
          responseData: error.response?.data
        }
      });
      return Promise.reject(error);
    }
  );
}

module.exports = {
  getCacheDir,
  installAxiosCache,
  writeApiCache,
  sanitize
};
