#!/bin/bash
nohup cloudflared tunnel login > /tmp/cf-login.log 2>&1 &
sleep 8
grep -oE 'https://dash\.cloudflare\.com/argotunnel[^[:space:]]*' /tmp/cf-login.log | head -1
