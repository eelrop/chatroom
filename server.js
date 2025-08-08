const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');

// Setup multer to save profile images into /images folder
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'images'));
  },
  filename: (req, file, cb) => {
    const username = req.headers['x-username'] || 'user';
    const ext = path.extname(file.originalname);
    const safeName = username.trim().toLowerCase().replace(/\s+/g, '_');
    cb(null, `${safeName}${ext}`);
  }
});

const upload = multer({ storage });


const app = express();
app.set('trust proxy', true);

const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Paths
const configFile = path.join(__dirname, 'config.json');
const historyFile = path.join(__dirname, 'history.json');
const badwordsFile = path.join(__dirname, 'badwords.json');
const usersFile = path.join(__dirname, 'users.json');
const moderationLog = path.join(__dirname, 'moderation.log');
const reportsFile = path.join(__dirname, 'reports.json');
const publicDir = path.join(__dirname, 'public');
const blockedIPsFile = path.join(__dirname, 'blocked_ips.json');
const adminPassFile = path.join(__dirname, 'adminpass.json');

// Legacy admin password fallback
const ADMIN_PASSWORD = "Tribe123";

// --- Utility: Safe JSON loader ---
function safeLoadJSON(file, defaultValue) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (err) {
    console.error(`Error loading ${file}:`, err);
  }
  return defaultValue;
}

// --- Load config and data ---
let config = safeLoadJSON(configFile, { adminUsers: [] });
let badwordsData = safeLoadJSON(badwordsFile, { badWords: [], safeWords: [] });
let badwords = badwordsData.badWords || [];
let safeWords = badwordsData.safeWords || [];

let users = safeLoadJSON(usersFile, []);
let messageHistory = safeLoadJSON(historyFile, []);
let blockedIPs = safeLoadJSON(blockedIPsFile, []);

// Connected users
let connectedUsers = [];

// --- Logging ---
function logModeration(action, details) {
  const timestamp = new Date().toISOString();
  try {
    fs.appendFileSync(moderationLog, `[${timestamp}] ${action}: ${details}\n`);
  } catch (err) {
    console.error("Error writing moderation log:", err);
  }
}

// --- Bad word filter (obfuscation safe) ---
function filterBadWords(message) {
  let outputMessage = message;

  badwords.forEach(word => {
    const isPartOfSafeWord = safeWords.some(sw =>
      sw.toLowerCase().includes(word.toLowerCase())
    );

    if (isPartOfSafeWord && safeWords.some(sw => message.toLowerCase().includes(sw.toLowerCase()))) {
      return;
    }

    const pattern = word
      .split('')
      .map(ch => ch.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'))
      .join('[^a-zA-Z0-9]*');

    const regex = new RegExp(pattern, 'gi');
    outputMessage = outputMessage.replace(regex, '*'.repeat(word.length));
  });

  return outputMessage;
}

// --- Protect master admin ---
function protectLee(username) {
  return username.trim().toLowerCase() === 'lee james';
}

// Middleware
app.use(express.static(publicDir));
app.use(express.json());
app.use('/images', express.static(path.join(__dirname, 'images')));



// Config route
app.get('/config.json', (req, res) => res.json(config));

// Chat history route
app.get('/history', (req, res) => {
  res.json(messageHistory);
});

/* =====================
   ACCOUNT MANAGEMENT
===================== */

app.get('/account/:username', (req, res) => {
  const username = req.params.username;
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  
  if (!user) {
    return res.json({ success: false, message: 'User not found' });
  }

  res.json({ 
    success: true, 
    email: user.email, 
    photo: user.photo || null 
  });
});


app.post('/account/update', async (req, res) => {
  const { username, newUsername, email, password } = req.body;
  const userIndex = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (userIndex === -1) return res.json({ success: false, message: 'User not found' });

  const headerUser = req.headers['x-username'];
  if (headerUser?.toLowerCase() !== username.toLowerCase()) {
    return res.json({ success: false, message: 'Unauthorized' });
  }

  if (protectLee(username) && newUsername && newUsername.toLowerCase() !== username.toLowerCase()) {
    return res.json({ success: false, message: 'Cannot change master admin username' });
  }

  if (newUsername && newUsername.toLowerCase() !== username.toLowerCase()) {
    if (users.some(u => u.username.toLowerCase() === newUsername.toLowerCase())) {
      return res.json({ success: false, message: 'Username already taken' });
    }

    const oldUsername = users[userIndex].username;
    users[userIndex].username = newUsername;

    messageHistory = messageHistory.map(msg =>
      msg.username.toLowerCase() === username.toLowerCase()
        ? { ...msg, username: newUsername }
        : msg
    );

    config.adminUsers = config.adminUsers.map(admin =>
      admin.toLowerCase() === username.toLowerCase() ? newUsername : admin
    );
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

    logModeration('Username Change', `${oldUsername} changed to ${newUsername}`);
  }

  if (email && email !== users[userIndex].email) {
    users[userIndex].email = email;
    logModeration('Email Change', `${username} updated email`);
  }

  if (password && password.trim() !== '') {
    users[userIndex].password = await bcrypt.hash(password, 10);
    logModeration('Password Change', `${username} updated password`);
  }

  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  fs.writeFileSync(historyFile, JSON.stringify(messageHistory, null, 2));

  connectedUsers = connectedUsers.map(u =>
    u.toLowerCase() === username.toLowerCase() ? newUsername : u
  );
  io.emit('userList', connectedUsers);

  res.json({ 
    success: true, 
    message: 'Account updated successfully', 
    username: users[userIndex].username 
  });
});

app.post('/account/photo', upload.single('photo'), (req, res) => {
  const username = req.headers['x-username'];
  const file = req.file;

  if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const userIndex = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (userIndex === -1) return res.status(404).json({ success: false, message: 'User not found' });

  users[userIndex].photo = `/images/${file.filename}`;
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  res.json({ success: true, photo: users[userIndex].photo });
});





/* =====================
   USER AUTH
===================== */

app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (blockedIPs.includes(ip)) return res.json({ success: false, message: 'Your IP has been blocked.' });
  if (!username || !email || !password) return res.json({ success: false, message: 'All fields required' });

  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.json({ success: false, message: 'Username exists' });
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) return res.json({ success: false, message: 'Email exists' });

  const hashedPassword = await bcrypt.hash(password, 10);
  const role = config.adminUsers.includes(username) ? 'admin' : 'user';
  const newUser = { username, email, password: hashedPassword, ip, role };

  users.push(newUser);
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  logModeration('Register', `New user registered: ${username}`);
  res.json({ success: true, username, role });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (blockedIPs.includes(ip)) return res.json({ success: false, message: 'Your IP has been blocked.' });

  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.json({ success: false, message: 'Invalid credentials' });

  const validPass = await bcrypt.compare(password, user.password);
  if (!validPass) return res.json({ success: false, message: 'Invalid credentials' });

  res.json({ success: true, username: user.username, role: user.role });
});

/* =====================
   PASSWORD RECOVERY (TOKEN METHOD)
===================== */

app.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  const requestIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!email) return res.json({ success: false, message: 'Email required' });

  const userIndex = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.json({ success: false, message: 'Email not found' });
  }

  const user = users[userIndex];
  
  // ?? IP check before generating token
  if (user.ip && user.ip !== requestIP) {
    logModeration('Password Reset Attempt', `IP mismatch for ${user.username} (expected ${user.ip}, got ${requestIP})`);
    return res.json({ success: false, message: 'IP address mismatch. As a security feature you can only reset your password from the IP you signed up from.' });
  }

  // Normal token generation if IP matches
  const token = Math.random().toString(36).substr(2, 8);
  const expiry = Date.now() + (15 * 60 * 1000);

  users[userIndex].resetToken = token;
  users[userIndex].resetExpiry = expiry;
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

  logModeration('Password Reset Token', `Token generated for ${user.username}`);
  res.json({ success: true, message: 'Reset token generated', token });
});


app.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.json({ success: false, message: 'Token and new password required' });

  const userIndex = users.findIndex(u =>
    u.resetToken === token && u.resetExpiry && u.resetExpiry > Date.now()
  );
  if (userIndex === -1) {
    return res.json({ success: false, message: 'Invalid or expired token' });
  }

  users[userIndex].password = await bcrypt.hash(newPassword, 10);
  delete users[userIndex].resetToken;
  delete users[userIndex].resetExpiry;

  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  logModeration('Password Reset', `Password reset for ${users[userIndex].username}`);

  res.json({ success: true, message: 'Password reset successfully' });
});

app.post('/validate-reset-token', (req, res) => {
  const { token } = req.body;
  if (!token) return res.json({ valid: false });

  const user = users.find(u => 
    u.resetToken === token && 
    u.resetExpiry && 
    u.resetExpiry > Date.now()
  );

  if (user) {
    res.json({ valid: true });
  } else {
    res.json({ valid: false });
  }
});


/* =====================
   ADMIN ROUTES
===================== */

app.post('/admin/verify', (req, res) => {
  try {
    const { password } = req.body;
    const adminPassData = safeLoadJSON(adminPassFile, { password: ADMIN_PASSWORD });
    res.json({ success: password === adminPassData.password });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/admin/users', (req, res) => res.json(safeLoadJSON(usersFile, [])));
app.get('/users/list', (req, res) => res.json(safeLoadJSON(usersFile, []).map(u => ({ username: u.username }))));

app.post('/admin/delete-user', (req, res) => {
  const { username } = req.body;
  if (protectLee(username)) return res.json({ success: false, message: 'Cannot delete master admin' });
  users = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  logModeration('Delete User', `Deleted user: ${username}`);
  res.json({ success: true });
});

app.post('/admin/promote', (req, res) => {
  const { username } = req.body;
  if (protectLee(username)) {
    return res.json({ success: false, message: 'Cannot modify master admin' });
  }
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.json({ success: false, message: 'User not found' });

  user.role = 'admin';
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  logModeration('Promote User', `Promoted ${username} to admin`);

  for (let [id, socket] of io.sockets.sockets) {
    if (socket.username?.toLowerCase() === username.toLowerCase()) {
      socket.emit('roleUpdated', 'admin');
    }
  }

  res.json({ success: true });
});

app.post('/admin/demote', (req, res) => {
  const { username } = req.body;
  if (protectLee(username)) {
    return res.json({ success: false, message: 'Cannot modify master admin' });
  }
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.json({ success: false, message: 'User not found' });

  user.role = 'user';
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  logModeration('Demote User', `Demoted ${username} to user`);

  for (let [id, socket] of io.sockets.sockets) {
    if (socket.username?.toLowerCase() === username.toLowerCase()) {
      socket.emit('roleUpdated', 'user');
    }
  }

  res.json({ success: true });
});
// Promote Moderator
app.post('/admin/promote-moderator', (req, res) => {
  const { username } = req.body;
  if (protectLee(username)) {
    return res.json({ success: false, message: 'Cannot modify master admin' });
  }
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.json({ success: false, message: 'User not found' });

  user.role = 'moderator';
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  logModeration('Promote Moderator', `Promoted ${username} to moderator`);

  for (let [id, socket] of io.sockets.sockets) {
    if (socket.username?.toLowerCase() === username.toLowerCase()) {
      socket.emit('roleUpdated', 'moderator');
    }
  }

  res.json({ success: true });
});
// Demote Moderator
app.post('/admin/demote-moderator', (req, res) => {
  const { username } = req.body;
  if (protectLee(username)) {
    return res.json({ success: false, message: 'Cannot modify master admin' });
  }
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.json({ success: false, message: 'User not found' });

  user.role = 'user';
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  logModeration('Demote Moderator', `Demoted ${username} to user`);

  for (let [id, socket] of io.sockets.sockets) {
    if (socket.username?.toLowerCase() === username.toLowerCase()) {
      socket.emit('roleUpdated', 'user');
    }
  }

  res.json({ success: true });
});



app.post('/admin/block-ip', (req, res) => {
  const { ip } = req.body;
  if (!blockedIPs.includes(ip)) {
    blockedIPs.push(ip);
    fs.writeFileSync(blockedIPsFile, JSON.stringify(blockedIPs, null, 2));
  }
  logModeration('Block IP', `Blocked IP: ${ip}`);
  res.json({ success: true });
});

app.get('/admin/blocked-ips', (req, res) => res.json(blockedIPs));
app.post('/admin/unblock-ip', (req, res) => {
  const { ip } = req.body;
  blockedIPs = blockedIPs.filter(b => b !== ip);
  fs.writeFileSync(blockedIPsFile, JSON.stringify(blockedIPs, null, 2));
  logModeration('Unblock IP', `Unblocked IP: ${ip}`);
  res.json({ success: true });
});

app.post('/admin/clear-chat', (req, res) => {
  try {
    const requester = req.headers['x-username'];
    const user = users.find(u => u.username === requester);
    if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    messageHistory = [];
    fs.writeFileSync(historyFile, JSON.stringify(messageHistory, null, 2));
    logModeration('Clear Chat', `Chat history cleared by ${user.role} ${user.username}`);
    io.emit('clearChat');
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Server error clearing chat' });
  }
});


/* =====================
   ADMIN: BAD WORDS MANAGEMENT
===================== */

app.get('/admin/badwords', (req, res) => {
  try {
    const badwordsData = safeLoadJSON(badwordsFile, { badWords: [], safeWords: [] });
    res.json(badwordsData);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error loading bad words' });
  }
});

app.post('/admin/badwords', (req, res) => {
  try {
    let { badWords: newBadWords, safeWords: newSafeWords } = req.body;

    if (!Array.isArray(newBadWords) || !Array.isArray(newSafeWords)) {
      return res.status(400).json({ success: false, message: 'Invalid format. Must be arrays.' });
    }

    newBadWords = [...new Set(newBadWords.map(w => String(w).trim()).filter(w => w.length > 0))];
    newSafeWords = [...new Set(newSafeWords.map(w => String(w).trim()).filter(w => w.length > 0))];

    const newData = { badWords: newBadWords, safeWords: newSafeWords };

    fs.writeFileSync(badwordsFile, JSON.stringify(newData, null, 2));

    badwordsData = newData;
    badwords = newBadWords;
    safeWords = newSafeWords;

    logModeration('Update Bad Words', 'Bad words list updated by admin');
    res.json({ success: true, message: 'Bad words updated successfully' });
  } catch (err) {
    console.error("Error updating bad words:", err);
    res.status(500).json({ success: false, message: 'Error saving bad words' });
  }
});

/* =====================
   REPORT ABUSE ROUTES
===================== */

app.post('/report-abuse', (req, res) => {
  const { reporter, offender, details, time } = req.body;
  if (!reporter || !offender || !details) return res.json({ success: false, message: 'All fields required' });

  let reports = safeLoadJSON(reportsFile, []);
  reports.push({ reporter, offender, details, time });
  fs.writeFileSync(reportsFile, JSON.stringify(reports, null, 2));
  logModeration('Abuse Report', `Reporter: ${reporter}, Offender: ${offender}`);
  res.json({ success: true });
});

app.get('/admin/reports', (req, res) => res.json(safeLoadJSON(reportsFile, [])));
app.post('/admin/clear-reports', (req, res) => {
  fs.writeFileSync(reportsFile, JSON.stringify([], null, 2));
  logModeration('Clear Reports', 'All abuse reports cleared by admin');
  res.json({ success: true });
});

/* =====================
   SOCKET.IO CHAT
===================== */

io.on('connection', (socket) => {
  socket.on('join', (username) => {
    socket.username = username;
    const alreadyConnected = connectedUsers.includes(username);

    if (!alreadyConnected) {
      connectedUsers.push(username);
      io.emit('systemMessage', `${username} has joined the chat`);
    }

    messageHistory.forEach(msg => socket.emit('chatMessage', msg));
    io.emit('userList', connectedUsers);
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      const usernameLeaving = socket.username;
      setTimeout(() => {
        if (!connectedUsers.includes(usernameLeaving)) {
          io.emit('systemMessage', `${usernameLeaving} has left the chat`);
        }
      }, 10000);

      connectedUsers = connectedUsers.filter(u => u !== socket.username);
      io.emit('userList', connectedUsers);
    }
  });

  socket.on('chatMessage', (msgData) => {
  if (!socket.username) return;

  const user = users.find(u => u.username.toLowerCase() === socket.username.toLowerCase());
  const avatar = user?.photo || null;
  const filteredMessage = filterBadWords(msgData.message);

  const data = {
    id: Date.now(),
    username: socket.username,
    avatar,
    message: filteredMessage,
    time: new Date().toISOString(),
    isGif: msgData.isGif || false,
    replyTo: msgData.replyTo || null,
    deleted: false
  };

  messageHistory.push(data);
  fs.writeFileSync(historyFile, JSON.stringify(messageHistory, null, 2));
  io.emit('chatMessage', data);
});


socket.on('deleteMessage', (msgId) => {
  if (!socket.username) return;
  const msg = messageHistory.find(m => m.id === msgId);
  const user = users.find(u => u.username === socket.username);
  if (msg && (msg.username === socket.username || (user && (user.role === 'admin' || user.role === 'moderator')))) {
    msg.deleted = true;
    msg.deletedBy = socket.username;
    fs.writeFileSync(historyFile, JSON.stringify(messageHistory, null, 2));
    io.emit('updateMessage', msg);
  }
});

});


// --- Start server ---
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on ${PORT}`));
