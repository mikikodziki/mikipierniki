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
~/mikipierniki-data/backups/         nocne kopie, 30 dni
~/mikipierniki-data/cron.sh, backup.sh    skrypty z crontaba (kopie z deploy/)
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
4. **Cron i kopie:** skopiuj `deploy/cron.sh` i `deploy/backup.sh` do `~/mikipierniki-data/`
   (`chmod 700`) i dopisz do `crontab -e`:
   ```
   */5 * * * * $HOME/mikipierniki-data/cron.sh
   30 3 * * * $HOME/mikipierniki-data/backup.sh
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

Każdy push na `main` uruchamia `.github/workflows/deploy.yml`: build, test E2E, wgranie do
`~/mikipierniki/dist.next`, podmiana i restart, sprawdzenie `/warsztaty`. Jeśli strona nie odpowie,
wraca poprzednie wydanie. Ustawienia repozytorium (Settings → Secrets and variables → Actions):

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

Kopie bazy leżą na tym samym koncie. Raz na jakiś czas ściągnij je na inny komputer:
`rsync -a <ssh>:mikipierniki-data/backups/ ~/kopie-mikipierniki/`.

## Warto wiedzieć

- Za LiteSpeedem aplikacja widzi adres jako `http://`, więc formularze przechodzą tylko z
  `https://mikipierniki.pl` (stała `site` w `astro.config.mjs`). Stąd przekierowanie z `www`.
- Ochrona przed botami na serwerze odpowiada 429 klientom wyglądającym na skrypty (np. `curl`
  z zewnątrz). Przeglądarki i zapytania z samego serwera (cron, deploy) przechodzą.
