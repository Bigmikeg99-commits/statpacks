#!/bin/bash
cd "/Users/seeleyfam5/Desktop/StatPacks/statpacks" && git add -A && git commit -m "${1:-deploy}" && git push
