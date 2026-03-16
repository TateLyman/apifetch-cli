# apifetch

A fast, zero-dependency CLI tool for testing REST APIs from the terminal. Like a simpler `curl` with pretty-printed output, colored JSON, status codes, and response times.

## Install

```bash
npm install -g apifetch-cli
```

## Usage

```bash
apifetch [METHOD] <url> [options]
```

The method defaults to `GET`, or `POST` if a body is provided with `-d`.

## Examples

### Simple GET

```bash
apifetch https://jsonplaceholder.typicode.com/posts/1
```

Output:

```
  200 OK  42ms  281 B

  GET https://jsonplaceholder.typicode.com/posts/1

  ────────────────────────────────────────────────────────────

  {
    "userId": 1,
    "id": 1,
    "title": "sunt aut facere ...",
    "body": "quia et suscipit ..."
  }
```

### POST with JSON Body

```bash
apifetch POST https://jsonplaceholder.typicode.com/posts \
  -d '{"title":"Hello","body":"World","userId":1}'
```

### PUT / PATCH / DELETE

```bash
apifetch PUT https://api.example.com/users/1 -d '{"name":"Jane"}'
apifetch PATCH https://api.example.com/users/1 -d '{"name":"Jane"}'
apifetch DELETE https://api.example.com/users/1
```

### Custom Headers

```bash
apifetch GET https://api.example.com/me \
  -H "Authorization: Bearer mytoken" \
  -H "Accept: application/json"
```

### Query Parameters

```bash
apifetch https://api.example.com/users -q "page=1&limit=10"
```

### Save Response to File

```bash
apifetch https://api.example.com/data -o response.json
```

### Verbose Mode (Show Response Headers)

```bash
apifetch GET https://api.example.com/status -V
```

## Options

| Flag | Description |
|------|-------------|
| `-d, --data <body>` | Request body (JSON string) |
| `-H, --header <header>` | Add header (`"Key: Value"`), repeatable |
| `-q, --query <params>` | Query parameters (`"key=val&key2=val2"`) |
| `-o, --output <file>` | Save response body to file |
| `-t, --timeout <secs>` | Request timeout in seconds (default: 30) |
| `-V, --verbose` | Show response headers |
| `--raw` | Print raw response without JSON formatting |
| `--no-follow` | Don't follow redirects |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

## Features

- **Zero dependencies** — pure Node.js, nothing to install beyond Node itself
- **Pretty JSON** — responses are syntax-highlighted with colors
- **Status at a glance** — color-coded status badges (green 2xx, blue 3xx, yellow 4xx, red 5xx)
- **Response time** — see how long the request took
- **Auto-detect content type** — JSON bodies get `application/json` automatically
- **Follow redirects** — follows up to 5 redirects by default
- **Pipe-friendly** — colors are automatically disabled when output is piped
- **Helpful errors** — friendly messages for DNS failures, connection refused, SSL issues

## Supported Methods

`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success (1xx, 2xx, 3xx, 4xx) |
| `1` | Error (network failure, invalid URL, timeout) |
| `2` | Server error (5xx response) |

## License

MIT

---

## Support

If you find this useful, consider supporting the project:

[![Built on Solana](https://img.shields.io/badge/Built%20on-Solana-9945FF?style=flat&logo=solana&logoColor=white)](https://solana.com)

**SOL Wallet:** `NaTTUfDDQ8U1RBqb9q5rz6vJ22cWrrT5UAsXuxnb2Wr`

- [DevTools.run](https://devtools-site-delta.vercel.app) — Free developer tools
- [@solscanitbot](https://t.me/solscanitbot) — Solana trading bot on Telegram
- [GitHub Sponsors](https://github.com/sponsors/TateLyman)
