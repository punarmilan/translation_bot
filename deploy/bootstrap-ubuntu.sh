#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo: sudo ./bootstrap-ubuntu.sh" >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  echo "This bootstrap script requires Ubuntu." >&2
  exit 1
fi

source /etc/os-release
if [[ "${ID}" != "ubuntu" ]]; then
  echo "Unsupported distribution: ${ID}. This bootstrap script requires Ubuntu." >&2
  exit 1
fi

deploy_user="${SUDO_USER:-}"
if [[ -z "${deploy_user}" || "${deploy_user}" == "root" ]]; then
  echo "Run through sudo from the non-root account that GitHub Actions will use." >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

architecture="$(dpkg --print-architecture)"
echo "deb [arch=${architecture} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
usermod -aG docker "${deploy_user}"

echo "Docker is ready. Log out and back in so ${deploy_user} receives docker-group access."
echo "Allow inbound TCP 22, 80, 443 and UDP 443 in the VPS/cloud firewall."
