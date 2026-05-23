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

## TLS

Currently HTTP. The API key crosses the three known point-to-point links
between the Hetzner main VPS and the DigitalOcean checker droplets, not the
open internet — but it is not encrypted in transit. Adding Caddy + Let's Encrypt
is blocked on owning a domain. Tracked as the next thing to fix when that lands.
