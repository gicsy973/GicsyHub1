const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;

// ADMIN PASSWORD (cambia questo!)
const ADMIN_PASSWORD = 'admin123';
const ADMIN_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'Password123'; // Password di default per reset

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '30d'; // 30 days default

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Funzioni di hashing password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Assicura che la directory dati esista
const dataDir = '/app/data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('Directory dati creata:', dataDir);
}

// Database setup
const dbPath = path.join(dataDir, 'catalog.db');
let db;

try {
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Database connection error:', err.message);
      process.exit(1);
    } else {
      console.log('Connesso al database SQLite in:', dbPath);
    }
  });

  db.configure('busyTimeout', 5000);

  // Crea tabella users
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Create users table error:', err);
    } else {
      console.log('Tabella users pronta');
    }
  });

  // Crea tabella apps
  db.run(`
    CREATE TABLE IF NOT EXISTS apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      version TEXT,
      downloadUrl TEXT,
      imageUrl TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Create apps table error:', err);
    } else {
      console.log('Tabella apps pronta');
    }
  });

  // Crea tabella feedback
  db.run(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Create feedback table error:', err);
    } else {
      console.log('Tabella feedback pronta');
    }
  });

  // Crea tabella per le licenze Android
  db.run(`
    CREATE TABLE IF NOT EXISTS android_licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      device_id TEXT NOT NULL,
      is_premium BOOLEAN DEFAULT 0,
      license_key TEXT UNIQUE,
      expiration_date DATETIME,
      activation_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Create android_licenses table error:', err);
    } else {
      console.log('Tabella android_licenses pronta');
    }
  });

  // Crea tabella per API keys
  db.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      name TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used DATETIME
    )
  `, (err) => {
    if (err) {
      console.error('Create api_keys table error:', err);
    } else {
      console.log('Tabella api_keys pronta');
    }
  });

} catch (err) {
  console.error('Database init error:', err);
  process.exit(1);
}

// ===== ANDROID LICENSE ROUTES =====

// Middleware: Validate API Key
async function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'Missing API key'
    });
  }

  db.get(
    'SELECT id, is_active FROM api_keys WHERE key = ?',
    [apiKey],
    (err, row) => {
      if (err || !row || !row.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Invalid or inactive API key'
        });
      }

      // Update last_used timestamp
      db.run(
        'UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = ?',
        [row.id]
      );

      req.apiKey = apiKey;
      next();
    }
  );
}

// POST /api/android/verify - Verify license and get JWT token
app.post('/api/android/verify', validateApiKey, (req, res) => {
  try {
    const { email, device_id } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    if (!device_id || typeof device_id !== 'string' || device_id.length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Invalid device_id'
      });
    }

    // Check or create license record
    db.get(
      'SELECT * FROM android_licenses WHERE email = ? AND device_id = ?',
      [email, device_id],
      (err, row) => {
        if (err) {
          console.error('License query error:', err);
          return res.status(500).json({
            success: false,
            message: 'Internal server error'
          });
        }

        // If no record, create one (non-premium)
        if (!row) {
          db.run(
            'INSERT INTO android_licenses (email, device_id, is_premium) VALUES (?, ?, ?)',
            [email, device_id, 0],
            (err) => {
              if (err) {
                console.error('Insert error:', err);
                return res.status(500).json({
                  success: false,
                  message: 'Internal server error'
                });
              }

              return res.status(401).json({
                success: false,
                message: 'No license found for this user',
                is_premium: false,
                token: null
              });
            }
          );
          return;
        }

        // Check if premium and not expired
        if (!row.is_premium) {
          return res.json({
            success: false,
            message: 'User is not premium',
            is_premium: false,
            token: null
          });
        }

        if (row.expiration_date && new Date(row.expiration_date) < new Date()) {
          return res.json({
            success: false,
            message: 'License expired',
            is_premium: false,
            token: null,
            expired_at: row.expiration_date
          });
        }

        // Generate JWT token
        const token = jwt.sign({
          email: email,
          device_id: device_id,
          is_premium: true,
          license_id: row.id,
          expiration_date: row.expiration_date
        }, JWT_SECRET, {
          expiresIn: JWT_EXPIRY,
          algorithm: 'HS256'
        });

        return res.json({
          success: true,
          message: 'License verified successfully',
          is_premium: true,
          token: token,
          expiration_date: row.expiration_date,
          activation_date: row.activation_date
        });
      }
    );
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /api/android/validate-token - Validate JWT token
app.post('/api/android/validate-token', (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token required'
      });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256']
      });

      res.json({
        success: true,
        message: 'Token is valid',
        is_premium: decoded.is_premium,
        email: decoded.email,
        exp: decoded.exp
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /api/android/admin/activate-license - Activate premium license
app.post('/api/android/admin/activate-license', validateApiKey, (req, res) => {
  try {
    const { email, device_id, days_valid = 365 } = req.body;

    if (!email || !device_id) {
      return res.status(400).json({
        success: false,
        message: 'Email and device_id required'
      });
    }

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + days_valid);
    const licenseKey = 'LIC-' + crypto.randomBytes(12).toString('hex').toUpperCase();

    db.run(
      `INSERT INTO android_licenses (email, device_id, is_premium, license_key, expiration_date)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
       is_premium=1, license_key=?, expiration_date=?, updated_at=CURRENT_TIMESTAMP`,
      [email, device_id, 1, licenseKey, expirationDate.toISOString(), licenseKey, expirationDate.toISOString()],
      function(err) {
        if (err) {
          console.error('Activation error:', err);
          return res.status(500).json({
            success: false,
            message: 'Internal server error'
          });
        }

        res.json({
          success: true,
          message: 'License activated',
          license_key: licenseKey,
          expiration_date: expirationDate.toISOString()
        });
      }
    );
  } catch (error) {
    console.error('Activation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// ===== AUTH ROUTES =====
app.post('/api/auth/signup', (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    if (!username || !email || !password || !confirmPassword) {
      res.status(400).json({ error: 'Tutti i campi sono obbligatori' });
      return;
    }

    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Le password non coincidono' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'La password deve avere almeno 6 caratteri' });
      return;
    }

    const hashedPassword = hashPassword(password);

    db.run(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            res.status(400).json({ error: 'Username o email già registrati' });
          } else {
            console.error('Signup error:', err);
            res.status(500).json({ error: 'Errore nella registrazione' });
          }
          return;
        }
        console.log('Nuovo utente registrato:', username);
        res.json({ id: this.lastID, message: 'Registrazione completata! Effettua il login.' });
      }
    );
  } catch (err) {
    console.error('POST /api/auth/signup exception:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username e password obbligatori' });
      return;
    }

    // Controlla se è admin
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const token = crypto.randomBytes(32).toString('hex');
      console.log('Admin login successful');
      res.json({ 
        id: 0, 
        username: ADMIN_USERNAME, 
        email: 'admin@gicsyhub.local',
        token: token,
        isAdmin: true,
        message: 'Login admin completato!' 
      });
      return;
    }

    const hashedPassword = hashPassword(password);

    db.get(
      'SELECT id, username, email FROM users WHERE username = ? AND password = ?',
      [username, hashedPassword],
      (err, row) => {
        if (err) {
          console.error('Login query error:', err);
          res.status(500).json({ error: 'Errore nel login' });
          return;
        }

        if (!row) {
          res.status(401).json({ error: 'Username o password errati' });
          return;
        }

        const token = crypto.randomBytes(32).toString('hex');
        console.log('Login successful:', username);
        res.json({ 
          id: row.id, 
          username: row.username, 
          email: row.email,
          token: token,
          isAdmin: false,
          message: 'Login completato!' 
        });
      }
    );
  } catch (err) {
    console.error('POST /api/auth/login exception:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== ADMIN ROUTES =====
app.get('/api/admin/users', (req, res) => {
  const { username, isAdmin } = req.query;

  if (username !== ADMIN_USERNAME || isAdmin !== 'true') {
    res.status(403).json({ error: 'Accesso negato' });
    return;
  }

  db.all(
    'SELECT id, username, email, createdAt FROM users ORDER BY createdAt DESC',
    (err, rows) => {
      if (err) {
        console.error('Query admin/users error:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows || []);
    }
  );
});

app.post('/api/admin/reset-password', (req, res) => {
  const { username, isAdmin, userId } = req.body;

  if (username !== ADMIN_USERNAME || isAdmin !== 'true') {
    res.status(403).json({ error: 'Accesso negato' });
    return;
  }

  if (!userId) {
    res.status(400).json({ error: 'ID utente obbligatorio' });
    return;
  }

  const hashedPassword = hashPassword(DEFAULT_PASSWORD);

  db.run(
    'UPDATE users SET password = ? WHERE id = ?',
    [hashedPassword, userId],
    function(err) {
      if (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      if (this.changes === 0) {
        res.status(404).json({ error: 'Utente non trovato' });
        return;
      }

      console.log('Password resettata per utente ID:', userId);
      res.json({ 
        message: `Password resettata a: ${DEFAULT_PASSWORD}`,
        newPassword: DEFAULT_PASSWORD
      });
    }
  );
});

app.get('/api/admin/stats', (req, res) => {
  const { username, isAdmin } = req.query;

  if (username !== ADMIN_USERNAME || isAdmin !== 'true') {
    res.status(403).json({ error: 'Accesso negato' });
    return;
  }

  Promise.all([
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        resolve(err ? 0 : row.count);
      });
    }),
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM apps', (err, row) => {
        resolve(err ? 0 : row.count);
      });
    }),
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM feedback', (err, row) => {
        resolve(err ? 0 : row.count);
      });
    })
  ]).then(([usersCount, appsCount, feedbackCount]) => {
    res.json({
      totalUsers: usersCount,
      totalApps: appsCount,
      totalFeedback: feedbackCount
    });
  });
});

// ===== API APPS =====
app.get('/api/apps', (req, res) => {
  db.all('SELECT * FROM apps ORDER BY createdAt DESC', (err, rows) => {
    if (err) {
      console.error('Query /api/apps error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows || []);
  });
});

app.post('/api/apps', (req, res) => {
  try {
    const { name, type, description, version, downloadUrl, imageUrl } = req.body;
    
    if (!name || !type) {
      res.status(400).json({ error: 'Nome e tipo sono obbligatori' });
      return;
    }

    db.run(
      'INSERT INTO apps (name, type, description, version, downloadUrl, imageUrl) VALUES (?, ?, ?, ?, ?, ?)',
      [name, type, description || '', version || '', downloadUrl || '', imageUrl || ''],
      function(err) {
        if (err) {
          console.error('Insert error:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ id: this.lastID, message: 'App aggiunta con successo' });
      }
    );
  } catch (err) {
    console.error('POST /api/apps exception:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/apps/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM apps WHERE id = ?', [id], function(err) {
    if (err) {
      console.error(`Delete /api/apps/${id} error:`, err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'App eliminata' });
  });
});

// ===== API FEEDBACK =====
app.get('/api/feedback', (req, res) => {
  db.all('SELECT id, name, email, message, createdAt FROM feedback ORDER BY createdAt DESC LIMIT 50', (err, rows) => {
    if (err) {
      console.error('Query /api/feedback error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows || []);
  });
});

app.post('/api/feedback', (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    if (!name || !email || !message) {
      res.status(400).json({ error: 'Nome, email e messaggio sono obbligatori' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'Email non valida' });
      return;
    }

    db.run(
      'INSERT INTO feedback (name, email, message) VALUES (?, ?, ?)',
      [name, email, message],
      function(err) {
        if (err) {
          console.error('Feedback insert error:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ id: this.lastID, message: 'Grazie per il tuo feedback!' });
      }
    );
  } catch (err) {
    console.error('POST /api/feedback exception:', err);
    res.status(500).json({ error: err.message });
  }
});

// Static files
app.use(express.static('public'));

// Root route
app.get('/', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } catch (err) {
    console.error('GET / error:', err);
    res.status(500).send('Errore nel caricamento della pagina');
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.path);
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Errore interno del server' });
});

const server = app.listen(PORT, () => {
  console.log(`Server in esecuzione su http://localhost:${PORT}`);
  console.log(`Admin credentials - Username: ${ADMIN_USERNAME}, Password: ${ADMIN_PASSWORD}`);
  console.log(`API endpoints disponibili:`);
  console.log(`  POST /api/android/verify - Verifica licenza Android`);
  console.log(`  POST /api/android/validate-token - Valida token JWT`);
  console.log(`  POST /api/android/admin/activate-license - Attiva licenza (admin)`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM ricevuto, chiusura...');
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
