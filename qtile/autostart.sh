#!/usr/bin/env bash 

### AUTOSTART PROGRAMS ###
picom --daemon &
sleep 1

xrandr --output DisplayPort-0 --mode 1920x1080 --rate 144 --primary &
xrandr --output HDMI-A-0 --pos 0x180 &

### UNCOMMENT ONLY ONE OF THE FOLLOWING THREE OPTIONS! ###
# 1. Uncomment to restore last saved wallpaper
# xargs xwallpaper --stretch < ~/.cache/wall &
# 2. Uncomment to set a random wallpaper on login
# find /usr/share/backgrounds/dtos-backgrounds/ -type f | shuf -n 1 | xargs xwallpaper --stretch &
# 3. Uncomment to set wallpaper with nitrogen
nitrogen --restore &
