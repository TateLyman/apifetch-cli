#!/usr/bin/env node

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

// ── ANSI Colors ──────────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
  bgBlue: '\x1b[44m',
};

const noColor = !process.stdout.isTTY || process.env.NO_COLOR;
if (noColor) {
  Object.keys(c).forEach(k => { c[k] = ''; });
}

// ── Argument Parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    method: null,
    url: null,
    headers: {},
    body: null,
    query: null,
    output: null,
    verbose: false,
    help: false,
    version: false,
    followRedirects: true,
    timeout: 30000,
    raw: false,
  };

  if (args.length === 0) {
    result.help = true;
    return result;
  }

  let i = 0;

  // Check if first arg is a method
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  if (methods.includes(args[0]?.toUpperCase())) {
    result.method = args[0].toUpperCase();
    i = 1;
  }

  // Scan remaining arguments
  for (; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
      return result;
    } else if (arg === '-v' || arg === '--version') {
      result.version = true;
      return result;
    } else if (arg === '-V' || arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '--raw') {
      result.raw = true;
    } else if (arg === '--no-follow') {
      result.followRedirects = false;
    } else if ((arg === '-d' || arg === '--data' || arg === '--body') && args[i + 1]) {
      result.body = args[++i];
    } else if ((arg === '-H' || arg === '--header') && args[i + 1]) {
      const header = args[++i];
      const colonIdx = header.indexOf(':');
      if (colonIdx > 0) {
        const key = header.slice(0, colonIdx).trim();
        const val = header.slice(colonIdx + 1).trim();
        result.headers[key] = val;
      }
    } else if ((arg === '-q' || arg === '--query') && args[i + 1]) {
      result.query = args[++i];
    } else if ((arg === '-o' || arg === '--output') && args[i + 1]) {
      result.output = args[++i];
    } else if ((arg === '-t' || arg === '--timeout') && args[i + 1]) {
      result.timeout = parseInt(args[++i], 10) * 1000;
    } else if (!arg.startsWith('-') && !result.url) {
      result.url = arg;
    }
  }

  // Default method
  if (!result.method) {
    result.method = result.body ? 'POST' : 'GET';
  }

  return result;
}

// ── JSON Pretty Printer with Colors ─────────────────────────────────────────

function colorizeJSON(obj, indent = 0) {
  const spaces = '  '.repeat(indent);
  const innerSpaces = '  '.repeat(indent + 1);

  if (obj === null) return `${c.magenta}null${c.reset}`;
  if (obj === undefined) return `${c.dim}undefined${c.reset}`;
  if (typeof obj === 'boolean') return `${c.magenta}${obj}${c.reset}`;
  if (typeof obj === 'number') return `${c.cyan}${obj}${c.reset}`;
  if (typeof obj === 'string') return `${c.green}"${escapeString(obj)}"${c.reset}`;

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    const items = obj.map(item => `${innerSpaces}${colorizeJSON(item, indent + 1)}`);
    return `[\n${items.join(',\n')}\n${spaces}]`;
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    const entries = keys.map(key => {
      const val = colorizeJSON(obj[key], indent + 1);
      return `${innerSpaces}${c.blue}"${escapeString(key)}"${c.reset}: ${val}`;
    });
    return `{\n${entries.join(',\n')}\n${spaces}}`;
  }

  return String(obj);
}

function escapeString(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

// ── Status Code Formatting ──────────────────────────────────────────────────

function formatStatus(code, message) {
  let bg, fg;
  if (code >= 200 && code < 300) {
    bg = c.bgGreen; fg = c.white;
  } else if (code >= 300 && code < 400) {
    bg = c.bgBlue; fg = c.white;
  } else if (code >= 400 && code < 500) {
    bg = c.bgYellow; fg = c.white;
  } else {
    bg = c.bgRed; fg = c.white;
  }
  return `${bg}${fg}${c.bold} ${code} ${message} ${c.reset}`;
}

// ── Format Response Time ─────────────────────────────────────────────────────

function formatTime(ms) {
  if (ms < 1000) return `${c.green}${ms}ms${c.reset}`;
  if (ms < 3000) return `${c.yellow}${(ms / 1000).toFixed(2)}s${c.reset}`;
  return `${c.red}${(ms / 1000).toFixed(2)}s${c.reset}`;
}

// ── Format Size ──────────────────────────────────────────────────────────────

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── HTTP Request ─────────────────────────────────────────────────────────────

function makeRequest(opts) {
  return new Promise((resolve, reject) => {
    let urlStr = opts.url;

    // Ensure protocol
    if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
      urlStr = 'https://' + urlStr;
    }

    // Append query params
    if (opts.query) {
      const separator = urlStr.includes('?') ? '&' : '?';
      urlStr += separator + opts.query;
    }

    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch {
      reject(new Error(`Invalid URL: ${urlStr}`));
      return;
    }

    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const reqHeaders = { ...opts.headers };

    // Set content-type for body
    if (opts.body && !reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
      // Try to detect if body is JSON
      try {
        JSON.parse(opts.body);
        reqHeaders['Content-Type'] = 'application/json';
      } catch {
        reqHeaders['Content-Type'] = 'text/plain';
      }
    }

    // User-Agent
    if (!reqHeaders['User-Agent'] && !reqHeaders['user-agent']) {
      reqHeaders['User-Agent'] = 'apifetch-cli/1.0.0';
    }

    const requestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: opts.method,
      headers: reqHeaders,
      timeout: opts.timeout,
    };

    const startTime = Date.now();

    const req = transport.request(requestOptions, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        const body = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body,
          elapsed,
          url: urlStr,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${opts.timeout / 1000}s`));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (opts.body) {
      req.write(opts.body);
    }

    req.end();
  });
}

// ── Follow Redirects ─────────────────────────────────────────────────────────

async function fetchWithRedirects(opts, maxRedirects = 5) {
  let currentOpts = { ...opts };
  let redirectCount = 0;

  while (redirectCount < maxRedirects) {
    const res = await makeRequest(currentOpts);

    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && opts.followRedirects) {
      redirectCount++;
      let location = res.headers.location;

      // Handle relative redirects
      if (!location.startsWith('http')) {
        const base = new URL(currentOpts.url);
        location = new URL(location, base).toString();
      }

      process.stderr.write(`${c.dim}  -> Redirect ${redirectCount}: ${location}${c.reset}\n`);
      currentOpts = { ...currentOpts, url: location, method: 'GET', body: null };
      continue;
    }

    return res;
  }

  throw new Error(`Too many redirects (max ${maxRedirects})`);
}

// ── Print Response ───────────────────────────────────────────────────────────

function printResponse(res, opts) {
  const separator = `${c.dim}${'─'.repeat(60)}${c.reset}`;

  // Status line
  console.log('');
  console.log(`  ${formatStatus(res.statusCode, res.statusMessage)}  ${formatTime(res.elapsed)}  ${c.dim}${formatSize(res.body.length)}${c.reset}`);
  console.log('');

  // URL
  console.log(`  ${c.dim}${opts.method}${c.reset} ${c.bold}${res.url}${c.reset}`);
  console.log('');

  // Headers (verbose or always show key ones)
  if (opts.verbose) {
    console.log(separator);
    console.log(`  ${c.bold}Response Headers${c.reset}`);
    console.log('');
    for (const [key, value] of Object.entries(res.headers)) {
      console.log(`  ${c.cyan}${key}${c.reset}: ${c.white}${value}${c.reset}`);
    }
    console.log('');
  }

  // Body
  const bodyStr = res.body.toString('utf-8');

  if (!bodyStr.trim()) {
    console.log(`  ${c.dim}(empty response body)${c.reset}`);
    console.log('');
    return;
  }

  console.log(separator);
  console.log('');

  if (opts.raw) {
    console.log(bodyStr);
  } else {
    // Try to parse as JSON and pretty-print
    try {
      const json = JSON.parse(bodyStr);
      console.log(colorizeJSON(json));
    } catch {
      // Not JSON, print as-is
      console.log(bodyStr);
    }
  }

  console.log('');

  // Save to file
  if (opts.output) {
    try {
      let outputData = bodyStr;
      // Pretty-print JSON when saving
      try {
        const json = JSON.parse(bodyStr);
        outputData = JSON.stringify(json, null, 2);
      } catch {
        // Not JSON, save raw
      }

      const outputPath = path.resolve(opts.output);
      fs.writeFileSync(outputPath, outputData, 'utf-8');
      console.log(`  ${c.green}Saved to${c.reset} ${outputPath}`);
      console.log('');
    } catch (err) {
      console.error(`  ${c.red}Failed to save:${c.reset} ${err.message}`);
    }
  }
}

// ── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${c.bold}apifetch${c.reset} — A fast CLI tool for testing REST APIs

${c.bold}USAGE${c.reset}
  apifetch [METHOD] <url> [options]

${c.bold}METHODS${c.reset}
  GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
  ${c.dim}(defaults to GET, or POST if -d is provided)${c.reset}

${c.bold}OPTIONS${c.reset}
  -d, --data <body>       Request body (JSON string)
  -H, --header <header>   Add header ("Key: Value"), repeatable
  -q, --query <params>    Query parameters ("key=val&key2=val2")
  -o, --output <file>     Save response body to file
  -t, --timeout <secs>    Request timeout in seconds (default: 30)
  -V, --verbose           Show response headers
  --raw                   Print raw response (no JSON formatting)
  --no-follow             Don't follow redirects
  -h, --help              Show this help
  -v, --version           Show version

${c.bold}EXAMPLES${c.reset}
  ${c.dim}# Simple GET${c.reset}
  apifetch https://jsonplaceholder.typicode.com/posts/1

  ${c.dim}# GET with query params${c.reset}
  apifetch https://api.example.com/users -q "page=1&limit=10"

  ${c.dim}# POST with JSON body${c.reset}
  apifetch POST https://jsonplaceholder.typicode.com/posts \\
    -d '{"title":"Hello","body":"World","userId":1}'

  ${c.dim}# Custom headers${c.reset}
  apifetch GET https://api.example.com/me \\
    -H "Authorization: Bearer mytoken" \\
    -H "Accept: application/json"

  ${c.dim}# Save response to file${c.reset}
  apifetch https://api.example.com/data -o response.json

  ${c.dim}# Verbose output with headers${c.reset}
  apifetch GET https://api.example.com/status -V
`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (opts.version) {
    const pkg = require('../package.json');
    console.log(`apifetch v${pkg.version}`);
    process.exit(0);
  }

  if (!opts.url) {
    console.error(`${c.red}Error:${c.reset} No URL provided. Use ${c.bold}apifetch --help${c.reset} for usage.`);
    process.exit(1);
  }

  try {
    const res = await fetchWithRedirects(opts);
    printResponse(res, opts);

    // Exit with non-zero for server errors
    if (res.statusCode >= 500) {
      process.exit(2);
    }
  } catch (err) {
    console.error('');
    console.error(`  ${c.red}${c.bold}Error:${c.reset} ${err.message}`);

    if (err.code === 'ENOTFOUND') {
      console.error(`  ${c.dim}Could not resolve hostname. Check the URL and your network connection.${c.reset}`);
    } else if (err.code === 'ECONNREFUSED') {
      console.error(`  ${c.dim}Connection refused. Is the server running?${c.reset}`);
    } else if (err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || err.code === 'CERT_HAS_EXPIRED') {
      console.error(`  ${c.dim}SSL certificate error. The server's certificate may be invalid.${c.reset}`);
    }

    console.error('');
    process.exit(1);
  }
}

main();
