#!/usr/bin/env bash
# The whole Oracle + Cloudflare setup from a terminal, no console clicks (docs/RUNBOOK.md → Free hosting): a closed
# network, the Cloudflare tunnel with shop. and social.herbalholland.com, and the VM, which runs bootstrap.sh on first
# boot. Safe to run again: it finds what exists by name. Needs curl, jq and the OCI CLI, and these set:
#   OCI_CLI_USER, OCI_CLI_TENANCY, OCI_CLI_FINGERPRINT, OCI_CLI_KEY_CONTENT (the API key's private PEM),
#   OCI_CLI_REGION=af-johannesburg-1   (Oracle → Profile → API keys → Add API key)
#   CLOUDFLARE_API_TOKEN (Account: Cloudflare Tunnel Edit; Zone herbalholland.com: DNS Edit), CLOUDFLARE_ACCOUNT_ID
#   ADMIN_EMAIL, ADMIN_NAME: the first HQ admin. Its temporary password shows in the VM's console history:
#   oci compute console-history capture --instance-id … then get-content (it must be changed at first sign-in)
set -euo pipefail
: "${CLOUDFLARE_API_TOKEN:?}" "${CLOUDFLARE_ACCOUNT_ID:?}" "${OCI_CLI_TENANCY:?}" "${ADMIN_EMAIL:?}"
C=${COMPARTMENT_OCID:-$OCI_CLI_TENANCY}
HERE=$(cd "$(dirname "$0")" && pwd)
cf() { curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" "https://api.cloudflare.com/client/v4$@"; }
first() { jq -r '.data[0].id // empty'; }

# Cloudflare: the tunnel, its routes and the two DNS records
A=/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel
T=$(cf "$A?name=herbal-holland&is_deleted=false" | jq -r '.result[0].id // empty')
[ -n "$T" ] || T=$(cf "$A" -X POST -d '{"name":"herbal-holland","config_src":"cloudflare"}' | jq -r .result.id)
cf "$A/$T/configurations" -X PUT -d '{"config":{"ingress":[
  {"hostname":"shop.herbalholland.com","service":"http://localhost:3000"},
  {"hostname":"social.herbalholland.com","service":"http://localhost:5000"},
  {"service":"http_status:404"}]}}' >/dev/null
Z=$(cf "/zones?name=herbalholland.com" | jq -r '.result[0].id')
for h in shop social; do
  rec="{\"type\":\"CNAME\",\"name\":\"$h.herbalholland.com\",\"content\":\"$T.cfargotunnel.com\",\"proxied\":true}"
  R=$(cf "/zones/$Z/dns_records?name=$h.herbalholland.com" | jq -r '.result[0].id // empty')
  if [ -n "$R" ]; then cf "/zones/$Z/dns_records/$R" -X PUT -d "$rec" >/dev/null; else cf "/zones/$Z/dns_records" -X POST -d "$rec" >/dev/null; fi
done
TOKEN=$(cf "$A/$T/token" | jq -r .result)
echo "tunnel $T routes shop. and social.herbalholland.com"

# Oracle: a VCN with one public subnet whose security list has no inbound rules at all
V=$(oci network vcn list -c "$C" --display-name herbal-holland | first)
[ -n "$V" ] || V=$(oci network vcn create -c "$C" --display-name herbal-holland --cidr-blocks '["10.0.0.0/16"]' --wait-for-state AVAILABLE | jq -r .data.id)
G=$(oci network internet-gateway list -c "$C" --vcn-id "$V" | first)
if [ -z "$G" ]; then
  G=$(oci network internet-gateway create -c "$C" --vcn-id "$V" --is-enabled true --display-name herbal-holland --wait-for-state AVAILABLE | jq -r .data.id)
  RT=$(oci network vcn get --vcn-id "$V" | jq -r '.data["default-route-table-id"]')
  oci network route-table update --rt-id "$RT" --force --route-rules "[{\"destination\":\"0.0.0.0/0\",\"networkEntityId\":\"$G\"}]" >/dev/null
fi
SL=$(oci network security-list list -c "$C" --vcn-id "$V" --display-name closed | first)
[ -n "$SL" ] || SL=$(oci network security-list create -c "$C" --vcn-id "$V" --display-name closed --ingress-security-rules '[]' \
  --egress-security-rules '[{"destination":"0.0.0.0/0","protocol":"all"}]' --wait-for-state AVAILABLE | jq -r .data.id)
S=$(oci network subnet list -c "$C" --vcn-id "$V" --display-name public | first)
[ -n "$S" ] || S=$(oci network subnet create -c "$C" --vcn-id "$V" --display-name public --cidr-block 10.0.0.0/24 \
  --security-list-ids "[\"$SL\"]" --wait-for-state AVAILABLE | jq -r .data.id)

if [ -n "$(oci compute instance list -c "$C" --display-name herbal-holland --lifecycle-state RUNNING | first)" ]; then
  echo "VM already running: to release, run bootstrap.sh on it again"; exit 0
fi
IMG=$(oci compute image list -c "$C" --operating-system "Canonical Ubuntu" --operating-system-version 24.04 \
  --shape VM.Standard.A1.Flex --sort-by TIMECREATED --sort-order DESC | first)
UD=$(mktemp)
cat > "$UD" <<BOOT
#!/bin/bash
git clone -q https://github.com/Reshigan/HerbalHolland.git /srv/herbal-holland
TUNNEL_TOKEN='$TOKEN' ADMIN_EMAIL='$ADMIN_EMAIL' ADMIN_NAME='${ADMIN_NAME:-HQ Admin}' bash /srv/herbal-holland/deploy/oracle/bootstrap.sh 2>&1 | tee /dev/console
BOOT
COMPARTMENT_OCID=$C SUBNET_OCID=$S IMAGE_OCID=$IMG USER_DATA=$UD "$HERE/create-vm.sh"
rm -f "$UD"
echo "VM launched; it deploys itself in about 20 minutes, then https://shop.herbalholland.com answers"
