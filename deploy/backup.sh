#!/bin/sh
# Nightly copy of the database, kept for 30 days (crontab, 03:30). Install to
# ~/mikipierniki-data/backup.sh (chmod 700). sqlite3 ".backup" is safe while the app is writing.
# Copy ~/mikipierniki-data/backups off the server too (see deploy/README.md), or a disk failure
# takes the backups with it.
set -eu
DB="$HOME/mikipierniki-data/mikipierniki.sqlite"
DIR="$HOME/mikipierniki-data/backups"
[ -f "$DB" ] || exit 0
mkdir -p "$DIR"
sqlite3 "$DB" ".backup '$DIR/db-$(date +%F).sqlite'"
find "$DIR" -name 'db-*.sqlite' -mtime +30 -delete
