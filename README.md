# DragnTile
An extension for GNOME Shell that helps to split screen in an easy way.
![split screen](./assets/split screen.gif)

# Install
```shell
git clone https://github.com/Z-oops/DragnTile.git
cd DragnTile
zip DragnTile@luozengcn.gmail.com.zip -r * -x assets
gnome-extensions install DragnTile@luozengcn.gmail.com.zip 
```

# Planning
1. Add to https://extensions.gnome.org/
2. Support split vertically.
3. Support recording tiling operations and restoring them 

# Issue report
Open extention settings and switch `debug` on. Reproduce the issue and provide log with journalctrl.
```shell
journalctrl -S today > issue
```
