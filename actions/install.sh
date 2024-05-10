mkdir /app ;
cd /app/ || exit ;
git clone https://github.com/Polygant/OpenCEX.git ./deploy ;
cd deploy ;
chmod +x opencex.sh ;
./opencex.sh 2>&1 | tee /tmp/install.txt