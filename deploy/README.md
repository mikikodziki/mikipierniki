# Wdrożenie na seohost (hosting z DirectAdmin)

Strona działa jako „Node.js App” (CloudLinux) za serwerem LiteSpeed na hostingu współdzielonym
seohost. LiteSpeed uruchamia `start.mjs`, który wczytuje ustawienia i startuje serwer Astro
(`dist/server/entry.mjs`). Ten sam proces serwuje strony statyczne, `/`, `/warsztaty`, formularze
(`/api/*`) i panel (`/panel`). Dane są w jednym pliku SQLite. Poczta `@mikipierniki.pl` jest na tym
samym hostingu, a DNS domeny w OVH.

```
~/mikipierniki/                      aplikacja: dist/, start.mjs, package*.json,
                                     node_modules -> ~/nodevenv/mikipierniki/24/lib/node_modules
~/mikipierniki/dist.prev/            poprzednie wydanie (do cofnięcia)
~/mikipierniki/stderr.log            błędy aplikacji
~/mikipierniki-data/.env             hasła i ustawienia, chmod 600 (wzór: deploy/env.example)
~/mikipierniki-data/mikipierniki.sqlite   baza
~/mikipierniki-data/backups/         nocne kopie, 30 dni (druga kopia w S3, niżej)
~/mikipierniki-data/backup.log       wynik każdej nocnej kopii
~/mikipierniki-data/backup.env       tajny adres do wysyłki kopii do S3, chmod 600
~/mikipierniki-data/cron.sh, backup.sh   skrypty z crontaba; wgrywa je deploy z deploy/
~/domains/mikipierniki.pl/public_html/.htaccess   konfiguracja aplikacji (pisze ją panel) + przekierowania
```

Adres serwera, port i użytkownika SSH podaje mail od seohost po włączeniu „Dostęp SSH”
(Panel Klienta → Serwery → usługa). Logowanie tylko kluczem, dodanym w DirectAdmin
(Funkcje zaawansowane → Klucze SSH).

## Jednorazowa konfiguracja (zrobiona 21.11.2026)

1. **DirectAdmin:** dodaj domenę `mikipierniki.pl`. Usuń z `public_html` domyślny `index.html`
   seohost, bo zasłania stronę główną. Załóż skrzynkę `mika@mikipierniki.pl`.
2. **Dane i ustawienia:**
   ```sh
   mkdir -p ~/mikipierniki-data/backups && chmod 700 ~/mikipierniki-data
   # ~/mikipierniki-data/.env według deploy/env.example, potem: chmod 600 ~/mikipierniki-data/.env
   ```
   Zmiennych środowiskowych nie ustawiaj w panelu „Node.js App”: panel wpisuje je do
   `public_html/.htaccess`. Hasła trzyma tylko `.env`.
3. **Aplikacja:** wgraj `dist/`, `package.json`, `package-lock.json` i `deploy/start.mjs`
   do `~/mikipierniki/`, potem:
   ```sh
   cloudlinux-selector create --json --interpreter nodejs --domain mikipierniki.pl \
     --app-root mikipierniki --app-uri / --version 24 --app-mode production --startup-file start.mjs
   cloudlinux-selector install-modules --json --interpreter nodejs --app-root mikipierniki
   cloudlinux-selector restart --json --interpreter nodejs --app-root mikipierniki
   ```
4. **Cron i kopie:** skrypty z `deploy/` wgrywa każdy deploy. Crontab ustaw z pliku i sprawdź
   `crontab -l`, bo `crontab -l | … | crontab -` potrafi go wyczyścić. Pod nagłówkiem
   DirectAdmina (`#direct_crons enabled`, `MAILTO=""`, `PATH=…`):
   ```
   30 3 * * * $HOME/mikipierniki-data/backup.sh
   */5 * * * * $HOME/mikipierniki-data/cron.sh
   ```
5. **Certyfikat:** DirectAdmin → Certyfikaty SSL/TLS. ACME (Let's Encrypt) wystawia i odnawia
   go sam, gdy domena wskazuje na serwer. Przekierowanie http → https robi serwer.
6. **`www` → bez `www`** (formularze działają tylko z `https://mikipierniki.pl`): na końcu
   `public_html/.htaccess`, poza blokami CloudLinux:
   ```
   RewriteEngine On
   RewriteCond %{HTTP_HOST} ^www\.mikipierniki\.pl$ [NC]
   RewriteRule ^ https://mikipierniki.pl%{REQUEST_URI} [R=301,L]
   ```

## DNS w OVH

Strefa zostaje w OVH (domena ma włączony DNSSEC). Rekordy:

| Subdomena | Typ | Wartość |
|---|---|---|
| `@`, `www`, `mail` | A | IP serwera seohost |
| `@` | MX | `10 mail.mikipierniki.pl.` |
| `@` | TXT | SPF z DirectAdmin (Zarządzanie DNS) |
| `x._domainkey` | TXT | DKIM z DirectAdmin (Zarządzanie DNS) |
| `_dmarc` | TXT | `v=DMARC1; p=none` (po teście poczty można zaostrzyć) |

## Wydania

Każdy push na `main` (poza zmianami samej dokumentacji: `docs/`, pliki `.md`) uruchamia
`.github/workflows/deploy.yml`: build, test E2E, wgranie do
`~/mikipierniki/dist.next`, podmiana i restart, sprawdzenie `/warsztaty`. Jeśli strona nie odpowie,
wraca poprzednie wydanie. Gdy wdrożenie się nie uda, a następny push zmienia tylko dokumentację,
nic się samo nie powtórzy: uruchom je ręcznie (Actions → Deploy → Run workflow). Ustawienia repozytorium (Settings → Secrets and variables → Actions):

- sekrety: `DEPLOY_SSH_KEY` (klucz prywatny tylko do wdrożeń; publiczny w DirectAdmin → Klucze SSH),
  `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan -p <port> <host>`),
  oraz `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER` (też jako sekrety, bo logi publicznego repo nie maskują zwykłych zmiennych).

## Codzienna obsługa

```sh
tail -f ~/mikipierniki/stderr.log                     # błędy (też wysyłki maili)
cloudlinux-selector restart --json --interpreter nodejs --app-root mikipierniki
sqlite3 ~/mikipierniki-data/mikipierniki.sqlite "select status, count(*) from outbox group by 1"
# cofnięcie wydania:
cd ~/mikipierniki && mv dist dist.bad && mv dist.prev dist && cloudlinux-selector restart --json --interpreter nodejs --app-root mikipierniki
```

## Kopie bazy w S3

Co noc o 3:30 `backup.sh` robi kopię bazy (`sqlite3 .backup`) i sprawdza ją (`integrity_check`).
Kopia zostaje na serwerze, a spakowana trafia do S3 jako `db-RRRR-MM-DD-GGMM-<losowe>.sqlite.gz`.
Wynik każdej nocy jest w `~/mikipierniki-data/backup.log`.

- **Konto:** AWS mikusi, profil `mikusia`, region `eu-north-1` (Sztokholm). Bez dodatkowych
  użytkowników i ról IAM.
- **Bucket:**
  - publiczny dostęp zablokowany (Block Public Access), szyfrowanie SSE-S3, tylko HTTPS,
  - kopie znikają po 30 dniach (reguła cyklu życia). Polityka prywatności obiecuje do 35 dni.
- **Jak serwer wysyła bez klucza:** polityka bucketu pozwala tylko na `PutObject`, tylko z IP
  serwera seohost i tylko pod tajną ścieżką. Ścieżka jest w `backup.env`
  (`S3_URL=https://<bucket>.s3.eu-north-1.amazonaws.com/<ścieżka>`). Czytać, listować i kasować
  może tylko konto mikusi.
- **Ochrona przed nadpisaniem:** każda kopia ma losową końcówkę nazwy, której serwer nigdzie nie
  zapisuje. Ktoś, kto przejmie hosting, może dorzucić pliki, ale nie nadpisze istniejących.
- **Treść kopii:** `Content-MD5` sprawia, że S3 odrzuca uszkodzone pliki.
- **Gdy seohost zmieni IP serwera:** wysyłka zacznie się kończyć błędem `403` w `backup.log`.
  Trzeba wtedy poprawić IP w polityce bucketu.

Odtworzenie (na laptopie z `aws login --profile mikusia`):

```sh
aws s3 ls s3://<bucket>/ --recursive --profile mikusia
aws s3 cp s3://<bucket>/<ścieżka>/db-….sqlite.gz - --profile mikusia | gunzip > mikipierniki.sqlite
sqlite3 mikipierniki.sqlite "PRAGMA integrity_check"
# na serwerze: zatrzymaj aplikację, podmień plik, usuń mikipierniki.sqlite-wal i -shm, uruchom
cloudlinux-selector stop --json --interpreter nodejs --app-root mikipierniki
cloudlinux-selector start --json --interpreter nodejs --app-root mikipierniki
```

## Warto wiedzieć

- Za LiteSpeedem aplikacja widzi adres jako `http://`, więc formularze przechodzą tylko z
  `https://mikipierniki.pl` (stała `site` w `astro.config.mjs`). Stąd przekierowanie z `www`.
- Ochrona przed botami na serwerze odpowiada 429 klientom wyglądającym na skrypty (np. `curl`
  z zewnątrz). Przeglądarki i zapytania z samego serwera (cron, deploy) przechodzą.
