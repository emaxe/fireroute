#!/bin/bash
set -e
cd /root/projects/fireroute
exec docker-compose up --build
