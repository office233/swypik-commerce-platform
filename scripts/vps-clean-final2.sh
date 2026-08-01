#!/bin/bash
set -e
echo '== unde mai apare swypik in nginx activ =='
docker exec meister-nginx grep -in swypik /etc/nginx/nginx.conf | head -6 || echo none
echo '== mount nginx =='
docker inspect meister-nginx --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}' | grep -i nginx
echo '== deconectez meister-nginx de la reteaua swypik =='
docker network disconnect swypik-prod_default meister-nginx
docker network rm swypik-prod_default
echo '== verificare nginx functional dupa disconnect =='
sleep 2
curl -s -o /dev/null -w 'health: %{http_code}\n' -m 5 http://localhost/health
docker network ls --format '{{.Name}}' | grep -iE 'swypik|multi' || echo 'RETELE CURATE'
