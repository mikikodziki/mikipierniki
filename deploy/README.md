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
wraca poprzednie wydanie. Po restarcie deploy zatrzymuje procesy aplikacji uruchomione przed nim: LiteSpeed odpala
nowe, ale stare dalej odbierają część zapytań ze starym kodem (jeden przeżył dwa wdrożenia). Gdy wdrożenie się nie uda, a następny push zmienia tylko dokumentację,
nic się samo nie powtórzy: uruchom je ręcznie (Actions → Deploy → Run workflow). Ustawienia repozytorium (Settings → Secrets and variables → Actions):

- sekrety: `DEPLOY_SSH_KEY` (klucz prywatny tylko do wdrożeń; publiczny w DirectAdmin → Klucze SSH),
  `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan -p <port> <host>`),
  oraz `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER` (też jako sekrety, bo logi publicznego repo nie maskują zwykłych zmiennych).

## Statystyki odwiedzin

Zakładka „Statystyki” w panelu (opis i uzasadnienie: `docs/analityka.md`). Odsłony liczy
`start.mjs`. Startuje on serwer Astro sam, z `ASTRO_NODE_AUTOSTART=disabled`, i podpina się pod
jego zapytania. Strony zbudowane z góry nie przechodzą przez middleware Astro, więc to jedyne
miejsce, gdzie widać każde wejście. Notatki o wejściach trafiają do bufora w pamięci, a co minutę
`src/server/stats.ts` zamienia je na dzienne sumy w bazie. Bez IP, bez identyfikatorów, bez
skryptów w przeglądarce.

- Wycofanie wydania przywraca tylko `dist/`, a `start.mjs` zostaje nowy. Dlatego `start.mjs` musi
  działać też ze starszym buildem: wtedy po prostu nic nie liczy.
- Odsłona liczy się tylko wtedy, gdy przeglądarka wysłała `Sec-Fetch-Dest: document` i
  `Sec-Fetch-Mode: navigate`. **Po pierwszym wdrożeniu** otwórz stronę z telefonu, potem
  zakładkę „Statystyki”. „Ostatnie zliczone wejście” powinno pokazać tę chwilę. Jeśli nie, to
  LiteSpeed nie przekazuje tych nagłówków do Node.
- Jeśli kiedyś LiteSpeed ma sam wydawać pliki z `dist/client`, to tylko zasoby (`/_astro`,
  `/fonts`, `/zdjecia`), nie HTML, bo inaczej odwiedziny przestaną się liczyć.

## Nagłówki i pamięć przeglądarki

Też w `start.mjs`, dla każdej odpowiedzi:

- **Bezpieczeństwo:**
  - HSTS na 30 dni;
  - `nosniff`;
  - zakaz pokazywania strony w ramce na innej stronie (`X-Frame-Options` i `frame-ancestors`);
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `Permissions-Policy` bez kamery, mikrofonu i lokalizacji.

  Middleware może nadpisać każdy z nich, bo nagłówek Astro wygrywa. Tak strony z linków w mailach
  dostają `same-origin`.
- **HSTS:** podnieś do roku (`max-age=31536000`) dopiero po pierwszym udanym automatycznym
  odnowieniu certyfikatu, czyli ok. stycznia 2027. Przeglądarka pamięta HSTS do końca podanego
  czasu i nowe wdrożenie tego nie cofnie.
- **Pamięć przeglądarki:** fonty z `/fonts` są trzymane rok, zdjęcia z `/zdjecia` tydzień. Pliki
  w `/_astro` mają hash w nazwie, więc Astro i tak daje im rok.
  - Zmieniony font musi dostać nową nazwę pliku.
  - Zdjęcie podmienione pod tą samą nazwą pokaże się u odwiedzających najpóźniej po tygodniu.

## Codzienna obsługa

```sh
tail -f ~/mikipierniki/stderr.log                     # błędy (też wysyłki maili)
cloudlinux-selector restart --json --interpreter nodejs --app-root mikipierniki
pkill -u "$(id -u)" -f "^lsnode:$HOME/mikipierniki/"  # po restarcie: stare procesy; nowe wstaną przy następnym wejściu
sqlite3 ~/mikipierniki-data/mikipierniki.sqlite "select status, count(*) from outbox group by 1"
# cofnięcie wydania:
cd ~/mikipierniki && mv dist dist.bad && mv dist.prev dist && cloudlinux-selector restart --json --interpreter nodejs --app-root mikipierniki
pkill -u "$(id -u)" -f "^lsnode:$HOME/mikipierniki/"
```

## Kopie bazy w S3

Co noc o 3:30 `backup.sh` robi kopię bazy (`sqlite3 .backup`) i sprawdza ją (`integrity_check`).
Kopia zostaje na serwerze, a spakowana trafia do S3 jako `db-RRRR-MM-DD-GGMM-<losowe>.sqlite.gz`.
Wynik każdej nocy jest w `~/mikipierniki-data/backup.log`. Panel pokazuje go w zakładce „Kopie”
i ostrzega paskiem na każdej stronie, gdy najnowsza kopia ma ponad dobę albo nie trafiła do S3.
Wtedy aplikacja wysyła też maila na `MAIL_NOTIFY` i osobno na `MAIL_ADMIN` (raz na każdy problem).

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

## Przywracanie kopii

Z panelu: Kopie → „Przywróć…”. Przycisk tylko wysyła jednorazowy link (ważny 30 minut) na
`MAIL_ADMIN`; bez tego ustawienia przycisku nie ma. Strona z linku (za hasłem panelu) pokazuje, co
zniknie i co wróci, a bazę zmienia dopiero po wpisaniu daty kopii. Szczegóły w `src/server/restore.ts`:

- wracają terminy, rezerwacje i chętni. Wysłane maile, powiadomienia (zgody i wypisy), zapytania
  i statystyki zostają jak teraz. Przypomnienia wysłane i „Pasuje mi” wycofane po kopii się nie cofają;
  terminy odwołane i rezerwacje anulowane, opłacone albo przeniesione po kopii wracają do stanu z kopii
  (strona potwierdzenia je wypisuje),
- obecny stan zapisuje się jako `backups/db-przed-przywroceniem-….sqlite` (też znika po 30 dniach)
  i można go przywrócić tak samo, czyli cofnąć przywrócenie,
- plik bazy nie jest podmieniany, bo na seohost działa naraz kilka procesów aplikacji; kopia
  zastępuje tabele w jednej transakcji.

Kopia z S3 (na laptopie z `aws login --profile mikusia`): pobierz ją, wgraj do `backups/` jako
`db-RRRR-MM-DD.sqlite` z dniem z jej nazwy w S3 (`db-RRRR-MM-DD-GGMM-….sqlite.gz`) i przywróć z panelu.
Panel pokaże ją pod tym dniem, bez godziny, i tę datę trzeba wpisać. Jeśli kopia z tego dnia wciąż jest
w `backups/`, to ta sama noc i nie trzeba nic pobierać.

```sh
aws s3 ls s3://<bucket>/ --recursive --profile mikusia
aws s3 cp s3://<bucket>/<ścieżka>/db-….sqlite.gz - --profile mikusia | gunzip > db-RRRR-MM-DD.sqlite
sqlite3 db-RRRR-MM-DD.sqlite "PRAGMA integrity_check"
rsync db-RRRR-MM-DD.sqlite mikipierniki:mikipierniki-data/backups/
```

Tylko gdy aplikacja w ogóle nie startuje: zatrzymaj ją, podmień `mikipierniki.sqlite`, usuń
`mikipierniki.sqlite-wal` i `-shm`, uruchom. Wtedy przypomnienia i maile czekające w kopii mogą pójść
drugi raz, a wypisy z powiadomień zrobione po kopii się cofną, więc sprawdź to w panelu.

```sh
cloudlinux-selector stop --json --interpreter nodejs --app-root mikipierniki
cloudlinux-selector start --json --interpreter nodejs --app-root mikipierniki
```

## Warto wiedzieć

- Za LiteSpeedem aplikacja widzi adres jako `http://`, więc formularze przechodzą tylko z
  `https://mikipierniki.pl` (stała `site` w `astro.config.mjs`). Stąd przekierowanie z `www`.
- Ochrona przed botami na serwerze odpowiada 429 klientom wyglądającym na skrypty (np. `curl`
  z zewnątrz). Przeglądarki i zapytania z samego serwera (cron, deploy) przechodzą.
