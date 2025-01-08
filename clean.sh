# removing temp files
sudo rm -f networks.temp* > /dev/null
sudo rm -f basic_wep.cap-0* > /dev/null
sudo rm -f key.log > /dev/null

# disabling monitor mode
sudo airmon-ng stop $1 > /dev/null
