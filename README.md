# Adversus TV Starter (pling + leaderboard)

En superenkel start för att få "pling" på TV när någon registrerar `Success` i Adversus,
utan Intramanager. Den här versionen använder polling via API (gratis).

## 1) Förutsättningar
- En server/dator med Docker installerat (Windows/Mac/Linux funkar).
- En webbläsare som visar TV-sidan (t.ex. en mini-PC kopplad till TV:n).
- Adversus API-uppgifter (read-only räcker). **Lägg aldrig riktiga uppgifter i Git.**

## 2) Kom igång (snabbstart)
```bash
# 1) Packa upp projektet
cd adversus-tv-starter

# 2) Skapa din .env från mallen
cp .env.example .env
# Öppna .env och fyll i ADV_BASE, ADV_USER, ADV_PASS

# 3) Starta
docker compose up --build
```

När servern kör:
- API & TV-sida: http://localhost:3000/tv.html
- Hälsokoll: http://localhost:3000/healthz

> Kör du på en server: byt `localhost` mot serverns IP/hostname, öppna brandväggen för port 3000 eller sätt en reverse proxy.

## 3) Testa utan Adversus (mock)
Öppna TV-sidan i en flik och kör sedan:
```bash
curl -X POST http://localhost:3000/dev/mock-success       -H "Content-Type: application/json"       -d '{"brand":"dentle","agentName":"Test Agent","commission":250,"deals":1}'
```
Du ska få pling + overlay.

## 4) Hur den hittar vem som sålde
- Först försöker den läsa `userId` på `Success`-posten.
- (Valfritt) Du kan bygga ut `resolveAgentFast` i `server.js` om ni har en endpoint som hämtar call/disposition nära `savedAt`.
- Sista utvägen kan vara att re-polla samma post efter ett par sekunder om ert fält uppdateras lite senare.

## 5) Leaderboard
- Den här startversionen visar bara pling.
- Lägg till endpoints i `server.js` som aggregerar "idag" och "denna månad" för Dentle/Sinfrid från de hämtade posterna.
- Bygg sedan ut `public/tv.html` så att den hämtar `/leaderboard` var 10–15:e sekund och renderar listor.

## 6) Profilbilder
- Hårdkoda en enkel JSON-mappning i `server.js` (userId -> URL) eller lägg det i en liten databas/Google Sheet.
- I TV-sidan visas bilden om `avatar` finns i eventet.

## 7) Säkerhet
- LÄGG INTE riktiga uppgifter i koden. Använd `.env`.
- Om du publicerar på internet: lägg en reverse proxy (Nginx/Caddy), ev. IP-allowlist för admin-URL:er.
- Roterar du ett lösen av misstag: byt det i Adversus.

## 8) Vanliga frågor
- **Det plingar inte:** Öppna `http://localhost:3000/healthz`. Kolla loggarna i terminalen. Testa mock-endpointen.
- **Vilken endpoint ska jag använda i Adversus?** Kolla er Swagger (paths för dispositions/calls och filtren `outcome/updatedSince`).
- **Kan jag sänka polling-tiden?** Ja. I `.env` finns `POLL_MS_DENTLE` och `POLL_MS_SINFRID`.

## 9) Nästa steg
- Lägg till `/leaderboard` i `server.js` som summerar `deals/commission` per agent för "idag" och "månad".
- Visa top-10 på TV (fyra rutor: Dentle/Sinfrid × Idag/Månad).
- Lägg in riktiga pling-ljud i `public/sounds/`.
