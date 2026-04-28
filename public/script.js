let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  loadApps();
  loadFeedback();
  checkAuth();
  setupEventListeners();
  loadAppsForSelects();
});

function setupEventListeners() {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const appForm = document.getElementById('app-form');
  const feedbackForm = document.getElementById('feedback-form');
  const licenseForm = document.getElementById('activate-license-form');
  const couponForm = document.getElementById('generate-coupon-form');
  
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  if (signupForm) signupForm.addEventListener('submit', handleSignup);
  if (appForm) appForm.addEventListener('submit', handleAddApp);
  if (feedbackForm) feedbackForm.addEventListener('submit', handleFeedback);
  if (licenseForm) licenseForm.addEventListener('submit', handleActivateLicense);
  if (couponForm) couponForm.addEventListener('submit', handleGenerateCoupons);
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
      if (errorDiv) errorDiv.textContent = '';
    } else {
      if (errorDiv) errorDiv.textContent = data.error || 'Errore nel login';
    }
  } catch (error) {
    console.error('Login error:', error);
    if (errorDiv) errorDiv.textContent = 'Errore di connessione';
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
      if (errorDiv) errorDiv.textContent = '';
      alert('Registrazione completata! Effettua il login.');
      document.getElementById('signup-form').reset();
      showSection('login');
    } else {
      if (errorDiv) errorDiv.textContent = data.error || 'Errore nella registrazione';
    }
  } catch (error) {
    console.error('Signup error:', error);
    if (errorDiv) errorDiv.textContent = 'Errore di connessione';
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
  const addButton = document.getElementById('btn-add-app');
  const adminLink = document.getElementById('admin-link');

  if (currentUser) {
    if (authButtons) authButtons.style.display = 'none';
    if (userMenu) userMenu.style.display = 'flex';
    const userDisplay = document.getElementById('user-display');
    if (userDisplay) userDisplay.textContent = `👤 ${currentUser.username}`;
    
    if (currentUser.isAdmin) {
      if (addButton) addButton.style.display = 'block';
      if (adminLink) adminLink.style.display = 'block';
      loadAdminData();
    } else {
      if (addButton) addButton.style.display = 'none';
      if (adminLink) adminLink.style.display = 'none';
    }
  } else {
    if (authButtons) authButtons.style.display = 'flex';
    if (userMenu) userMenu.style.display = 'none';
    if (addButton) addButton.style.display = 'none';
    if (adminLink) adminLink.style.display = 'none';
  }
}

// ===== LOAD APPS FOR SELECTS =====

async function loadAppsForSelects() {
  try {
    const response = await fetch('/api/apps');
    const apps = await response.json();
    
    const couponSelect = document.getElementById('coupon-app-id');
    const licenseSelect = document.getElementById('license-app-id');
    
    if (couponSelect) {
      couponSelect.innerHTML = '<option value="">Seleziona App</option>';
      apps.forEach(app => {
        const option = document.createElement('option');
        option.value = app.id;
        option.textContent = app.name;
        couponSelect.appendChild(option);
      });
    }
    
    if (licenseSelect) {
      licenseSelect.innerHTML = '<option value="">Seleziona App</option>';
      apps.forEach(app => {
        const option = document.createElement('option');
        option.value = app.id;
        option.textContent = app.name;
        licenseSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Errore caricamento app:', error);
  }
}

// ===== COUPON MANAGEMENT =====

async function handleGenerateCoupons(e) {
  e.preventDefault();

  if (!currentUser || !currentUser.isAdmin) {
    alert('Solo admin possono generare coupon!');
    return;
  }

  const app_id = parseInt(document.getElementById('coupon-app-id').value);
  const count = parseInt(document.getElementById('coupon-count').value) || 5;
  const days_valid = parseInt(document.getElementById('coupon-days').value) || 365;
  const statusDiv = document.getElementById('coupon-status');

  if (!app_id) {
    if (statusDiv) {
      statusDiv.textContent = '✗ Seleziona un\'app';
      statusDiv.classList.add('error');
    }
    return;
  }

  try {
    const response = await fetch(`/api/admin/generate-coupons?username=${currentUser.username}&isAdmin=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id, count, days_valid })
    });

    const data = await response.json();

    if (response.ok) {
      if (statusDiv) {
        statusDiv.textContent = `✓ ${count} coupon generati! Codici: ${data.coupons.join(', ')}`;
        statusDiv.classList.add('success');
        statusDiv.classList.remove('error');
      }
      document.getElementById('generate-coupon-form').reset();
      loadCoupons();

      setTimeout(() => {
        if (statusDiv) {
          statusDiv.textContent = '';
          statusDiv.classList.remove('success');
        }
      }, 5000);
    } else {
      if (statusDiv) {
        statusDiv.textContent = '✗ Errore nella generazione';
        statusDiv.classList.add('error');
        statusDiv.classList.remove('success');
      }
    }
  } catch (error) {
    console.error('Generate coupon error:', error);
    if (statusDiv) {
      statusDiv.textContent = '✗ Errore di connessione';
      statusDiv.classList.add('error');
      statusDiv.classList.remove('success');
    }
  }
}

async function loadCoupons() {
  if (!currentUser || !currentUser.isAdmin) return;

  try {
    const response = await fetch(`/api/android/coupons?username=${currentUser.username}&isAdmin=true`);

    if (response.ok) {
      const coupons = await response.json();
      renderCoupons(coupons);
    }
  } catch (error) {
    console.error('Errore caricamento coupon:', error);
  }
}

function renderCoupons(coupons) {
  const tbody = document.getElementById('coupons-list');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!coupons || coupons.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Nessun coupon generato</td></tr>';
    return;
  }

  coupons.forEach(coupon => {
    const statusBadge = coupon.is_used ? `✅ Usato (${coupon.used_by_email})` : '🔓 Disponibile';
    const createdAt = new Date(coupon.created_at).toLocaleDateString('it-IT');

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${coupon.app_name || '-'}</td>
      <td style="font-weight: bold;">${coupon.coupon_code}</td>
      <td>${statusBadge}</td>
      <td>${coupon.used_by_email || '-'}</td>
      <td>${createdAt}</td>
    `;
    tbody.appendChild(row);
  });
}

// ===== LICENSE MANAGEMENT =====

async function handleActivateLicense(e) {
  e.preventDefault();

  if (!currentUser || !currentUser.isAdmin) {
    alert('Solo admin possono attivare licenze!');
    return;
  }

  const app_id = parseInt(document.getElementById('license-app-id').value);
  const email = document.getElementById('license-email').value;
  const device_id = document.getElementById('license-device-id').value;
  const days_valid = parseInt(document.getElementById('license-days').value) || 365;
  const statusDiv = document.getElementById('license-status');

  if (!app_id) {
    if (statusDiv) {
      statusDiv.textContent = '✗ Seleziona un\'app';
      statusDiv.classList.add('error');
    }
    return;
  }

  try {
    const response = await fetch('/api/android/admin/activate-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id, email, device_id, days_valid })
    });

    const data = await response.json();

    if (response.ok) {
      if (statusDiv) {
        statusDiv.textContent = '✓ Licenza attivata con successo!';
        statusDiv.classList.add('success');
        statusDiv.classList.remove('error');
      }
      document.getElementById('activate-license-form').reset();
      loadAndroidLicenses();
      loadAdminStats();

      setTimeout(() => {
        if (statusDiv) {
          statusDiv.textContent = '';
          statusDiv.classList.remove('success');
        }
      }, 3000);
    } else {
      if (statusDiv) {
        statusDiv.textContent = '✗ ' + (data.message || 'Errore nell\'attivazione');
        statusDiv.classList.add('error');
        statusDiv.classList.remove('success');
      }
    }
  } catch (error) {
    console.error('License activation error:', error);
    if (statusDiv) {
      statusDiv.textContent = '✗ Errore di connessione';
      statusDiv.classList.add('error');
      statusDiv.classList.remove('success');
    }
  }
}

async function loadAndroidLicenses() {
  if (!currentUser || !currentUser.isAdmin) return;

  try {
    const response = await fetch(`/api/android/licenses?username=${currentUser.username}&isAdmin=true`);

    if (response.ok) {
      const licenses = await response.json();
      renderAndroidLicenses(licenses);
    }
  } catch (error) {
    console.error('Errore caricamento licenze:', error);
  }
}

function renderAndroidLicenses(licenses) {
  const tbody = document.getElementById('android-licenses-list');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!licenses || licenses.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Nessuna licenza attiva</td></tr>';
    return;
  }

  licenses.forEach(license => {
    const expDate = new Date(license.expiration_date);
    const isExpired = expDate < new Date();
    const dateStr = expDate.toLocaleDateString('it-IT', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    const statusBadge = isExpired ? '❌ Scaduta' : '✅ Attiva';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${license.app_name || '-'}</td>
      <td>${license.email}</td>
      <td style="font-size: 11px; word-break: break-all;">${license.device_id}</td>
      <td>${statusBadge}</td>
      <td>${dateStr}</td>
      <td>
        <button class="btn-revoke" onclick="revokeLicense(${license.app_id}, '${license.email}', '${license.device_id}')">🔓 Revoca</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function revokeLicense(app_id, email, device_id) {
  if (!currentUser || !currentUser.isAdmin) {
    alert('Solo admin possono revocare licenze!');
    return;
  }

  if (!confirm('Vuoi revocare questa licenza?')) {
    return;
  }

  try {
    const response = await fetch(`/api/android/admin/revoke-license?username=${currentUser.username}&isAdmin=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id, email, device_id })
    });

    if (response.ok) {
      alert('Licenza revocata!');
      loadAndroidLicenses();
      loadAdminStats();
    } else {
      alert('Errore nella revoca della licenza');
    }
  } catch (error) {
    console.error('Errore:', error);
    alert('Errore di connessione');
  }
}

// ===== ADMIN =====

async function loadAdminData() {
  loadAdminStats();
  loadAdminUsers();
  loadAndroidLicenses();
  loadCoupons();
}

async function loadAdminStats() {
  if (!currentUser || !currentUser.isAdmin) return;

  try {
    const response = await fetch(`/api/admin/stats?username=${currentUser.username}&isAdmin=true`);
    const stats = await response.json();

    const statUsers = document.getElementById('stat-users');
    const statApps = document.getElementById('stat-apps');
    const statFeedback = document.getElementById('stat-feedback');
    const statLicenses = document.getElementById('stat-android-licenses');

    if (statUsers) statUsers.textContent = stats.totalUsers;
    if (statApps) statApps.textContent = stats.totalApps;
    if (statFeedback) statFeedback.textContent = stats.totalFeedback;
    if (statLicenses) statLicenses.textContent = stats.totalAndroidLicenses || '0';
  } catch (error) {
    console.error('Errore caricamento stats:', error);
  }
}

async function loadAdminUsers() {
  if (!currentUser || !currentUser.isAdmin) return;

  try {
    const response = await fetch(`/api/admin/users?username=${currentUser.username}&isAdmin=true`);
    const users = await response.json();
    renderAdminUsers(users);
  } catch (error) {
    console.error('Errore caricamento utenti:', error);
  }
}

function renderAdminUsers(users) {
  const tbody = document.getElementById('users-list');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">Nessun utente registrato</td></tr>';
    return;
  }

  users.forEach(user => {
    const date = new Date(user.createdAt);
    const dateStr = date.toLocaleDateString('it-IT', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${user.username}</td>
      <td>${user.email}</td>
      <td>${dateStr}</td>
      <td>
        <button class="btn-reset" onclick="resetUserPassword(${user.id})">🔑 Reset Password</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function resetUserPassword(userId) {
  if (!currentUser || !currentUser.isAdmin) {
    alert('Solo admin possono resettare password!');
    return;
  }

  if (!confirm('Resettare la password di questo utente? La nuova password sarà: Password123')) {
    return;
  }

  try {
    const response = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser.username,
        isAdmin: currentUser.isAdmin,
        userId: userId
      })
    });

    const data = await response.json();

    if (response.ok) {
      alert(`Password resettata!\nNuova password: ${data.newPassword}`);
      loadAdminUsers();
    } else {
      alert(data.error || 'Errore nel reset della password');
    }
  } catch (error) {
    console.error('Errore reset password:', error);
    alert('Errore di connessione');
  }
}

// ===== APPS =====

async function handleAddApp(e) {
  e.preventDefault();
  
  if (!currentUser || !currentUser.isAdmin) {
    alert('Solo admin possono aggiungere app!');
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
      loadAppsForSelects();
      loadAdminStats();
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
  if (!grid) return;
  
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

    let deleteButton = '';
    if (currentUser && currentUser.isAdmin) {
      deleteButton = `<button class="btn-delete" onclick="deleteApp(${app.id})">🗑️ Elimina</button>`;
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
          ${deleteButton}
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
  if (!currentUser || !currentUser.isAdmin) {
    alert('Solo admin possono eliminare app!');
    return;
  }

  if (confirm('Sei sicuro di voler eliminare questo progetto?')) {
    try {
      const response = await fetch(`/api/apps/${id}`, { method: 'DELETE' });
      if (response.ok) {
        loadApps();
        loadAppsForSelects();
        loadAdminStats();
      }
    } catch (error) {
      console.error('Errore:', error);
    }
  }
}

function openModal() {
  if (!currentUser || !currentUser.isAdmin) {
    alert('Solo admin possono aggiungere app!');
    return;
  }
  const modal = document.getElementById('modal');
  if (modal) modal.classList.add('show');
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('show');
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
      if (statusDiv) {
        statusDiv.textContent = '✓ Recensione salvata nel sito! Grazie!';
        statusDiv.classList.add('success');
        statusDiv.classList.remove('error');
      }
      
      document.getElementById('feedback-form').reset();
      loadFeedback();
      
      if (currentUser && currentUser.isAdmin) {
        loadAdminStats();
      }
      
      setTimeout(() => {
        if (statusDiv) {
          statusDiv.textContent = '';
          statusDiv.classList.remove('success');
        }
      }, 4000);
    } else {
      const error = await response.json();
      if (statusDiv) {
        statusDiv.textContent = '✗ ' + (error.error || 'Errore nell\'invio');
        statusDiv.classList.add('error');
        statusDiv.classList.remove('success');
      }
    }
  } catch (error) {
    console.error('Errore:', error);
    if (statusDiv) {
      statusDiv.textContent = '✗ Errore di connessione';
      statusDiv.classList.add('error');
      statusDiv.classList.remove('success');
    }
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
  if (!list) return;

  list.innerHTML = '';

  if (feedbacks.length === 0) {
    list.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.7); padding: 30px;">Nessuna recensione ancora. Sii il primo! 💬</div>';
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

  const section = document.getElementById(sectionId);
  if (section) section.classList.add('active');
  
  if (sectionId !== 'login' && sectionId !== 'signup') {
    setActiveNavLink(sectionId);
  }

  if (sectionId === 'admin' && currentUser && currentUser.isAdmin) {
    loadAdminData();
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
