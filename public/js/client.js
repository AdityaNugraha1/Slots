const iconMap = ["banana", "seven", "cherry", "plum", "orange", "bell", "bar", "lemon", "melon"];
const iconHeight = 79;
const numIcons = iconMap.length;
let indexes = [0, 0, 0];

const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('WebSocket connected');
  const username = localStorage.getItem('username');
  if (username) {
    ws.send(JSON.stringify({ type: 'connect', username }));
  }
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
  switch (data.type) {
    case 'login':
      handleLoginResponse(data);
      break;
    case 'spinResult':
      handleSpinResult(data);
      break;
    case 'error':
      alert(data.message);
      break;
  }
};

function showModal(message, showInput = false) {
  const modal = document.getElementById('modal');
  const modalMessage = document.getElementById('modalMessage');
  const modalInput = document.getElementById('modalInput');
  
  if (!modal || !modalMessage) {
    console.error('Modal elements not found');
    alert(message); // Fallback to alert if modal not found
    return;
  }
  
  modalMessage.innerText = message;
  if (modalInput) {
    modalInput.style.display = showInput ? 'block' : 'none';
  }
  modal.style.display = 'block';
}

function closeModal() {
  const modal = document.getElementById('modal');
  const modalInput = document.getElementById('modalInput');
  
  if (modal) {
    modal.style.display = 'none';
  }
  if (modalInput) {
    modalInput.style.display = 'none';
  }
}

window.onclick = function(event) {
  const modal = document.getElementById('modal');
  if (event.target == modal) {
    modal.style.display = 'none';
  }
}

async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (response.ok) {
      const result = await response.json();
      localStorage.setItem('username', username);
      
      // Send connect message to WebSocket
      ws.send(JSON.stringify({ 
        type: 'connect',
        username: username 
      }));
      
      if (result.redirect === '/') {
        document.getElementById('login').style.display = 'none';
        document.getElementById('game').style.display = 'block';
        if (result.coins) {
          document.getElementById('coins').innerText = result.coins;
        }
      } else {
        window.location.href = result.redirect;
      }
    } else {
      const error = await response.text();
      showModal(error || 'Login failed');
    }
  } catch (error) {
    console.error('Login error:', error);
    showModal('Login failed');
  }
}

async function register() {
  const username = document.getElementById('regUsername').value;
  const password = document.getElementById('regPassword').value;
  const role = 'user'; // Default role is user
  const response = await fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role })
  });
  if (response.ok) {
    const result = await response.text();
    showModal(result);
    showLogin();
  } else {
    showModal('Registration failed');
  }
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

let autoSpinCount = 0;
let autoSpinInterval;

function toggleAutoSpin() {
  const autoSpinButton = document.getElementById('autoSpinButton');
  if (autoSpinCount > 0) {
    // Just stop the auto spin without showing modal
    stopAutoSpin();
  } else {
    // Show modal only when starting auto spin
    showAutoSpinModal();
  }
}

function showAutoSpinModal() {
  const modal = document.getElementById('modal');
  const modalMessage = document.getElementById('modalMessage');
  const modalInput = document.getElementById('modalInput');
  
  if (!modal || !modalMessage || !modalInput) {
    console.error('Modal elements not found');
    return;
  }
  
  modalMessage.innerText = "Enter the number of auto spins:";
  modalInput.style.display = 'block';
  modal.style.display = 'block';
}

function startAutoSpin() {
  const count = parseInt(document.getElementById('autoSpinCount').value);
  if (isNaN(count) || count <= 0) {
    showModal("Please enter a valid number of spins.");
    return;
  }
  
  autoSpinCount = count;
  const autoSpinButton = document.getElementById('autoSpinButton');
  if (autoSpinButton) {
    autoSpinButton.innerText = 'Stop Auto Spin';
  }
  closeModal();
  autoSpin();
}

function autoSpin() {
  if (autoSpinCount > 0) {
    spin();
    autoSpinCount--;
  } else {
    document.getElementById('autoSpinButton').innerText = 'Start Auto Spin';
  }
}

function stopAutoSpin() {
  clearTimeout(autoSpinInterval);
  autoSpinCount = 0;
  const autoSpinButton = document.getElementById('autoSpinButton');
  if (autoSpinButton) {
    autoSpinButton.innerText = 'Start Auto Spin';
  }
}

function spin() {
  const username = localStorage.getItem('username');
  const betAmount = parseInt(document.getElementById('betAmount').value);
  const currentCoins = parseInt(document.getElementById('coins').innerText);

  if (!username) {
    showModal('Please login first');
    stopAutoSpin();
    return;
  }

  if (isNaN(betAmount) || betAmount < 1) {
    showModal('Please enter a valid bet amount');
    stopAutoSpin();
    return;
  }

  if (betAmount > currentCoins) {
    showModal('Not enough coins');
    stopAutoSpin(); // Stop auto spin when coins run out
    document.getElementById('autoSpinButton').innerText = 'Start Auto Spin';
    return;
  }
  
  // Deduct bet amount from displayed coins immediately
  document.getElementById('coins').innerText = currentCoins - betAmount;
  
  const spinButton = document.querySelector('button[onclick="spin()"]');
  spinButton.disabled = true;
  
  ws.send(JSON.stringify({ 
    type: 'spin',
    username: username,
    betAmount: betAmount
  }));
  
  setTimeout(() => {
    spinButton.disabled = false;
  }, 1500);
}

function handleLoginResponse(data) {
  if (data.success) {
    localStorage.setItem('username', data.username);
    localStorage.setItem('role', data.role);
    document.getElementById('login').style.display = 'none';
    document.getElementById('game').style.display = 'block';
    // Fix: Use the actual coins value or 0 as fallback, not 200
    document.getElementById('coins').innerText = data.coins ?? 0;
    
    ws.send(JSON.stringify({ 
      type: 'connect',
      username: data.username 
    }));
  } else {
    showModal('Login failed');
  }
}

function handleSpinResult(data) {
  if (data.type === 'error') {
    showModal(data.message);
    stopAutoSpin(); // Stop auto spin on any error
    return;
  }
  
  rollAll(data.result === 'win', data.symbols).then(() => {
    document.getElementById('coins').innerText = data.newCoins;
    const resultMessage = document.getElementById('resultMessage');
    
    if (data.combination) {
      resultMessage.innerText = data.combination.message; // Just show the message without result prefix
      resultMessage.style.color = data.result === 'win' ? 'green' : 'red';
    } else {
      resultMessage.innerText = `You ${data.result}!`;
      resultMessage.style.color = data.result === 'win' ? 'green' : 'red';
    }
    
    if (autoSpinCount > 0) {
      // Check if we have enough coins for next spin before continuing
      const nextBet = parseInt(document.getElementById('betAmount').value);
      const currentCoins = parseInt(document.getElementById('coins').innerText);
      
      if (nextBet > currentCoins) {
        showModal('Auto spin stopped: Not enough coins for next spin');
        stopAutoSpin();
      } else {
        autoSpinInterval = setTimeout(autoSpin, 2000);
      }
    } else {
      document.getElementById('autoSpinButton').innerText = 'Start Auto Spin';
    }
  });
}

async function rollAll(forceWin, symbols) {
  const reels = document.querySelectorAll(".reel");
  const debugEl = document.getElementById("debug");
  
  debugEl.textContent = "Rolling...";
  resultMessage.innerText = '';

  // Mulai putaran secara berurutan dengan jeda
  for (let i = 0; i < reels.length; i++) {
    await new Promise(resolve => setTimeout(resolve, 200 * i)); // Beri jeda antar reel
    rollReel(reels[i], i, symbols[i]);
  }
  
  // Tunggu semua animasi selesai
  return new Promise(resolve => {
    const totalDuration = 4500; // Durasi total termasuk jeda
    setTimeout(() => {
      indexes = [...symbols];
      debugEl.textContent = symbols.map(i => iconMap[i]).join(" - ");
      resolve();
    }, totalDuration);
  });
}

function rollReel(reel, index, targetIndex) {
  return new Promise((resolve) => {
    // Tambah variasi jumlah putaran untuk setiap reel
    const spins = 3 + Math.floor(Math.random() * 3);
    // Tambah variasi kecepatan untuk setiap reel
    const duration = 3000 + (Math.random() * 1000);
    
    const currentPosition = parseInt(reel.style.backgroundPositionY) || 0;
    let totalRotation = currentPosition + (spins * numIcons * iconHeight);
    
    // Pastikan posisi akhir sesuai dengan simbol yang ditentukan server
    const finalPosition = targetIndex * iconHeight;
    totalRotation = Math.floor(totalRotation / (numIcons * iconHeight)) * (numIcons * iconHeight) + finalPosition;

    reel.style.transition = `background-position-y ${duration}ms cubic-bezier(0.85, 0.05, 0.55, 0.98)`;
    reel.style.backgroundPositionY = `${totalRotation}px`;

    setTimeout(() => {
      indexes[index] = targetIndex;
      resolve();
    }, duration + 100);
  });
}

function animateSlots(indexes) {
  const reels = document.querySelectorAll(".reel");
  const iconHeight = 79;
  const numIcons = 9;

  reels.forEach((reel, i) => {
    const currentPosition = parseInt(reel.style.backgroundPositionY) || 0;
    const targetPosition = indexes[i] * iconHeight;
    const distance = targetPosition - currentPosition;
    const duration = 1500;
    const startTime = performance.now();

    function animate(time) {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const position = currentPosition + distance * progress;
      reel.style.backgroundPositionY = `${position}px`;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        reel.style.backgroundPositionY = `${targetPosition}px`;
      }
    }

    requestAnimationFrame(animate);
  });
}

function showRegister() {
  document.getElementById('login').style.display = 'none';
  document.getElementById('register').style.display = 'block';
}

function showLogin() {
  document.getElementById('register').style.display = 'none';
  document.getElementById('login').style.display = 'block';
}

function updateUserList(users) {
  // Update the user list in the client if needed
}

let isRolling = false;

document.addEventListener('DOMContentLoaded', () => {
  const rollButton = document.getElementById('rollButton');
  if (rollButton) {
    rollButton.addEventListener('click', () => {
      if (isRolling) {
        showModal('Roll in progress');
        return;
      }
      isRolling = true;

      fetch('/roll', {
        method: 'POST'
      }).then(response => response.text())
        .then(result => {
          isRolling = false;
          const resultEl = document.getElementById('result');
          if (resultEl) resultEl.innerText = result;
        }).catch(error => {
          isRolling = false;
          console.error('Error:', error);
        });
    });
  }

  // Initialize other elements and event listeners
  initializeModalElements();
});

// Add function to initialize modal elements
function initializeModalElements() {
  const modal = document.getElementById('modal');
  const modalMessage = document.getElementById('modalMessage');
  const modalInput = document.getElementById('modalInput');
  const autoSpinCount = document.getElementById('autoSpinCount');

  // Remove event listener from autoSpinButton to prevent double binding
  const autoSpinButton = document.getElementById('autoSpinButton');
  if (autoSpinButton) {
    // Remove old click listener and use the button's onclick attribute instead
    autoSpinButton.removeEventListener('click', toggleAutoSpin);
  }
  
  // Close modal on outside click
  if (modal) {
    window.onclick = function(event) {
      if (event.target === modal) {
        closeModal();
      }
    };
  }
}

function toggleAutoSpin() {
  const autoSpinButton = document.getElementById('autoSpinButton');
  
  // If currently spinning, just stop
  if (autoSpinCount > 0) {
    stopAutoSpin();
    return;
  }
  
  // Only show modal when starting new auto spin
  showAutoSpinModal();
}

function stopAutoSpin() {
  clearTimeout(autoSpinInterval);
  autoSpinCount = 0;
  const autoSpinButton = document.getElementById('autoSpinButton');
  if (autoSpinButton) {
    autoSpinButton.innerText = 'Start Auto Spin';
  }
}
