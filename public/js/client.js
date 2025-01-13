const iconMap = ["banana", "seven", "cherry", "plum", "orange", "bell", "bar", "lemon", "melon"];
const iconHeight = 79;
const numIcons = iconMap.length;
let indexes = [0, 0, 0];
let isSpinning = false; // Single declaration for the entire file
let autoSpinCount = 0;
let autoSpinInterval;
let isAutoSpinning = false; // New state tracker for auto spin mode

// Replace WebSocket with EventSource
const eventSource = new EventSource('/events');

eventSource.onopen = () => {
  console.log('SSE Connected');
  const username = localStorage.getItem('username');
  if (username) {
    fetch('/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
  }
};

// Convert ws.onmessage handlers to SSE event listeners
eventSource.addEventListener('spinResult', (e) => {
  const data = JSON.parse(e.data);
  handleSpinResult(data);
});

eventSource.addEventListener('error', (e) => {
  console.error('SSE Error:', e);
  setTimeout(() => {
    // Attempt to reconnect
    new EventSource('/events');
  }, 1000);
});

// Add userList event listener
eventSource.addEventListener('userList', (e) => {
  try {
    const data = JSON.parse(e.data);
    console.log('Received user list update:', data);
    if (data.users) {
      // Update displayed coins for current user
      const currentUser = data.users.find(u => u.username === localStorage.getItem('username'));
      if (currentUser) {
        document.getElementById('coins').innerText = currentUser.coins;
      }
    }
  } catch (error) {
    console.error('Error handling user list:', error);
  }
});

// Add userUpdate event listener
eventSource.addEventListener('userUpdate', (e) => {
  try {
    const data = JSON.parse(e.data);
    console.log('Received user update:', data);
    
    const currentUsername = localStorage.getItem('username');
    if (data.username === currentUsername) {
      // Update specific field based on variable that changed
      if (data.variable === 'coins') {
        const coinsElement = document.getElementById('coins');
        if (coinsElement) {
          requestAnimationFrame(() => {
            coinsElement.innerText = data.value;
          });
        }
      }
      
      // You can add other variable updates here if needed
      // For example wins, losses etc.
    }
  } catch (error) {
    console.error('Error handling user update:', error);
  }
});

// Update existing userList event listener
eventSource.addEventListener('userList', (e) => {
  try {
    const data = JSON.parse(e.data);
    console.log('Received user list update:', data);
    if (data.users) {
      const currentUsername = localStorage.getItem('username');
      const currentUser = data.users.find(u => u.username === currentUsername);
      if (currentUser) {
        requestAnimationFrame(() => {
          document.getElementById('coins').innerText = currentUser.coins;
        });
      }
    }
  } catch (error) {
    console.error('Error handling user list:', error);
  }
});

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
      
      // Send connect message to server
      fetch('/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      
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
    fetch('/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
  }
  localStorage.removeItem('username');
  await fetch('/logout');
  window.location.href = '/';
}

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
  isAutoSpinning = true; // Set auto spin mode
  const autoSpinButton = document.getElementById('autoSpinButton');
  if (autoSpinButton) {
    autoSpinButton.innerText = 'Stop Auto Spin';
    autoSpinButton.style.backgroundColor = 'rgb(255, 0, 0)';
  }
  closeModal();
  autoSpin();
}

function autoSpin() {
  if (isSpinning || !isAutoSpinning) {
    return;
  }

  const currentCoins = parseInt(document.getElementById('coins').innerText);
  const betAmount = parseInt(document.getElementById('betAmount').value);

  if (betAmount > currentCoins) {
    showModal('Auto spin stopped: Not enough coins');
    stopAutoSpin();
    return;
  }

  spin().then((result) => {
    if (result !== false) {
      autoSpinCount--;
    }
  }).catch(() => {
    stopAutoSpin();
  });
}

function stopAutoSpin() {
  clearTimeout(autoSpinInterval);
  autoSpinCount = 0;
  isAutoSpinning = false; // Reset auto spin mode
  resetAutoSpinButton();
}

function resetAutoSpinButton() {
  const autoSpinButton = document.getElementById('autoSpinButton');
  if (autoSpinButton) {
    autoSpinButton.innerText = 'Start Auto Spin';
    autoSpinButton.style.backgroundColor = '#007bff';
  }
}

// Convert ws.send to fetch

async function spin() {
  if (isSpinning) {
    console.log('Still spinning, please wait...');
    return false; // Return false jika tidak bisa spin
  }

  const username = localStorage.getItem('username');
  const betAmount = parseInt(document.getElementById('betAmount').value);
  const currentCoins = parseInt(document.getElementById('coins').innerText);

  // Validasi input
  if (!username || isNaN(betAmount) || betAmount < 1 || betAmount > currentCoins) {
    // ... validasi checks ...
    return false;
  }
  
  try {
    isSpinning = true; // Set lock
    const spinButton = document.querySelector('button[onclick="spin()"]');
    spinButton.disabled = true;
    
    document.getElementById('coins').innerText = currentCoins - betAmount;
    
    const response = await fetch('/spin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, betAmount })
    });
    
    if (!response.ok) {
      throw new Error('Spin failed');
    }

    const result = await response.json();
    handleSpinResult(result);
    return result;

  } catch (error) {
    console.error('Error:', error);
    document.getElementById('coins').innerText = currentCoins;
    showModal(error.message);
    isSpinning = false; // Release lock on error
    return false;
  }
}

// Single handleSpinResult function
function handleSpinResult(data) {
  if (data.type === 'error') {
    showModal(data.message);
    stopAutoSpin();
    isSpinning = false;
    return;
  }

  const resultMessage = document.getElementById('resultMessage');
  const coinsElement = document.getElementById('coins');

  resultMessage.innerText = '';
  resultMessage.style.color = '';
  coinsElement.innerText = data.tempCoins;

  rollAll(data.result === 'win', data.symbols).then(() => {
    setTimeout(() => {
      // Show result
      if (data.combination) {
        resultMessage.innerText = data.combination.message;
        resultMessage.style.color = data.result === 'win' ? 'green' : 'red';
      } else {
        resultMessage.innerText = `You ${data.result}!`;
        resultMessage.style.color = data.result === 'win' ? 'green' : 'red';
      }

      // Handle win/lose animations and updates
      if (data.result === 'win') {
        setTimeout(() => {
          animateCoins(data.tempCoins, data.newCoins);
          
          setTimeout(() => {
            updateServerAndFinish();
          }, 1500);
        }, 1000);
      } else {
        coinsElement.innerText = data.newCoins;
        updateServerAndFinish();
      }
    }, 500);
  });

  function updateServerAndFinish() {
    if (data.shouldUpdateDb) {
      fetch('/updateUserVariable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: localStorage.getItem('username'),
          variable: 'coins',
          value: data.newCoins
        })
      });
    }

    // Reset states
    isSpinning = false;
    const spinButton = document.querySelector('button[onclick="spin()"]');
    if (spinButton) spinButton.disabled = false;

    // Handle auto spin
    if (isAutoSpinning && autoSpinCount > 0) {
      const nextBet = parseInt(document.getElementById('betAmount').value);
      if (nextBet > data.newCoins) {
        showModal('Auto spin stopped: Not enough coins for next spin');
        stopAutoSpin();
      } else {
        autoSpinInterval = setTimeout(autoSpin, 2000);
      }
    } else if (autoSpinCount === 0) {
      // Only stop if we've completed all auto spins
      stopAutoSpin();
    }
  }
}

function handleLoginResponse(data) {
  if (data.success) {
    localStorage.setItem('username', data.username);
    localStorage.setItem('role', data.role);
    document.getElementById('login').style.display = 'none';
    document.getElementById('game').style.display = 'block';
    // Fix: Use the actual coins value or 0 as fallback, not 200
    document.getElementById('coins').innerText = data.coins ?? 0;
    
    fetch('/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: data.username })
    });
  } else {
    showModal('Login failed');
  }
}

// Update handleSpinResult to properly time the coin updates
function handleSpinResult(data) {
  if (data.type === 'error') {
    showModal(data.message);
    stopAutoSpin();
    return;
  }
  
  const spinPromise = rollAll(data.result === 'win', data.symbols);
  const resultMessage = document.getElementById('resultMessage');
  const coinsElement = document.getElementById('coins');

  // Tunggu animasi slot selesai
  spinPromise.then(() => {
    // Tampilkan hasil
    if (data.combination) {
      resultMessage.innerText = data.combination.message;
      resultMessage.style.color = data.result === 'win' ? 'green' : 'red';
    } else {
      resultMessage.innerText = `You ${data.result}!`;
      resultMessage.style.color = data.result === 'win' ? 'green' : 'red';
    }

    // Set timeout untuk delay setelah hasil muncul
    setTimeout(() => {
      // Jika menang, animasikan penambahan coins
      if (data.result === 'win') {
        const currentCoins = parseInt(coinsElement.innerText);
        animateCoins(currentCoins, data.newCoins);
      } else {
        // Jika kalah tidak perlu animasi karena coins sudah dikurangi di awal
        coinsElement.innerText = data.newCoins;
      }

      // Update server setelah animasi selesai
      fetch('/updateUserVariable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: localStorage.getItem('username'),
          variable: 'coins',
          value: data.newCoins
        })
      });

      // Handle auto spin setelah semua animasi selesai
      if (autoSpinCount > 0) {
        const nextBet = parseInt(document.getElementById('betAmount').value);
        if (nextBet > data.newCoins) {
          showModal('Auto spin stopped: Not enough coins for next spin');
          stopAutoSpin();
        } else {
          autoSpinInterval = setTimeout(autoSpin, 2000);
        }
      } else {
        document.getElementById('autoSpinButton').innerText = 'Start Auto Spin';
      }
    }, 500); // Delay 500ms setelah hasil muncul
  });
}

// Update animateCoins function
function animateCoins(start, end) {
  const duration = 2000; // Durasi animasi 1.5 detik untuk gerakan yang lebih halus
  const coinsElement = document.getElementById('coins');
  const startTime = performance.now();
  const difference = end - start;

  function updateCoins(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Menggunakan easeOutExpo untuk efek melambat yang lebih dramatis di akhir
    const easeOutExpo = (x) => {
      return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
    };

    // Menggunakan easing function untuk mendapatkan posisi yang lebih halus
    const currentValue = Math.round(start + (difference * easeOutExpo(progress)));
    
    // Memastikan nilai tetap dalam range yang benar
    if (difference > 0) { // Saat menang
      coinsElement.innerText = Math.min(currentValue, end);
    } else { // Saat kalah
      coinsElement.innerText = Math.max(currentValue, end);
    }

    if (progress < 1) {
      requestAnimationFrame(updateCoins);
    } else {
      // Pastikan nilai akhir tepat
      setTimeout(() => {
        coinsElement.innerText = end;
      }, 50); // Delay kecil untuk memastikan transisi halus
    }
  }

  requestAnimationFrame(updateCoins);
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
  isAutoSpinning = false; // Reset auto spin mode
  resetAutoSpinButton();
}

async function spin() {
  if (isSpinning) {
    console.log('Still spinning, please wait...');
    return false;
  }

  const username = localStorage.getItem('username');
  const betAmount = parseInt(document.getElementById('betAmount').value);
  const currentCoins = parseInt(document.getElementById('coins').innerText);

  if (!username || isNaN(betAmount) || betAmount < 1) {
    showModal(!username ? 'Please login first' : 'Invalid bet amount');
    stopAutoSpin();
    return false;
  }

  if (betAmount > currentCoins) {
    showModal('Not enough coins');
    stopAutoSpin();
    return false;
  }
  
  try {
    isSpinning = true;
    const spinButton = document.querySelector('button[onclick="spin()"]');
    if (spinButton) spinButton.disabled = true;
    
    // Kurangi coins sebelum spin
    document.getElementById('coins').innerText = currentCoins - betAmount;
    
    const response = await fetch('/spin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, betAmount })
    });
    
    if (!response.ok) {
      throw new Error('Spin failed');
    }

    return await response.json();

  } catch (error) {
    console.error('Error:', error);
    document.getElementById('coins').innerText = currentCoins;
    showModal(error.message);
    completeSpinCycle();
    return false;
  }
}

function completeSpinCycle() {
  isSpinning = false;
  const spinButton = document.querySelector('button[onclick="spin()"]');
  if (spinButton) spinButton.disabled = false;
}

function handleSpinResult(data) {
  if (data.type === 'error') {
    showModal(data.message);
    stopAutoSpin();
    completeSpinCycle();
    return;
  }

  const resultMessage = document.getElementById('resultMessage');
  const coinsElement = document.getElementById('coins');

  resultMessage.innerText = '';
  resultMessage.style.color = '';
  coinsElement.innerText = data.tempCoins;

  // Langkah 1: Animasi slot
  rollAll(data.result === 'win', data.symbols).then(() => {
    // Langkah 2: Tampilkan hasil
    setTimeout(() => {
      if (data.combination) {
        resultMessage.innerText = data.combination.message;
        resultMessage.style.color = data.result === 'win' ? 'green' : 'red';
      } else {
        resultMessage.innerText = `You ${data.result}!`;
        resultMessage.style.color = data.result === 'win' ? 'green' : 'red';
      }

      // Langkah 3: Update coins
      if (data.result === 'win') {
        setTimeout(() => {
          animateCoins(data.tempCoins, data.newCoins);
          
          setTimeout(() => {
            if (data.shouldUpdateDb) {
              updateServer();
            }
            finishSpin();
          }, 1500);
        }, 1000);
      } else {
        coinsElement.innerText = data.newCoins;
        if (data.shouldUpdateDb) {
          updateServer();
        }
        finishSpin();
      }
    }, 500);
  });

  function updateServer() {
    fetch('/updateUserVariable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: localStorage.getItem('username'),
        variable: 'coins',
        value: data.newCoins
      })
    });
  }

  function finishSpin() {
    completeSpinCycle();
    
    // Only schedule next spin if still in auto spin mode
    if (isAutoSpinning && autoSpinCount > 0) {
      const nextBet = parseInt(document.getElementById('betAmount').value);
      if (nextBet > data.newCoins) {
        showModal('Auto spin stopped: Not enough coins for next spin');
        stopAutoSpin();
      } else {
        autoSpinInterval = setTimeout(autoSpin, 2000);
      }
    } else {
      stopAutoSpin(); // Ensure auto spin is stopped and button is reset
    }
  }
}
