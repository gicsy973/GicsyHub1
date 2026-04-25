# GicsyHub - Versione Integrata con Sistema di Licenza Android

Il tuo sito web **GicsyHub** ora include:

1. **Sito web completo** - Home, Gaming, Software, Feedback, Admin
2. **Sistema di licenza Android** - Verificazione licenze tramite JWT
3. **Autenticazione utenti** - Login/Signup con database SQLite
4. **Pannello Admin** - Gestione utenti e app

## Endpoint API

### 🌐 Web Site
- `GET /` - Pagina principale
- `POST /api/auth/login` - Login utente
- `POST /api/auth/signup` - Registrazione utente
- `POST /api/apps` - Aggiungi app (admin)
- `GET /api/apps` - Ottieni tutte le app
- `DELETE /api/apps/:id` - Elimina app (admin)
- `POST /api/feedback` - Invia feedback
- `GET /api/feedback` - Ottieni feedback
- `GET /api/admin/stats` - Statistiche (admin)
- `GET /api/admin/users` - Lista utenti (admin)

### 📱 Android License
- `POST /api/android/verify` - Verifica licenza app Android
- `POST /api/android/validate-token` - Valida JWT token
- `POST /api/android/admin/activate-license` - Attiva licenza premium

## Configurazione

### 1. Variabili d'ambiente (.env)
```bash
cp .env.example .env
# Modifica i valori:
# JWT_SECRET = chiave forte (min 32 caratteri)
# DEFAULT_API_KEY = chiave API per app Android
# ADMIN_PASSWORD = password admin (default: admin123)
```

### 2. Sviluppo locale
```bash
npm install
npm start
# Server su http://localhost:3000
```

### 3. Docker (Produzione)
```bash
docker-compose up -d
# Accedi a https://gicsyhub1.onrender.com
```

## Utilizzo Android

### Verifica licenza all'avvio app
```kotlin
val apiKey = "dev-api-key-change-in-production"
val email = "user@example.com"
val deviceId = android.provider.Settings.Secure.getString(
    contentResolver,
    android.provider.Settings.Secure.ANDROID_ID
)

val client = OkHttpClient()
val json = """{"email": "$email", "device_id": "$deviceId"}"""
val body = RequestBody.create(
    "application/json; charset=utf-8".toMediaType(),
    json
)

val request = Request.Builder()
    .url("https://gicsyhub1.onrender.com/api/android/verify")
    .addHeader("x-api-key", apiKey)
    .post(body)
    .build()

client.newCall(request).enqueue(object : Callback {
    override fun onResponse(call: Call, response: Response) {
        val json = JSONObject(response.body?.string() ?: "")
        if (json.getBoolean("success")) {
            val token = json.getString("token")
            // Salva token localmente
            saveToken(token)
            unlockFeatures()
        } else {
            lockFeatures()
        }
    }
    
    override fun onFailure(call: Call, e: IOException) {
        // Fallback: controlla token salvato localmente
        checkLocalToken()
    }
})
```

## Admin

**Username:** admin  
**Password:** admin123

⚠️ **CAMBIA SUBITO IN PRODUZIONE!**

Nel pannello admin puoi:
- Visualizzare statistiche (utenti, app, feedback)
- Gestire utenti (reset password)
- Aggiungere/eliminare app
- Verificare feedback

## Database

SQLite con tabelle:
- `users` - Utenti registrati
- `apps` - Applicazioni
- `feedback` - Commenti e feedback
- `android_licenses` - Licenze app Android
- `api_keys` - Chiavi API per accesso

## Sicurezza

✅ Password hashed (SHA-256)  
✅ JWT tokens per autenticazione  
✅ API key validation per Android  
✅ Rate limiting  
✅ CORS configurabile  
✅ Utente non-root in Docker  

⚠️ TODO:
- Cambiar JWT_SECRET e DEFAULT_API_KEY
- Configurare HTTPS/SSL
- Abilitare rate limiting più stringente
- Implementare email verification
- Backup database automatico

## Deploy su Render

1. Connetti repository GitHub
2. Crea New Web Service
3. Seleziona repository
4. Build command: `npm install`
5. Start command: `npm start`
6. Aggiungi variabili d'ambiente (.env)
7. Deploy!

Il sito sarà live su https://gicsyhub1.onrender.com

## Troubleshooting

### Errore "Invalid API key"
- Verifica che `x-api-key` header sia incluso
- Controlla il valore di `DEFAULT_API_KEY` in .env

### Token expired
- L'app Android deve richiedere un nuovo token
- Verifica che `JWT_EXPIRY` sia configurato

### Database locked
- Riavvia il server: `docker restart gicsyhub-app`
- Verifica i permessi di `/app/data`

### CORS error
- Configura `ALLOWED_ORIGINS` per i domini del frontend

## Supporto

Per problemi o domande:
- GitHub Issues
- Email: info@example.com
- Twitter: @gicsy

---

**Versione:** 2.0.0  
**Ultimo aggiornamento:** Aprile 2026
