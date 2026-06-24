@echo off

git remote add upstream https://github.com/decolua/9router 2>nul || git remote set-url upstream https://github.com/decolua/9router
git pull upstream master