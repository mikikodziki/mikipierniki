#!/bin/sh
# Nightly copy of the database (crontab, 03:30). It stays on the server for 30 days and, when
# ~/mikipierniki-data/backup.env exists, also goes to S3 (Stockholm), where a lifecycle rule
# deletes it after 30 days. sqlite3 ".backup" is safe while the app is writing.
# The upload is a plain HTTPS PUT with no AWS credentials: the bucket policy accepts PUTs only
# from this server's IP and only under the secret path in backup.env
# (S3_URL=https://<bucket>.s3.eu-north-1.amazonaws.com/<path>); nothing can read or list it.
# Each copy gets a random suffix that is never written down here, so even someone who takes over
# this hosting account can add files but cannot overwrite the existing copies. Never log S3_URL.
# Each run adds one line to ~/mikipierniki-data/backup.log. Deploys install this file and cron.sh
# into ~/mikipierniki-data/ (see deploy/README.md).
set -eu
DATA="$HOME/mikipierniki-data"
DB="$DATA/mikipierniki.sqlite"
DIR="$DATA/backups"
DAY=$(date +%F)
OUT="$DIR/db-$DAY.sqlite"
STAMP="db-$(date +%F-%H%M)"
NAME="$STAMP-$(openssl rand -hex 8).sqlite.gz"   # the suffix is not logged, see above

log() { echo "$(date '+%F %T') $*" >> "$DATA/backup.log"; }
fail() { log "FAILED: $*"; echo "backup failed: $*" >&2; exit 1; }

[ -f "$DB" ] || exit 0
mkdir -p "$DIR"
sqlite3 "$DB" ".backup '$OUT'" || fail "sqlite3 .backup"
[ "$(sqlite3 "$OUT" 'PRAGMA integrity_check')" = ok ] || fail "integrity check of $OUT"
find "$DIR" -name 'db-*.sqlite*' -mtime +30 -delete

if [ ! -f "$DATA/backup.env" ]; then
  log "ok: $OUT (server only, no backup.env)"
  exit 0
fi
. "$DATA/backup.env"
gzip -9 -c "$OUT" > "$OUT.gz" || fail "gzip"
# Content-MD5 makes S3 refuse a damaged upload instead of storing it
MD5=$(openssl md5 -binary "$OUT.gz" | base64)
CODE=$(curl -sS -m 300 -o "$DATA/backup.err" -w '%{http_code}' -T "$OUT.gz" \
  -H "Content-MD5: $MD5" "$S3_URL/$NAME") || CODE="curl error"
[ "$CODE" = 200 ] || fail "S3 upload of $STAMP: $CODE $(head -c 300 "$DATA/backup.err" 2>/dev/null)"
rm -f "$OUT.gz" "$DATA/backup.err"
log "ok: $OUT + S3 $STAMP-…"
