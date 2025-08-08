document.addEventListener('DOMContentLoaded', async () => {
  const config = await fetch('/config.json').then(res => res.json());
  const adminUsers = config.adminUsers;
  const usersData = await fetch('/admin/users').then(res => res.json());

  const socket = io();
  let username = '';
  let replyTo = null;

  // Elements
  const chat = document.getElementById('chat');
  const messageInput = document.getElementById('messageInput');
  const sendButton = document.getElementById('sendButton');
  const emojiButton = document.getElementById('emojiButton');
  const gifSearchInput = document.getElementById('gifSearchInput');
  const gifSearchButton = document.getElementById('gifSearchButton');
  const usernameModal = document.getElementById('usernameModal');
  const logoutButton = document.getElementById('logoutButton');
  const logoutModal = document.getElementById('logoutModal');
  const logoutConfirm = document.getElementById('logoutConfirm');
  const logoutCancel = document.getElementById('logoutCancel');
  const clearChatButton = document.getElementById('clearChatButton');
  const buttonRow = document.getElementById('buttonRow');
  let moderateButton = document.getElementById('moderateButton');
  const accountButton = document.getElementById('accountButton');

  if (!moderateButton && buttonRow) {
    moderateButton = document.createElement('button');
    moderateButton.id = 'moderateButton';
    moderateButton.textContent = 'Moderate';
    moderateButton.style.display = 'none';
    buttonRow.appendChild(moderateButton);
  }

  const emojiPopup = document.getElementById('emojiPopup');
  const emojiPickerDiv = document.getElementById('emojiPicker');
  const emojiClose = document.getElementById('emojiClose');
  const gifPopup = document.getElementById('gifPopup');
  const gifResults = document.getElementById('gifResults');
  const gifClose = document.getElementById('gifClose');

  const loginView = document.getElementById('loginView');
  const registerView = document.getElementById('registerView');
  const showRegister = document.getElementById('showRegister');
  const showLogin = document.getElementById('showLogin');

  const loginUsername = document.getElementById('loginUsername');
  const loginPassword = document.getElementById('loginPassword');
  const loginSubmit = document.getElementById('loginSubmit');
  const loginCancel = document.getElementById('loginCancel');

  const registerUsername = document.getElementById('registerUsername');
  const registerEmail = document.getElementById('registerEmail');
  const registerPassword = document.getElementById('registerPassword');
  const registerPolicy = document.getElementById('registerPolicy');
  const registerSubmit = document.getElementById('registerSubmit');
  const registerCancel = document.getElementById('registerCancel');

  const replyPreview = document.createElement('div');
  replyPreview.classList.add('reply-preview');
  replyPreview.style.display = 'none';
  const inputRow = document.getElementById('inputRow');
  if (inputRow && inputRow.parentNode) {
    inputRow.parentNode.insertBefore(replyPreview, inputRow);
  }

  function updateLoginButton() {
    if (logoutButton) logoutButton.textContent = username ? 'Log Out' : 'Log In';
  }

  function checkAdmin() {
    const userInfo = JSON.parse(localStorage.getItem('user'));
    const isAdmin = userInfo && userInfo.role === 'admin';
    const isModerator = userInfo && userInfo.role === 'moderator';
    if (moderateButton) moderateButton.style.display = isAdmin ? 'inline-block' : 'none';
    if (clearChatButton) clearChatButton.style.display = (isAdmin || isModerator) ? 'inline-block' : 'none';
  }

  function setReplyPreview(data) {
    replyPreview.innerHTML = `
      <button class="cancel-reply-btn">X</button>
      <span><strong>${data.username}</strong> said: ${
        data.type === 'gif'
          ? `<img src="${data.content}" style="max-height:30px;">`
          : `<i>${typeof data.content === 'string' ? data.content.replace(/<[^>]*>/g, '').slice(0,50) : ''}...</i>`
      }</span>
    `;
    replyPreview.style.display = 'flex';
    replyPreview.querySelector('.cancel-reply-btn').onclick = () => {
      replyPreview.style.display = 'none';
      replyPreview.innerHTML = '';
      replyTo = null;
    };
  }

  if (showRegister) showRegister.onclick = () => { loginView.style.display = 'none'; registerView.style.display = 'block'; };
  if (showLogin) showLogin.onclick = () => { registerView.style.display = 'none'; loginView.style.display = 'block'; };
  if (loginCancel) loginCancel.onclick = () => { usernameModal.style.display = 'none'; };
  if (registerCancel) registerCancel.onclick = () => { usernameModal.style.display = 'none'; };

  socket.on('connect', () => {
    const savedUser = JSON.parse(localStorage.getItem('user'));
    if (savedUser && !username) {
      username = savedUser.username;
      socket.emit('join', username);
      checkAdmin();
    }
    updateLoginButton();
    fetch('/history')
  .then(res => res.json())
  .then(history => {
    chat.innerHTML = '';
    history.forEach(msg => renderMessage(msg));

    // ? Force scroll to bottom after loading history
    setTimeout(() => {
      chat.scrollTop = chat.scrollHeight;
    }, 50);
  })
  .catch(err => console.error('Error refreshing chat history:', err));

  });

  loginSubmit.onclick = () => {
    fetch('/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginUsername.value, password: loginPassword.value })
    }).then(res => res.json()).then(data => {
      if (data.success) {
        username = data.username;
        localStorage.setItem('user', JSON.stringify({ username: data.username, role: data.role }));
        socket.connect();
        socket.emit('join', username);
        usernameModal.style.display = 'none';
        updateLoginButton();
        checkAdmin();
      } else {
  let errorBox = document.getElementById('loginErrorBox');
  if (!errorBox) {
    errorBox = document.createElement('div');
    errorBox.id = 'loginErrorBox';
    errorBox.style.background = '#2a2a2a';
    errorBox.style.border = '1px solid red';
    errorBox.style.color = 'red';
    errorBox.style.padding = '8px';
    errorBox.style.marginTop = '10px';
    errorBox.style.borderRadius = '5px';
    loginView.insertBefore(errorBox, loginView.firstChild);
  }
  errorBox.textContent = 'Invalid username or password.';
}
    });
  };

  registerSubmit.onclick = () => {
    if (!registerPolicy.checked) return alert('You must agree to the User Policy');
    fetch('/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: registerUsername.value,
        email: registerEmail.value,
        password: registerPassword.value
      })
    }).then(res => res.json()).then(data => {
      if (data.success) {
        username = data.username;
        localStorage.setItem('user', JSON.stringify({ username: data.username, role: data.role }));
        socket.connect();
        socket.emit('join', username);
        usernameModal.style.display = 'none';
        updateLoginButton();
        checkAdmin();
    } else {
  let errorBox = document.getElementById('loginErrorBox');
  if (!errorBox) {
    errorBox = document.createElement('div');
    errorBox.id = 'loginErrorBox';
    errorBox.style.background = '#2a2a2a';
    errorBox.style.border = '1px solid red';
    errorBox.style.color = 'red';
    errorBox.style.padding = '8px';
    errorBox.style.marginTop = '10px';
    errorBox.style.borderRadius = '5px';
    loginView.insertBefore(errorBox, loginView.firstChild);
  }
  errorBox.textContent = 'Invalid username or password.';
}
    });
  };

  logoutButton.onclick = () => {
    if (!username) {
      usernameModal.style.display = 'flex';
      loginView.style.display = 'block';
      registerView.style.display = 'none';
    } else {
      logoutModal.style.display = 'flex';
    }
  };
  logoutConfirm.onclick = () => { localStorage.clear(); username = ''; socket.disconnect(); updateLoginButton(); checkAdmin(); location.reload(); };
  logoutCancel.onclick = () => { logoutModal.style.display = 'none'; };

  clearChatButton.onclick = () => {
  const userInfo = JSON.parse(localStorage.getItem('user'));
  const confirmModal = document.getElementById('confirmModal');
  const confirmText = document.getElementById('confirmText');
  const confirmYes = document.getElementById('confirmYes');
  const confirmNo = document.getElementById('confirmNo');

  confirmText.textContent = "Are you sure you want to clear the chat history?";
  confirmModal.style.display = 'flex';

  // Style Yes/No buttons
  confirmYes.style.backgroundColor = 'green';
  confirmYes.style.color = 'white';
  confirmNo.style.backgroundColor = 'red';
  confirmNo.style.color = 'white';

  confirmYes.onclick = async () => {
    confirmModal.style.display = 'none';
    await fetch('/admin/clear-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-username': userInfo.username }
    });
  };

  confirmNo.onclick = () => {
    confirmModal.style.display = 'none';
  };
};

  socket.on('clearChat', () => { chat.innerHTML = ''; appendMessage('Chat was cleared.', 'system'); });

  moderateButton.onclick = () => { window.open('/admin.html', '_blank'); };
  accountButton.onclick = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.username) {
      alert('You must be logged in to access account settings.');
      return;
    }
    window.location.href = `account.html?user=${encodeURIComponent(user.username)}`;
  };

emojiButton.onclick = () => {
  if (!username) return messageInput.focus();

  // Close GIF popup if open
  gifPopup.style.display = 'none';
  gifSearchInput.value = '';
  gifResults.innerHTML = ''; // ? clear GIF results too

  // Toggle Emoji popup
  emojiPopup.style.display = emojiPopup.style.display === 'flex' ? 'none' : 'flex';
  if (emojiPopup.style.display === 'flex') {
    emojiPickerDiv.innerHTML = '';
    new EmojiMart.Picker({
      onEmojiSelect: (emoji) => {
        if (messageInput) messageInput.value += emoji.native;
      },
      parent: emojiPickerDiv
    });
  }
};


  emojiClose.onclick = () => { emojiPopup.style.display = 'none'; };

gifSearchButton.onclick = () => {
  if (!username) { 
    usernameModal.style.display = 'flex'; 
    return; 
  }

  // Close Emoji popup if open
  emojiPopup.style.display = 'none';

  const query = gifSearchInput.value.trim();
  if (!query) return;

  gifPopup.style.display = 'flex';
  gifResults.innerHTML = 'Loading...';

  fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${config.tenorKey}&limit=25`)
    .then(res => res.json())
    .then(data => {
      gifResults.innerHTML = '';
      if (data.results?.length > 0) {
        data.results.forEach(gif => {
          const gifURL = gif.media_formats.gif?.url || gif.media_formats.mediumgif?.url || gif.media_formats.tinygif?.url;
          if (!gifURL) return;
          const img = document.createElement('img');
          img.src = gifURL;
          img.style.cursor = 'pointer';
          img.onclick = () => {
  socket.emit('chatMessage', { message: gifURL, isGif: true, replyTo });
  gifPopup.style.display = 'none';
  gifResults.innerHTML = '';
  gifSearchInput.value = '';
  messageInput.value = '';
  replyTo = null;

  setTimeout(() => {
    chat.scrollTop = chat.scrollHeight;
  }, 50);
};
          gifResults.appendChild(img);
        });
      } else {
        gifResults.innerHTML = 'No GIFs found.';
      }
    })
    .catch(() => { gifResults.innerHTML = 'Error loading GIFs.'; });
};

  gifSearchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); gifSearchButton.click(); } });
  gifClose.onclick = () => { gifPopup.style.display = 'none'; };

  function appendMessage(text, type = 'message') {
    const div = document.createElement('div');
    div.className = 'message ' + type;
    div.innerHTML = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }
  
  function getInitials(name) {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}


function renderMessage(data) {
  let msgElement = document.querySelector(`[data-id="${data.id}"]`);
  if (!msgElement) {
    msgElement = document.createElement('div');
    msgElement.className = 'message';
    msgElement.dataset.id = data.id;
    chat.appendChild(msgElement);
  }

  if (data.deleted) {
    msgElement.innerHTML = `<span class="deleted-message">Message deleted (by ${data.deletedBy || 'unknown'})</span>`;
    return;
  }

  let replyHTML = '';
  if (data.replyTo) {
    replyHTML = `
      <div class="reply-message">
        <strong>${data.replyTo.username}</strong> said:<br>
        ${data.replyTo.type === 'gif'
          ? `<img src="${data.replyTo.content}" style="max-width:50px;">`
          : `<i>${data.replyTo.content}</i>`}
      </div>`;
  }

  // Assign user class for color
  let userClass = data.username === username ? 'username-self' : 'username-other';
  const matchedUser = usersData.find(u => u.username === data.username);
  if (adminUsers.includes(data.username)) userClass = 'admin-user';
  else if (matchedUser && matchedUser.role === 'moderator') userClass = 'moderator-user';

  // Construct full message HTML
  msgElement.innerHTML = `
    <div class="msg-wrapper">
      <div class="msg-header">
        ${data.avatar 
          ? `<img class="avatar" src="${data.avatar}">` 
          : `<div class="avatar fallback">${(data.username[0] || '?').toUpperCase()}</div>`}
        <span class="${userClass}">${data.username}</span>
      </div>
      ${replyHTML}
      <div class="msg-content">
        ${data.isGif ? `<img src="${data.message}" class="chat-gif">` : data.message}
      </div>
      <div class="msg-actions"></div>
    </div>
  `;

  // Add buttons
  const actionsDiv = msgElement.querySelector('.msg-actions');

  const replyBtn = document.createElement('button');
  replyBtn.className = 'reply-btn';
  replyBtn.innerHTML = '<i class="fas fa-reply"></i>';
  replyBtn.onclick = () => {
    replyTo = {
      content: data.message,
      type: data.isGif ? 'gif' : 'text',
      username: data.username
    };
    setReplyPreview(replyTo);
  };
  actionsDiv.appendChild(replyBtn);

  const userInfo = JSON.parse(localStorage.getItem('user'));
  const isAdmin = userInfo && userInfo.role === 'admin';
  const isModerator = userInfo && userInfo.role === 'moderator';

  if (data.username === username || isAdmin || isModerator) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.onclick = () => socket.emit('deleteMessage', data.id);
    actionsDiv.appendChild(deleteBtn);
  }

  chat.scrollTop = chat.scrollHeight;
}



  sendButton.onclick = () => {
    if (!username) { usernameModal.style.display = 'flex'; return; }
    const msg = messageInput.value.trim();
    if (!msg && !replyTo) return;
    socket.emit('chatMessage', { message: msg, replyTo });
    messageInput.value = '';
    emojiPopup.style.display = 'none';
    replyPreview.style.display = 'none';
    replyTo = null;
  };
  messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendButton.click(); } });

  socket.on('systemMessage', (msg) => appendMessage(msg, 'system'));
  socket.on('chatMessage', (data) => renderMessage(data));
  socket.on('updateMessage', (data) => renderMessage(data));

  const usersButton = document.getElementById('usersButton');
  const usersModal = document.getElementById('usersModal');
  const usersListModal = document.getElementById('usersListModal');
  const closeUsersModal = document.getElementById('closeUsersModal');

  if (usersButton) usersButton.onclick = () => { usersModal.style.display = 'flex'; };
  if (closeUsersModal) closeUsersModal.onclick = () => { usersModal.style.display = 'none'; };

  socket.on('userList', (users) => {
    if (usersButton) usersButton.textContent = `Users (${users.length})`;
    if (usersListModal) {
      usersListModal.innerHTML = '';
      users.forEach(u => {
        const li = document.createElement('li');
        const matchedUser = usersData.find(us => us.username === u);
        if (adminUsers.includes(u)) {
          li.className = 'admin-user';
          li.textContent = `${u} (Admin)`;
        } else if (matchedUser && matchedUser.role === 'moderator') {
          li.className = 'moderator-user';
          li.textContent = `${u} (Moderator)`;
        } else if (u === username) {
          li.className = 'username-self';
          li.textContent = `${u} (You)`;
        } else {
          li.className = 'username-other';
          li.textContent = u;
        }
        usersListModal.appendChild(li);
      });
    }
  });

  socket.on('roleUpdated', (newRole) => {
    const userInfo = JSON.parse(localStorage.getItem('user'));
    if (userInfo) {
      userInfo.role = newRole;
      localStorage.setItem('user', JSON.stringify(userInfo));
      checkAdmin();
      fetch('/admin/users')
        .then(res => res.json())
        .then(updatedUsers => {
          usersData.length = 0;
          usersData.push(...updatedUsers);
        });
    }
  });
});
