cd /app/opencex/backend/ 
sudo git pull 
sudo docker build -t opencex -f Dockerfile . 
cd /app/opencex/ 
docker compose stop 
docker compose up -d 
docker exec -it opencex python manage.py migrate

#cd /app/opencex/backend
#docker compose restart
