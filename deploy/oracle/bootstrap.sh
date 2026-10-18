#!/usr/bin/env bash
# First deploy on the Oracle VM in one go (docs/RUNBOOK.md → First deploy, Free hosting): Docker, Postgres 16 on
# 127.0.0.1, the shop, Postiz, the scheduler and the Cloudflare tunnel. Safe to run again: secrets are made once, and a
# second run pulls the latest code, migrates and restarts (a release).
#   sudo TUNNEL_TOKEN=… ADMIN_EMAIL=you@herbalholland.com ADMIN_NAME="Your Name" bash deploy/oracle/bootstrap.sh
#   TUNNEL_TOKEN: Cloudflare → Zero Trust → Networks → Tunnels → Create (cloudflared) → the token in the install
#     command. Its public hostnames: shop.herbalholland.com → http://localhost:3000, social.herbalholland.com → http://localhost:5000
#   REPO_URL (a private repo needs a token in it) and REF default to GitHub's main.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }
DIR=/srv/herbal-holland
REPO_URL=${REPO_URL:-https://github.com/Reshigan/HerbalHolland.git}
REF=${REF:-main}
rnd() { openssl rand -hex 32; }
setenv() { sed -i "s|^$1=.*|$1=\"$2\"|" "$3"; }

export HOME=${HOME:-/root} DEBIAN_FRONTEND=noninteractive # also runs from cloud-init on first boot (provision.sh)
echo 'DPkg::Lock::Timeout "900";' > /etc/apt/apt.conf.d/90wait-for-lock # Ubuntu's own updates hold the lock at first boot
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
apt-get update -qq && apt-get install -y -qq git openssl curl postgresql-16 >/dev/null

if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch -q origin "$REF" && git -C "$DIR" checkout -q -B "$REF" FETCH_HEAD
else git clone -q --branch "$REF" "$REPO_URL" "$DIR"; fi
cd "$DIR"

# Updates pull over SSH with this VM's own read-only deploy key (add the printed key: repo → Settings → Deploy keys)
K=/root/.ssh/herbal_deploy
[ -f $K ] || { install -d -m 700 /root/.ssh; ssh-keygen -q -t ed25519 -N '' -C herbal-holland-vm -f $K; }
echo "DEPLOY_PUBKEY $(cat $K.pub)"
git config core.sshCommand "ssh -i $K -o StrictHostKeyChecking=accept-new"
git remote set-url origin git@github.com:Reshigan/HerbalHolland.git

if [ ! -f .env ]; then
  PW=$(rnd)
  sudo -u postgres psql -q -c "CREATE ROLE hh LOGIN PASSWORD '$PW'" -c "CREATE DATABASE hh OWNER hh"
  cp .env.example .env && chmod 600 .env
  setenv DATABASE_URL "postgresql://hh:$PW@127.0.0.1:5432/hh" .env
  setenv SESSION_SECRET "$(openssl rand -base64 48)" .env
  setenv CRON_SECRET "$(rnd)" .env
  setenv APP_URL https://shop.herbalholland.com .env
  setenv DEMO_MODE false .env
fi
install -d -m 700 /etc/herbal-holland
sed -n 's/^CRON_SECRET="\(.*\)"/\1/p' .env > /etc/herbal-holland/cron-secret && chmod 600 /etc/herbal-holland/cron-secret

C="docker compose -f docker-compose.prod.yml"
$C build && $C run --rm migrate && $C up -d app
[ -n "${ADMIN_EMAIL:-}" ] && [ ! -f /etc/herbal-holland/admin-created ] &&
  $C run --rm migrate npx tsx scripts/create-admin.ts --email "$ADMIN_EMAIL" --name "${ADMIN_NAME:-HQ Admin}" &&
  touch /etc/herbal-holland/admin-created

S='Authorization: Bearer $(cat /etc/herbal-holland/cron-secret)'
cat > /etc/cron.d/herbal-holland <<CRON
*/15 * * * *  root  curl -fsS -m 1500 -X POST -H "$S" http://localhost:3000/api/cron/frequent   >/dev/null
*/5  * * * *  root  curl -fsS -m 300  -X POST -H "$S" http://localhost:3000/api/cron/staff-push >/dev/null
0    0 * * *  root  curl -fsS -m 2700 -X POST -H "$S" http://localhost:3000/api/cron/daily      >/dev/null
0    1 * * *  root  curl -fsS -m 1500 -X POST -H "$S" http://localhost:3000/api/cron/operations >/dev/null
*/10 * * * *  root  cd $DIR && flock -n /run/herbal-update.lock sh -c 'git fetch -q origin $REF && [ "\$(git rev-parse HEAD)" != "\$(git rev-parse FETCH_HEAD)" ] && bash deploy/oracle/bootstrap.sh' >>/var/log/herbal-update.log 2>&1
CRON

if [ ! -f deploy/postiz/.env ]; then
  cp deploy/postiz/.env.example deploy/postiz/.env && chmod 600 deploy/postiz/.env
  for k in JWT_SECRET POSTIZ_DB_PASSWORD TEMPORAL_DB_PASSWORD; do setenv "$k" "$(rnd)" deploy/postiz/.env; done
fi
(cd deploy/postiz && docker compose up -d)

if ! systemctl is-active -q cloudflared; then
  : "${TUNNEL_TOKEN:?set TUNNEL_TOKEN (see the top of this script)}"
  curl -fsSLo /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$(dpkg --print-architecture).deb"
  dpkg -i /tmp/cloudflared.deb && cloudflared service install "$TUNNEL_TOKEN"
fi

for _ in $(seq 30); do curl -fsS http://127.0.0.1:3000/api/health >/dev/null && { echo "shop healthy"; exit 0; }; sleep 5; done
echo "shop not healthy yet: docker compose -f docker-compose.prod.yml logs app" >&2; exit 1
