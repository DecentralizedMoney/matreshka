cd /app/opencex/nuxt/; 
git pull;
docker build -t nuxt -f deploy/Dockerfile . ;
cd /app/opencex ;
docker compose up -d --force-recreate