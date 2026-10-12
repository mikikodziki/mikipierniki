#!/bin/sh
# Nightly copy of the database, kept for 30 days. Install to /srv/mikipierniki/backup.sh (chmod +x).
# sqlite3 ".backup" is safe while the server is writing. Copy /var/lib/mikipierniki/backups
# off the VPS too (see deploy/README.md), or a disk failure takes the backups with it.
set -eu
DB=/var/lib/mikipierniki/mikipierniki.sqlite
DIR=/var/lib/mikipierniki/backups
mkdir -p "$DIR"
sqlite3 "$DB" ".backup '$DIR/db-$(date +%F).sqlite'"
find "$DIR" -name 'db-*.sqlite' -mtime +30 -delete
