# Main VPS bootstrap (Hetzner)

Notes on the manual steps run on the Hetzner main VPS that are not captured in
the compose file or the GitHub Actions deploy workflow. Run once per fresh box.

## Firewall

Goal: the API port is reachable only from the three checker droplet IPs.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw --force enable
```

### Docker bypass

Docker writes its own iptables rules into the `DOCKER-USER` chain, which ufw
does not see by default. A published container port (`-p 3000:3000`) is reachable
from anywhere even with ufw set to deny. Fixed with `ufw-docker`:

```bash
sudo wget -O /usr/local/bin/ufw-docker \
  https://github.com/chaifeng/ufw-docker/raw/master/ufw-docker
sudo chmod +x /usr/local/bin/ufw-docker
sudo ufw-docker install
sudo systemctl restart ufw
```

`ufw-docker install` inserts the `DOCKER-USER` chain rules that route container
traffic through ufw. After that, scope the API port to the three checker IPs
using `ufw route` (the container-aware form):

```bash
sudo ufw route allow proto tcp from 138.68.109.43 to any port 3000  # checker-eu
sudo ufw route allow proto tcp from 168.144.38.67 to any port 3000  # checker-ap
sudo ufw route allow proto tcp from 104.248.63.58 to any port 3000  # checker-us
```

Do not use `ufw-docker allow infra-api-1 3000/tcp` — that opens the port to
everyone. The scoped `ufw route` rules above are what enforce the allowlist.

### Verify

From a non-checker host (e.g. a laptop):

```bash
curl --max-time 5 http://46.62.208.192:3000/health
# expect: connection timed out
```

From any checker droplet:

```bash
curl -sS --max-time 5 http://46.62.208.192:3000/health
# expect: {"status":"ok",...}
```

Existing connections survive `ufw enable`/route changes; checker heartbeats keep
flowing without restarting the checker containers.

## Public TLS (Caddy)

Recruiter-facing traffic uses **HTTPS on `argus.tanhab.com`**. Checkers keep
using **HTTP on `:3000`** with the allowlist above — do not remove those rules.

### DNS (Namecheap)

| Type | Host | Value |
|------|------|-------|
| A | `argus` | `46.62.208.192` |

Verify before first deploy:

```bash
nslookup argus.tanhab.com 8.8.8.8
# expect: 46.62.208.192
```

### Firewall — open 80/443 for Let's Encrypt and browsers

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

Port 3000 stays scoped to the three checker IPs only.

### Compose

`infra/docker-compose.prod.yml` runs **Caddy** alongside the API:

- `infra/Caddyfile` — `argus.tanhab.com` → `reverse_proxy api:3000`
- Caddy publishes **80** and **443**; API still publishes **3000** for checkers
- Cert storage: `caddy-data` / `caddy-config` volumes (survive redeploys)

Deploy copies `infra/Caddyfile` via GitHub Actions. After merge, `docker compose
-f infra/docker-compose.prod.yml up -d` starts or recreates the `caddy` service.

First boot: Caddy requests a Let's Encrypt cert via HTTP-01 on port 80. DNS must
resolve and port 80 must be reachable from the internet.

### Verify

From any host (not checker-only):

```bash
curl -sS https://argus.tanhab.com/health
# expect: {"status":"ok",...}

curl -sS https://argus.tanhab.com/v1/public/monitors
# expect: JSON with allowlisted showcase monitor ids
```

Checker path unchanged:

```bash
curl -sS --max-time 5 http://46.62.208.192:3000/health
# from a checker droplet: ok
# from a laptop: connection timed out (expected)
```

### Demo cookie

With `NODE_ENV=production` behind HTTPS, the demo token cookie is set with
`Secure: true`. Local dev on `http://localhost` keeps `Secure: false`.
