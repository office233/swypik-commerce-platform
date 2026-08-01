#!/bin/bash
# PAS 1: opresc (fără a șterge) tot ce e swypik + multi-erp. Meister-* NEATINS.
set -e
echo '== Containere de oprit =='
docker ps --format '{{.Names}}' | grep -E '^(swypik|multi-erp)' | sort
echo
echo '== Oprire =='
docker ps --format '{{.Names}}' | grep -E '^(swypik|multi-erp)' | xargs -r docker stop
echo
echo '== Ce mai ruleaza (trebuie doar meister-*) =='
docker ps --format '{{.Names}}\t{{.Status}}'
