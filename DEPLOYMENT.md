# Sweet TV Deployment Guide (Render.com)

## 🚀 Render.com Setup i Frankfurt

### 1. PostgreSQL Database

1. Gå till Render.com Dashboard
2. Klicka "New +" → "PostgreSQL"
3. Konfigurera:
   - **Name:** sweet-tv-db
   - **Database:** sweet_tv
   - **User:** (auto-generated)
   - **Region:** Frankfurt (EU Central)
   - **Plan:** Starter ($7/month recommended)
4. Klicka "Create Database"
5. Vänta tills databasen är redo (tar ~2 minuter)
6. **Viktigt:** Kopiera "Internal Database URL" (använd denna, inte External)

### 2. Backend Web Service

1. Gå till Render.com Dashboard
2. Klicka "New +" → "Web Service"
3. Anslut ditt GitHub repo (comsweet/sweet-tv)
4. Konfigurera:
   - **Name:** sweet-tv-backend
   - **Region:** Frankfurt (EU Central)
   - **Branch:** main
   - **Root Directory:** backend
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Starter ($7/month)

#### Environment Variables

Lägg till dessa miljövariabler i Render.com:

```env
# Database
DATABASE_URL=<Internal Database URL från steg 1>

# Adversus API
ADVERSUS_API_KEY=<Din Adversus API key>
ADVERSUS_ACCOUNT_ID=<Ditt Adversus Account ID>

# JWT Secret (generera ett starkt random string)
JWT_SECRET=<ett långt random string, t.ex: openssl rand -base64 32>

# Node Environment
NODE_ENV=production
RENDER=true

# Server
PORT=5000

# Frontend URL (lägg till efter frontend är deployd)
FRONTEND_URL=https://sweet-tv-frontend.onrender.com

# Polling (optional)
POLL_INTERVAL=15000

# Legacy admin password (optional, for backward compatibility)
ADMIN_PASSWORD=<ditt gamla admin password om du vill behålla legacy login>
```

#### Persistent Disk Setup

⚠️ **VIKTIGT:** Du måste lägga till en Persistent Disk för att spara filer!

1. Gå till din Backend service i Render.com
2. Klicka på "Disks" i sidomenyn
3. Klicka "Add Disk"
4. Konfigurera:
   - **Name:** sweet-tv-storage
   - **Mount Path:** `/var/data`
   - **Size:** 1-10 GB (rekommenderat 5GB)
5. Klicka "Save"
6. Servern kommer att restarta automatiskt

### 3. Frontend Web Service

1. Gå till Render.com Dashboard
2. Klicka "New +" → "Static Site"
3. Anslut ditt GitHub repo (comsweet/sweet-tv)
4. Konfigurera:
   - **Name:** sweet-tv-frontend
   - **Region:** Frankfurt (EU Central)
   - **Branch:** main
   - **Root Directory:** frontend
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** dist

#### Environment Variables (Frontend)

```env
VITE_API_URL=https://sweet-tv-backend.onrender.com/api
```

### 4. Kör Database Migration

Efter att backend är deployd, kör migrations-scriptet:

**Metod 1: Via Render Shell**
1. Gå till din Backend service i Render.com
2. Klicka på "Shell" i top menu
3. Kör:
```bash
cd backend
node scripts/migrate-to-postgres.js
```

**Metod 2: Via Local Terminal (med DATABASE_URL)**
```bash
# Sätt DATABASE_URL från Render.com
export DATABASE_URL="<Internal Database URL>"

cd backend
node scripts/migrate-to-postgres.js
```

**Output ska visa:**
```
🔄 Starting migration...
✅ PostgreSQL connected successfully
✅ Database schema initialized
📄 Found X agents in file system
✅ Migrated agent: ...
👤 Creating superadmin user...
✅ Superadmin created: samir@sweet-communication.com
🔑 Temporary password: sweet2024
⚠️  CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN!
🎉 Migration completed successfully!
```

### 5. Första Inloggningen

1. Gå till `https://sweet-tv-frontend.onrender.com`
2. Logga in med:
   - **Email:** samir@sweet-communication.com
   - **Password:** sweet2024
3. **VIKTIGT:** Ändra ditt lösenord direkt via "Change Password"

## 🔒 Säkerhet

### Roller och Behörigheter

- **Superadmin:** Kan göra allt + hantera användare + se audit logs
- **Admin:** Kan hantera leaderboards, agents, thresholds osv (inte skapa användare)
- **TV-User:** Kan endast se slideshows (ingen admin-access)

### Audit Logging

Alla ändringar loggas automatiskt:
- Vem gjorde ändringen
- Vad ändrades
- När det hände
- IP-adress och user agent
- Loggar sparas i 7 dagar (konfigurerbart)

### API Rate Monitoring

Systemet loggar alla API-anrop och kan visa:
- Requests per endpoint
- Average response time
- Error rates
- Usage patterns

## 📊 Data Lagring

### PostgreSQL (DATABASE_URL)
- Users (autentisering)
- Agents (profildata)
- Audit logs
- API request metrics

### Persistent Disk (/var/data)
- Profile images
- Sound files
- Configuration files (thresholds osv)

### Minne (Cache)
- Deals cache (byggs från Adversus API)
- SMS cache (byggs från Adversus API)
- Campaign cache
- Leaderboard cache

## 🐛 Troubleshooting

### Servern startar inte

1. Kolla Render logs: `Logs` tab i service dashboard
2. Verifiera att DATABASE_URL är korrekt satt
3. Kolla att Persistent Disk är monterad på `/var/data`

### 404 på profilbildslänk

- **Orsak:** Agents finns inte i databasen
- **Fix:** Kör migrations-scriptet (se steg 4 ovan)

### "Database connection failed"

- **Orsak:** DATABASE_URL är inte satt eller felaktig
- **Fix:**
  1. Kopiera "Internal Database URL" från din Postgres service
  2. Lägg till som miljövariabel i Backend service
  3. Restarta service

### Deals/SMS syns inte

- **Normal:** Första gången tar det 15-30 sekunder att bygga cache
- **Om det fortsätter:**
  1. Kolla att ADVERSUS_API_KEY och ADVERSUS_ACCOUNT_ID är korrekta
  2. Kolla Render logs för API errors
  3. Verifiera Adversus API rate limits inte är överträffade

## 🔄 Updates & Maintenance

### Auto-Deploy
Render.com deployar automatiskt när du pushar till main branch på GitHub.

### Manual Deploy
1. Gå till service i Render.com
2. Klicka "Manual Deploy" → "Clear build cache & deploy"

### Database Backup
Render.com tar automatiska backups av PostgreSQL databasen varje dag.

## 📧 Support

Vid problem:
1. Kolla Render logs först
2. Verifiera alla miljövariabler
3. Kör migrations-scriptet igen om agents saknas
4. Kontakta Samir (samir@sweet-communication.com)

---

## 🎉 Nästa Steg

Efter deployment är klar:
1. ✅ Logga in och ändra ditt lösenord
2. ✅ Skapa andra admin-användare om behövs
3. ✅ Konfigurera leaderboards och thresholds
4. ✅ Testa slideshows på TVn
5. ✅ Kolla audit logs och API monitoring

Lycka till! 🚀
