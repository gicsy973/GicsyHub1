let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  loadApps();
  loadFeedback();
  checkAuth();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('signup-form').addEventListener('submit', handleSignup);
  document.getElementById('app-form').addEventListener('submit', handleAddApp);
  document.getElementById('feedback-form').addEventListener('submit', handleFeedback);
}

// ===== AUTH =====

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      currentUser = data;
      localStorage.setItem('user', JSON.stringify(data));
      updateAuthUI();
      showSection('home');
      document.getElementById('login-form').reset();
      errorDiv.textContent = '';
    } else {
      errorDiv.textContent = data.error || 'Errore nel login';
    }
  } catch (error) {
    console.error('Login error:', error);
    errorDiv.textContent = 'Errore di connessione';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const username = document.getElementById('signup-username').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const confirmPassword = document.getElementById('signup-confirm').value;
  const errorDiv = document.getElementById('signup-error');

  try {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, confirmPassword })
    });

    const data = await response.json();

    if (response.ok) {
      errorDiv.textContent = '';
      alert('Registrazione completata! Effettua il login.');
      document.getElementById('signup-form').reset();
      showSection('login');
    } else {
      errorDiv.textContent = data.error || 'Errore nella registrazione';
    }
  } catch (error) {
    console.error('Signup error:', error);
    errorDiv.textContent = 'Errore di connessione';
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem('user');
  updateAuthUI();
  showSection('home');
}

function checkAuth() {
  const saved = localStorage.getItem('user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      updateAuthUI();
    } catch (e) {
      localStorage.removeItem('user');
    }
  }
}

function updateAuthUI() {
  const authButtons = document.getElementById('auth-buttons');
  const userMenu = document.getElementById('user-menu');

  if (currentUser) {
    authButtons.style.display = 'none';
    userMenu.style.display = 'flex';
    document.getElementById('user-display').textContent = `👤 ${currentUser.username}`;
  } else {
    authButtons.style.display = 'flex';
    userMenu.style.display = 'none';
  }
}

// ===== APPS =====

async function handleAddApp(e) {
  e.preventDefault();
  
  if (!currentUser) {
    alert('Devi effettuare il login per aggiungere app!');
    showSection('login');
    return;
  }

  const app = {
    name: document.getElementById('name').value,
    type: document.getElementById('type').value,
    description: document.getElementById('description').value,
    version: document.getElementById('version').value,
    downloadUrl: document.getElementById('downloadUrl').value,
    imageUrl: document.getElementById('imageUrl').value
  };

  try {
    const response = await fetch('/api/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(app)
    });

    if (response.ok) {
      closeModal();
      document.getElementById('app-form').reset();
      loadApps();
    } else {
      alert('Errore nell\'aggiunta del progetto');
    }
  } catch (error) {
    console.error('Errore:', error);
    alert('Errore di connessione');
  }
}

async function loadApps() {
  try {
    const response = await fetch('/api/apps');
    const apps = await response.json();
    
    const games = apps.filter(app => app.type === 'Gioco');
    const software = apps.filter(app => app.type === 'Software');
    
    renderApps(games, 'gaming-grid');
    renderApps(software, 'software-grid');
  } catch (error) {
    console.error('Errore nel caricamento:', error);
  }
}

function renderApps(apps, gridId) {
  const grid = document.getElementById(gridId);
  grid.innerHTML = '';

  if (apps.length === 0) {
    grid.innerHTML = '<div class="empty-message">Nessun progetto in questa categoria. Aggiungi il primo! 🚀</div>';
    return;
  }

  apps.forEach(app => {
    const card = document.createElement('div');
    card.className = 'app-card';
    
    let downloadButton = '';
    if (app.downloadUrl) {
      if (currentUser) {
        downloadButton = `<a href="${app.downloadUrl}" target="_blank" class="btn-download">⬇️ Scarica</a>`;
      } else {
        downloadButton = `<button class="btn-download" onclick="loginPrompt()">⬇️ Scarica (Login)</button>`;
      }
    } else {
      downloadButton = '<button class="btn-download" disabled>⬇️ Link</button>';
    }

    card.innerHTML = `
      <div class="app-image">
        ${app.imageUrl ? `<img src="${app.imageUrl}" alt="${app.name}">` : (app.type === 'Gioco' ? '🎮' : '💻')}
      </div>
      <div class="app-info">
        <span class="app-type">${app.type === 'Gioco' ? '🎮 Gioco' : '💻 Software'}</span>
        <h3>${app.name}</h3>
        <p>${app.description || 'Nessuna descrizione'}</p>
        ${app.version ? `<div class="app-version">v${app.version}</div>` : ''}
        <div class="app-actions">
          ${downloadButton}
          ${currentUser ? `<button class="btn-delete" onclick="deleteApp(${app.id})">🗑️ Elimina</button>` : ''}
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function loginPrompt() {
  alert('Devi effettuare il login per scaricare!');
  showSection('login');
}

async function deleteApp(id) {
  if (!currentUser) {
    alert('Devi effettuare il login!');
    return;
  }

  if (confirm('Sei sicuro di voler eliminare questo progetto?')) {
    try {
      const response = await fetch(`/api/apps/${id}`, { method: 'DELETE' });
      if (response.ok) {
        loadApps();
      }
    } catch (error) {
      console.error('Errore:', error);
    }
  }
}

function openModal() {
  if (!currentUser) {
    alert('Devi effettuare il login per aggiungere app!');
    showSection('login');
    return;
  }
  document.getElementById('modal').classList.add('show');
}

function closeModal() {
  document.getElementById('modal').classList.remove('show');
}

// ===== FEEDBACK =====

async function handleFeedback(e) {
  e.preventDefault();
  
  const feedbackData = {
    name: document.getElementById('feedback-name').value,
    email: document.getElementById('feedback-email').value,
    message: document.getElementById('feedback-message').value
  };

  const statusDiv = document.getElementById('feedback-status');
  
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedbackData)
    });

    if (response.ok) {
      statusDiv.textContent = '✓ Feedback inviato con successo! Grazie!';
      statusDiv.classList.add('success');
      statusDiv.classList.remove('error');
      
      document.getElementById('feedback-form').reset();
      loadFeedback();
      
      setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.classList.remove('success');
      }, 4000);
    } else {
      const error = await response.json();
      statusDiv.textContent = '✗ ' + (error.error || 'Errore nell\'invio');
      statusDiv.classList.add('error');
      statusDiv.classList.remove('success');
    }
  } catch (error) {
    console.error('Errore:', error);
    statusDiv.textContent = '✗ Errore di connessione';
    statusDiv.classList.add('error');
    statusDiv.classList.remove('success');
  }
}

async function loadFeedback() {
  try {
    const response = await fetch('/api/feedback');
    const feedbacks = await response.json();
    renderFeedback(feedbacks);
  } catch (error) {
    console.error('Errore nel caricamento feedback:', error);
  }
}

function renderFeedback(feedbacks) {
  const list = document.getElementById('feedback-list');
  list.innerHTML = '';

  if (feedbacks.length === 0) {
    list.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.7); padding: 30px;">Nessun commento ancora. Sii il primo! 💬</div>';
    return;
  }

  feedbacks.forEach(feedback => {
    const item = document.createElement('div');
    item.className = 'feedback-item';
    
    const date = new Date(feedback.createdAt);
    const dateStr = date.toLocaleDateString('it-IT', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    item.innerHTML = `
      <div class="feedback-item-name">${feedback.name}</div>
      <div class="feedback-item-message">${feedback.message}</div>
      <div class="feedback-item-date">${dateStr}</div>
    `;
    list.appendChild(item);
  });
}

function showSection(sectionId) {
  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
  });

  document.getElementById(sectionId).classList.add('active');
  
  if (sectionId !== 'login' && sectionId !== 'signup') {
    setActiveNavLink(sectionId);
  }
}

function setActiveNavLink(sectionId) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  const link = document.querySelector(`a[href="#${sectionId}"]`);
  if (link) link.classList.add('active');
}

window.onclick = function(event) {
  const modal = document.getElementById('modal');
  if (event.target === modal) {
    closeModal();
  }
}

