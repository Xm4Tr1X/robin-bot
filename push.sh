#!/bin/sh
# Push to Xm4Tr1X/robin-bot
# Usage: ./push.sh  or  npm run push
gh auth switch --user Xm4Tr1X 2>/dev/null
TOKEN=$(gh auth token)
git push "https://Xm4Tr1X:${TOKEN}@github.com/Xm4Tr1X/robin-bot.git" main
gh auth switch --user NinaadNirgudkar 2>/dev/null
