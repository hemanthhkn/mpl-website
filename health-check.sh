#!/bin/bash

echo "================ MPL HEALTH CHECK ================"

echo
echo "1) PM2 process status"
pm2 status || echo "❌ pm2 status failed"

echo
echo "2) Backend /health endpoint"
curl -s -i http://localhost:3001/health || echo "❌ Backend health check failed"

echo
echo "3) MySQL connection & tables"
mysql -u hemanth -pVirat@1845 -e "USE mpl_tournament; SHOW TABLES;" || echo "❌ MySQL check failed"

echo
echo "4) Nginx status"
sudo systemctl is-active nginx && echo "nginx is active" || echo "❌ nginx is NOT active"

echo
echo "5) Website over HTTP"
curl -s -I http://mfighters.com || echo "❌ HTTP check failed"

echo
echo "6) Website over HTTPS"
curl -k -s -I https://mfighters.com || echo "❌ HTTPS check failed"

echo
echo "================= CHECK COMPLETE ================="
