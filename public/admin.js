let searchMatches = [];
let searchIndex = 0;
let searchTimeout;

const escapeHTML = (str) =>
  str.replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));

function showMessage(text, type = 'success') {
  const box = document.getElementById('adminMessage');
  box.textContent = text;
  box.style.display = 'block';
  box.style.backgroundColor = type === 'success' ? '#155724' : '#721c24';
  box.style.color = '#fff';
  box.style.border = `1px solid ${type === 'success' ? '#28a745' : '#dc3545'}`;
  setTimeout(() => { box.style.display = 'none'; }, 3000);
}

function confirmAction(message, callback) {
  const modal = document.getElementById('confirmModal');
  const confirmText = document.getElementById('confirmText');
  modal.style.display = 'flex';
  confirmText.textContent = message;

  document.getElementById('confirmYes').onclick = () => {
    modal.style.display = 'none';
    callback(true);
  };
  document.getElementById('confirmNo').onclick = () => {
    modal.style.display = 'none';
    callback(false);
  };
}

function flashStatus(selector, identifier, message) {
  const cell = [...document.querySelectorAll(selector)]
    .find(td => td.textContent.trim() === identifier);
  if (cell) {
    let statusSpan = cell.querySelector('.user-status, .ip-status');
    if (!statusSpan) {
      statusSpan = document.createElement('span');
      statusSpan.className = selector.includes('users') ? 'user-status' : 'ip-status';
      cell.appendChild(statusSpan);
    }
    statusSpan.textContent = ` ${message}`;
    statusSpan.classList.add('show');
    setTimeout(() => {
      statusSpan.classList.remove('show');
    }, 2000);
  }
}

document.getElementById('closeAdmin').onclick = () => {
  window.close();
  setTimeout(() => { window.location.href = "/"; }, 100);
};

/* =====================
   ADMIN LOGIN
===================== */
document.getElementById('adminLoginBtn').onclick = async () => {
  await handleAdminLogin();
};

document.getElementById('adminPassword').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleAdminLogin();
  }
});

async function handleAdminLogin() {
  const password = document.getElementById('adminPassword').value;
  const errorBox = document.getElementById('adminError');

  const res = await fetch('/admin/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });

  const data = await res.json();
  if (!data.success) {
    errorBox.style.display = 'block';
    errorBox.textContent = 'Invalid password. Please try again.';
  } else {
    document.getElementById('adminLoginModal').style.display = 'none';
    document.getElementById('adminModal').style.display = 'flex';
    loadUsers();
    loadBlockedIPs();
    loadReports();
    loadBadWords();
  }
}

/* =====================
   LOAD USERS
===================== */
async function loadUsers() {
  const res = await fetch('/admin/users');
  const users = await res.json();
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '';
  users.forEach(user => {
    const tr = document.createElement('tr');
    const safeUsername = escapeHTML(user.username);
    const safeEmail = escapeHTML(user.email);
    const safeIP = escapeHTML(user.ip);

    let actions = '';
    if (user.username === 'Lee James') {
      actions = `<span style="color:gray;">Protected</span>`;
    } else {
      actions += `<button class="action-btn" data-action="delete" data-username="${safeUsername}">Delete</button>`;
      actions += `<button class="action-btn" data-action="block" data-ip="${safeIP}">Block IP</button>`;
      if (user.role === 'admin') {
        actions += `<button class="action-btn" data-action="demote" data-username="${safeUsername}">Demote to User</button>`;
      } else if (user.role === 'moderator') {
        actions += `<button class="action-btn" data-action="demote-moderator" data-username="${safeUsername}">Demote to User</button>`;
      } else {
        actions += `<button class="action-btn" data-action="promote" data-username="${safeUsername}">Promote to Admin</button>`;
        actions += `<button class="action-btn" data-action="promote-moderator" data-username="${safeUsername}">Promote to Moderator</button>`;
      }
    }

    tr.innerHTML = `
      <td>${safeUsername}</td>
      <td>${safeEmail}</td>
      <td>${safeIP}</td>
      <td>${user.role}</td>
      <td>${actions}</td>
    `;
    tbody.appendChild(tr);
  });
  bindUserActions();
}

/* =====================
   LOAD BLOCKED IPS
===================== */
async function loadBlockedIPs() {
  const res = await fetch('/admin/blocked-ips');
  const ips = await res.json();
  const tbody = document.getElementById('blockedTableBody');
  tbody.innerHTML = '';
  if (ips.length === 0) {
    tbody.innerHTML = `<tr><td colspan="2">No blocked IPs</td></tr>`;
    return;
  }
  ips.forEach(ip => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHTML(ip)}</td>
      <td><button class="action-btn" data-action="unblock" data-ip="${escapeHTML(ip)}">Unblock</button></td>
    `;
    tbody.appendChild(tr);
  });
  bindIPActions();
}

/* =====================
   LOAD REPORTS
===================== */
async function loadReports() {
  const res = await fetch('/admin/reports');
  const reports = await res.json();
  const tbody = document.getElementById('reportsTableBody');
  tbody.innerHTML = '';
  document.getElementById('clearReportsBtn').disabled = reports.length === 0;
  if (reports.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">No reports found</td></tr>`;
    return;
  }
  reports.forEach(report => {
    const tr = document.createElement('tr');
    const timeFormatted = new Date(report.time).toLocaleString();
    tr.innerHTML = `
      <td>${escapeHTML(report.reporter)}</td>
      <td>${escapeHTML(report.offender)}</td>
      <td>${escapeHTML(report.details)}</td>
      <td>${timeFormatted}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* =====================
   LOAD BAD WORDS
===================== */
async function loadBadWords() {
  const res = await fetch('/admin/badwords');
  const data = await res.json();
  document.getElementById('badWordsList').value = data.badWords.join(', ');
  document.getElementById('safeWordsList').value = data.safeWords.join(', ');
  updateCounts();
}

function updateCounts() {
  const badCount = document.getElementById('badWordsList').value.split(',').filter(w => w.trim()).length;
  const safeCount = document.getElementById('safeWordsList').value.split(',').filter(w => w.trim()).length;
  document.getElementById('badWordsInfo').textContent = `Bad Words: ${badCount} entries`;
  document.getElementById('safeWordsInfo').textContent = `Safe Words: ${safeCount} entries`;
}

/* =====================
   USER ACTIONS
===================== */
function bindUserActions() {
  document.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.onclick = () => {
      confirmAction(`Delete user ${btn.dataset.username}?`, async (confirmed) => {
        if (confirmed) {
          await fetch('/admin/delete-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: btn.dataset.username })
          });
          flashStatus('#usersTableBody td:first-child', btn.dataset.username, "(Deleted)");
          showMessage(`User ${btn.dataset.username} deleted`, 'success');
          loadUsers();
        }
      });
    };
  });

  document.querySelectorAll('[data-action="block"]').forEach(btn => {
    btn.onclick = async () => {
      await fetch('/admin/block-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: btn.dataset.ip })
      });
      flashStatus('#blockedTableBody td:first-child', btn.dataset.ip, "(Blocked)");
      showMessage(`IP ${btn.dataset.ip} blocked`, 'success');
      loadBlockedIPs();
    };
  });

  document.querySelectorAll('[data-action="promote"]').forEach(btn => {
    btn.onclick = () => {
      confirmAction(`Promote ${btn.dataset.username} to admin?`, async (confirmed) => {
        if (confirmed) {
          await fetch('/admin/promote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: btn.dataset.username })
          });
          flashStatus('#usersTableBody td:first-child', btn.dataset.username, "(Admin)");
          showMessage(`User ${btn.dataset.username} promoted to admin`, 'success');
          loadUsers();
        }
      });
    };
  });

  document.querySelectorAll('[data-action="demote"]').forEach(btn => {
    btn.onclick = () => {
      confirmAction(`Demote ${btn.dataset.username} to user?`, async (confirmed) => {
        if (confirmed) {
          await fetch('/admin/demote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: btn.dataset.username })
          });
          flashStatus('#usersTableBody td:first-child', btn.dataset.username, "(User)");
          showMessage(`Admin ${btn.dataset.username} demoted to user`, 'success');
          loadUsers();
        }
      });
    };
  });

  document.querySelectorAll('[data-action="promote-moderator"]').forEach(btn => {
    btn.onclick = () => {
      confirmAction(`Promote ${btn.dataset.username} to moderator?`, async (confirmed) => {
        if (confirmed) {
          await fetch('/admin/promote-moderator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: btn.dataset.username })
          });
          flashStatus('#usersTableBody td:first-child', btn.dataset.username, "(Moderator)");
          showMessage(`User ${btn.dataset.username} promoted to moderator`, 'success');
          loadUsers();
        }
      });
    };
  });

  document.querySelectorAll('[data-action="demote-moderator"]').forEach(btn => {
    btn.onclick = () => {
      confirmAction(`Demote ${btn.dataset.username} to user?`, async (confirmed) => {
        if (confirmed) {
          await fetch('/admin/demote-moderator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: btn.dataset.username })
          });
          flashStatus('#usersTableBody td:first-child', btn.dataset.username, "(User)");
          showMessage(`Moderator ${btn.dataset.username} demoted to user`, 'success');
          loadUsers();
        }
      });
    };
  });
}

function bindIPActions() {
  document.querySelectorAll('[data-action="unblock"]').forEach(btn => {
    btn.onclick = () => {
      confirmAction(`Unblock IP ${btn.dataset.ip}?`, async (confirmed) => {
        if (confirmed) {
          await fetch('/admin/unblock-ip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: btn.dataset.ip })
          });
          flashStatus('#blockedTableBody td:first-child', btn.dataset.ip, "(Unblocked)");
          showMessage(`IP ${btn.dataset.ip} unblocked`, 'success');
          loadBlockedIPs();
        }
      });
    };
  });
}
