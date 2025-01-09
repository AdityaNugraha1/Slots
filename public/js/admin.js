let ws;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('/check-auth');
    const data = await response.json();
    
    if (!data.isAdmin) {
      window.location.replace('/');
      return;
    }
    
    initializeWebSocket();
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.replace('/');
  }
});

function initializeWebSocket() {
  ws = new WebSocket('ws://localhost:3000');

  ws.onopen = () => {
    console.log('WebSocket connected');
    const username = localStorage.getItem('username');
    if (username) {
      ws.send(JSON.stringify({
        type: 'adminConnect',
        username: username
      }));
    }
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('Received message:', data);
      
      if (data.type === 'userList') {
        populateUserTable(data.users);
      } else if (data.type === 'error') {
        console.error('WebSocket error:', data.message);
        if (data.message === 'Unauthorized access') {
          window.location.replace('/');
        }
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected. Reconnecting...');
    setTimeout(initializeWebSocket, 1000);
  };
}

function populateUserTable(users) {
  const userTable = document.getElementById('userTable');
  const currentUsername = localStorage.getItem('username');
  userTable.innerHTML = '';
  users.forEach(user => {
    const coins = user.coins !== undefined ? user.coins : 200;
    const wins = user.wins !== undefined ? user.wins : 0;
    const losses = user.losses !== undefined ? user.losses : 0;
    const winPercentage = user.winPercentage !== undefined ? user.winPercentage : 30;
    const password = user.password || '';
    userTable.innerHTML += `
      <tr>
        <td style="width: 11%">${user.username}</td>
        <td style="width: 11%" contenteditable="true" onblur="updateUserVariable('${user.username}', 'password', this.innerText)">${password}</td>
        <td style="width: 11%" contenteditable="true" onblur="updateUserVariable('${user.username}', 'coins', this.innerText)">${coins}</td>
        <td style="width: 8%" contenteditable="true" onblur="updateUserVariable('${user.username}', 'wins', this.innerText)">${wins}</td>
        <td style="width: 8%" contenteditable="true" onblur="updateUserVariable('${user.username}', 'losses', this.innerText)">${losses}</td>
        <td style="width: 12%" contenteditable="true" onblur="updateUserVariable('${user.username}', 'winPercentage', this.innerText)">${winPercentage}%</td>
        <td style="width: 8%">${user.active ? 'Yes' : 'No'}</td>
        <td style="width: 11%">
          <select onchange="updateUserRole('${user.username}', this.value)">
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </td>
        <td style="width: 20%">
          ${user.username !== currentUsername ? 
            `<button onclick="deleteUser('${user.username}')" style="background-color: #ff4444; width: auto; min-width: 80px;">Delete</button>` : 
            '<button disabled style="background-color: #cccccc; width: auto;">Cannot Delete</button>'
          }
        </td>
      </tr>
    `;
  });
}

function updateUserVariable(username, variable, value) {
  // Remove parseFloat for non-numeric variables
  let validValue = value;
  
  if (variable === 'winPercentage' || variable === 'coins') {
    validValue = parseFloat(value);
    
    if (variable === 'winPercentage') {
      validValue = Math.min(Math.max(validValue, 0), 100);
    } else if (variable === 'coins') {
      if (validValue < 0) {
        alert("Negative coins value detected. Setting to 0.");
        validValue = 0;
      }
    }
  }
  
  // Immediately update the display value if it was modified
  if (variable === 'coins' && validValue === 0) {
    const cell = document.querySelector(`td[contenteditable="true"][onblur="updateUserVariable('${username}', 'coins', this.innerText)"]`);
    if (cell) {
      cell.innerText = '0';
    }
  }
  
  ws.send(JSON.stringify({ 
    type: 'updateUserVariable', 
    username: username, 
    variable: variable, 
    value: validValue 
  }));
}

function updateUserRole(username, role) {
  fetch('/update-role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, role })
  })
  .then(response => response.text())
  .then(result => {
    alert(result);
  })
  .catch(error => {
    console.error('Error updating role:', error);
    alert('Failed to update role');
  });
}

async function logout() {
  const username = localStorage.getItem('username');
  if (username) {
    ws.send(JSON.stringify({ type: 'logout', username }));
  }
  localStorage.removeItem('username');
  await fetch('/logout');
  window.location.href = '/';
}
