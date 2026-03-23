const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

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

  // Crea tabella apps se non esiste
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

  // Crea tabella feedback se non esiste
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

// ===== API APPS =====
app.get('/api/apps', (req, res) => {
  db.all('SELECT * FROM apps ORDER BY createdAt DESC', (err, rows) => {
    if (err) {
      console.error('Query /api/apps error:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log(`Recuperate ${rows ? rows.length : 0} app`);
    res.json(rows || []);
  });
});

app.get('/api/apps/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM apps WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error(`Query /api/apps/${id} error:`, err);
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'App non trovata' });
      return;
    }
    res.json(row);
  });
});

app.post('/api/apps', (req, res) => {
  try {
    const { name, type, description, version, downloadUrl, imageUrl } = req.body;
    
    console.log('POST /api/apps:', { name, type });

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
        console.log('App aggiunta con ID:', this.lastID);
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
    console.log('App eliminata, ID:', id);
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
    
    console.log('POST /api/feedback:', { name, email });

    if (!name || !email || !message) {
      res.status(400).json({ error: 'Nome, email e messaggio sono obbligatori' });
      return;
    }

    // Validazione email semplice
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
        console.log('Feedback aggiunto con ID:', this.lastID);
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
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM ricevuto, chiusura...');
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
