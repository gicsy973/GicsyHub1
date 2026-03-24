const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// ADMIN PASSWORD (cambia questo!)
const ADMIN_PASSWORD = 'admin123';
const ADMIN_USERNAME = 'admin';

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
} catch (err) {
  console.error('Database init error:', err);
  process.exit(1);
}

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
        email: 'admin@gicsy hub.local',
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
});

process.on('SIGTERM', () => {
  console.log('SIGTERM ricevuto, chiusura...');
  server.close(() => {
    db.close();
    process.exit(0);
  });
});

