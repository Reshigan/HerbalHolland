#!/usr/bin/env bash
# Creates the Always Free Ampere A1 VM in Oracle Cloud's Johannesburg region, retrying until the region has capacity
# ("Out of host capacity" is the normal answer for free shapes; it usually lands within a few hours).
#   Needs the OCI CLI signed in (oci setup config) and these set:
#   COMPARTMENT_OCID, SUBNET_OCID, IMAGE_OCID (Ubuntu 24.04 aarch64 in af-johannesburg-1), SSH_KEY (path to .pub)
#   OCPUS (default 4) and MEMORY_GB (default 24) are the whole free allowance; AD defaults to the region's first.
set -euo pipefail
: "${COMPARTMENT_OCID:?}" "${SUBNET_OCID:?}" "${IMAGE_OCID:?}" "${SSH_KEY:?}"
AD=${AD:-$(oci iam availability-domain list --compartment-id "$COMPARTMENT_OCID" --query 'data[0].name' --raw-output)}
until oci compute instance launch \
  --compartment-id "$COMPARTMENT_OCID" --availability-domain "$AD" --subnet-id "$SUBNET_OCID" --image-id "$IMAGE_OCID" \
  --shape VM.Standard.A1.Flex --shape-config "{\"ocpus\": ${OCPUS:-4}, \"memoryInGBs\": ${MEMORY_GB:-24}}" \
  --boot-volume-size-in-gbs 200 --display-name herbal-holland --assign-public-ip true \
  --ssh-authorized-keys-file "$SSH_KEY" --wait-for-state RUNNING; do
  echo "$(date +%H:%M) no capacity yet, trying again in 10 minutes" >&2
  sleep 600
done
