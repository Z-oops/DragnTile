# DragnTile
An extension for GNOME Shell that helps to split screen in an easy way.
![split screen](https://github.com/Z-oops/DragnTile/blob/main/assets/split-screen.gif)

# Installation
Install from https://extensions.gnome.org/extension/7863/dragntile/

Or manually install with the following steps:
```shell
git clone https://github.com/Z-oops/DragnTile.git
cd DragnTile
zip DragnTile@luozengcn.gmail.com.zip -r * -x assets
gnome-extensions install DragnTile@luozengcn.gmail.com.zip
```
# History
20250917: Support drag to change tiling ratio.

20250213: Support split screen vertically.

20250225: available on https://extensions.gnome.org/extension/7863/dragntile/ 

# Planning
1. Enlarge on focus
2. Support recording tiling operations and restoring them
3. Support up to 4 windows 

# Issue report
Open extention settings and switch `debug` on. Reproduce the issue and provide log with journalctl.
```shell
journalctl -S today > issue
```
