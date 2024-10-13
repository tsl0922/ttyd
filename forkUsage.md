# Build the fork for TTYD
```
sudo apt-get update
sudo apt-get install -y build-essential cmake git libjson-c-dev libwebsockets-dev
git clone https://github.com/strikeraryu/ttyd-meslolgs-nerdfont.git 
cd ttyd && mkdir build && cd build
cmake ..
make && sudo make install
```
Then you can use this command to run TTYD
```
./ttyd -W -t fontSize=16 -t fontFamily="MesloLGS NF" /bin/zsh
```
