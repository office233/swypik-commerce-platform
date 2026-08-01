#!/bin/bash
set -e
CODENAME=$(. /etc/os-release && echo "$VERSION_CODENAME")
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $CODENAME stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -qq 2>&1 | tail -1
sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin 2>&1 | tail -1
sudo usermod -aG docker dev
sudo systemctl enable --now docker
docker --version
docker compose version
