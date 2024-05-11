cd /app/opencex/frontend/ ;
git pull ; 
docker build -t frontend -f deploy/Dockerfile . ;
cd /app/opencex/ ;
docker compose up -d --force-recreate