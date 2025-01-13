let eventSource;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('/check-auth');
    const data = await response.json();
    
    if (!data.isAdmin) {
      window.location.replace('/');
      return;
    }
    
    // Fetch initial user list
    const usersResponse = await fetch('/admin/users');
    const usersData = await usersResponse.json();
    populateUserTable(usersData.users);
    
    initializeEventSource();
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.replace('/');
  }
});

function initializeEventSource() {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource('/events');
  
  eventSource.onopen = () => {
    console.log('SSE Connected');
  };

  // Listen for userList updates
  eventSource.addEventListener('userList', (e) => {
    try {
      const data = JSON.parse(e.data);
      console.log('Received user list update:', data);
      if (data.users) {
        requestAnimationFrame(() => {
          populateUserTable(data.users);
        });
      }
    } catch (error) {
      console.error('Error handling user list:', error);
    }
  });

  // Listen for spinResult updates
  eventSource.addEventListener('spinResult', (e) => {
    try {
      const data = JSON.parse(e.data);
      console.log('Received spin result:', data);
      if (data.username && data.newCoins !== undefined) {
        // Update coins cell for the specific user
        const coinsCell = document.querySelector(`td[onblur="updateUserVariable('${data.username}', 'coins', this.innerText)"]`);
        if (coinsCell) {
          coinsCell.innerText = data.newCoins;
        }
      }
    } catch (error) {
      console.error('Error handling spin result:', error);
    }
  });

  // Enhanced error handling
  eventSource.addEventListener('error', (e) => {
    console.error('SSE Error:', e);
    eventSource.close();
    setTimeout(initializeEventSource, 1000);
  });
}

// Update updateUserVariable to avoid page refresh
async function updateUserVariable(username, variable, value) {
  try {
    let processedValue = value.toString().replace('%', '');
    
    if (variable === 'winPercentage' || variable === 'coins' || variable === 'wins' || variable === 'losses') {
      processedValue = parseFloat(processedValue);
      if (isNaN(processedValue)) {
        throw new Error('Invalid number value');
      }
    }

    const response = await fetch('/updateUserVariable', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        username, 
        variable, 
        value: processedValue 
      })
    });

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Update failed');
    }

    // Update cell immediately with the confirmed value
    const cell = document.querySelector(`td[onblur="updateUserVariable('${username}', '${variable}', this.innerText)"]`);
    if (cell) {
      const displayValue = variable === 'winPercentage' ? 
        `${data.updatedValue}%` : 
        data.updatedValue;
      cell.innerText = displayValue;
    }

  } catch (error) {
    console.error('Error updating user variable:', error);
    alert(`Failed to update ${variable}: ${error.message}`);
  }
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
    await fetch('/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
  }
  localStorage.removeItem('username');
  window.location.href = '/';
}
