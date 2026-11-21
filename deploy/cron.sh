#!/bin/sh
# Every 5 minutes from crontab: sends queued e-mail, day-before reminders and clean-up even when
# nobody visits the site. Install to ~/mikipierniki-data/cron.sh (chmod 700); see deploy/README.md.
set -eu
TOKEN=$(sed -n 's/^CRON_TOKEN=//p' "$HOME/mikipierniki-data/.env" | tr -d '"')
curl -fsS -m 60 -A "mikipierniki-cron" -H "x-cron-token: $TOKEN" -o /dev/null https://mikipierniki.pl/api/cron
