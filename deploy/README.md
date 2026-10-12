# Wdrożenie na VPS (seohost)

Strona działa jako jeden proces Node (Astro + adapter `@astrojs/node`) za nginx.
Statyczne podstrony serwuje nginx prosto z dysku; `/`, `/warsztaty`, formularze (`/api/*`)
i panel (`/panel`) renderuje Node. Dane są w jednym pliku SQLite, poczta wychodzi
przez serwer pocztowy, który już działa na tym VPS dla `@mikipierniki.pl`.

```
/srv/mikipierniki/releases/<commit>/   kolejne wydania (dist/, node_modules/)
/srv/mikipierniki/current -> releases/<commit>
/var/lib/mikipierniki/mikipierniki.sqlite  baza (poza wydaniami)
/var/lib/mikipierniki/backups/             nocne kopie, 30 dni
/etc/mikipierniki.env                      hasła i ustawienia (deploy/env.example)
```

## 0. Rozpoznanie (przed zmianami)

Na VPS nic nie może przeszkodzić poczcie. Najpierw sprawdź, co tam jest:

```sh
cat /etc/os-release
ss -tlnp                        # kto słucha na 80/443 (webmail? panel?), 25/587 (poczta)
ls /usr/local/directadmin /usr/local/hestia 2>/dev/null   # panel administracyjny?
systemctl status postfix exim dovecot 2>/dev/null | grep -E "Loaded|Active"
which node nginx sqlite3 certbot
dig +short TXT mikipierniki.pl; dig +short TXT default._domainkey.mikipierniki.pl   # SPF, DKIM
```

Jeśli działa panel (DirectAdmin, HestiaCP itp.), stronę i certyfikat lepiej dodać przez panel,
a z tego katalogu wziąć tylko blok `location` i proxy do Node.

## 1. Jednorazowa konfiguracja

```sh
# Node 24 (node:sqlite), nginx, sqlite3, certbot
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash - && sudo apt install -y nodejs nginx sqlite3 certbot python3-certbot-nginx

# użytkownik, który wgrywa wydania i uruchamia serwer
sudo useradd --system --create-home --shell /bin/bash mikipierniki
sudo mkdir -p /srv/mikipierniki/releases /var/lib/mikipierniki
sudo chown -R mikipierniki: /srv/mikipierniki /var/lib/mikipierniki
sudo -u mikipierniki mkdir -p ~mikipierniki/.ssh   # tu klucz publiczny z GitHub Actions (authorized_keys)

# jedyne sudo, jakiego potrzebuje deploy
echo 'mikipierniki ALL=(root) NOPASSWD: /usr/bin/systemctl restart mikipierniki' | sudo tee /etc/sudoers.d/mikipierniki

# ustawienia
sudo cp deploy/env.example /etc/mikipierniki.env && sudo chmod 600 /etc/mikipierniki.env && sudo nano /etc/mikipierniki.env

# usługi
sudo cp deploy/systemd/* /etc/systemd/system/
sudo install -m 755 -o mikipierniki deploy/backup.sh /srv/mikipierniki/backup.sh
sudo systemctl daemon-reload
sudo systemctl enable mikipierniki mikipierniki-cron.timer mikipierniki-backup.timer

# nginx + certyfikat (najpierw rekordy A w OVH, patrz niżej)
sudo cp deploy/nginx/mikipierniki.pl.conf /etc/nginx/sites-available/ && sudo ln -s ../sites-available/mikipierniki.pl.conf /etc/nginx/sites-enabled/
sudo mkdir -p /var/www/letsencrypt && sudo certbot certonly --webroot -w /var/www/letsencrypt -d mikipierniki.pl -d www.mikipierniki.pl
sudo nginx -t && sudo systemctl reload nginx
```

Pierwsze wydanie wgrywa GitHub Action (`.github/workflows/deploy.yml`) po pushu na `main`.
Sekrety w repozytorium: `DEPLOY_HOST`, `DEPLOY_USER` (`mikipierniki`), `DEPLOY_SSH_KEY`
(klucz prywatny, osobny tylko do deployu), `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan <host>`).
Zaraz po pierwszym wydaniu: `sudo systemctl start mikipierniki-cron.timer mikipierniki-backup.timer`.

## 2. Poczta: warsztaty@mikipierniki.pl

- Załóż skrzynkę `warsztaty@mikipierniki.pl` w serwerze pocztowym na VPS. Z niej wychodzą
  wszystkie maile ze strony i do niej wracają odpowiedzi uczestników.
- `SMTP_HOST` to nazwa, na którą wystawiony jest certyfikat serwera pocztowego (np. `mail.mikipierniki.pl`),
  port 587, login i hasło tej skrzynki.
- Sprawdź, czy rekord SPF obejmuje IP VPS i czy domena ma DKIM. Jeśli brakuje DKIM albo DMARC,
  Gmail może odkładać maile do spamu. **Istniejących rekordów MX/SPF/DKIM/DMARC w OVH nie zmieniaj
  bez sprawdzenia, czego używa poczta.**
- Test: zapisz się na powiadomienia na stronie i sprawdź wynik na mail-tester.com
  (wyślij do adresu, który poda serwis).

## 3. DNS w OVH

Tylko dwa rekordy A (i AAAA, jeśli VPS ma IPv6): `mikipierniki.pl` i `www` → IP VPS.
Najpierw obniż TTL, potem zmień. Rekordów pocztowych nie ruszaj.

## Codzienna obsługa

```sh
journalctl -u mikipierniki -f                 # logi serwera (błędy wysyłki maili też)
sudo systemctl restart mikipierniki
sqlite3 /var/lib/mikipierniki/mikipierniki.sqlite "select status, count(*) from outbox group by 1"
ln -sfn /srv/mikipierniki/releases/<poprzedni> /srv/mikipierniki/current && sudo systemctl restart mikipierniki   # cofnięcie wydania
```

Kopie bazy leżą na tym samym dysku. Raz na jakiś czas (albo automatycznie) ściągnij je
na inny komputer, np. `rsync -a mikipierniki@<host>:/var/lib/mikipierniki/backups/ ~/kopie-mikipierniki/`.
