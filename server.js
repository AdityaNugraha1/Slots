const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const session = require('express-session');
const expressWs = require('express-ws');
const admin = require('firebase-admin');
const serviceAccount = require('./surenjudi103-firebase-adminsdk-xp59q-7a04f91aa8.json');
const bodyParser = require('body-parser');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();
const server = http.createServer(app);
const wsInstance = expressWs(app, server);

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS
}));

const loggedInUsers = new Set();

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }
  res.redirect('/');
}

// Middleware to check if user is admin
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  res.redirect('/');
}

// Add auth check endpoint
app.get('/check-auth', (req, res) => {
  if (req.session.user && req.session.user.role === 'admin') {
    res.json({ isAdmin: true });
  } else {
    res.json({ isAdmin: false });
  }
});

// First, add routes that need protection
app.get('/admin', isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(__dirname + '/public/admin.html');
});

// Block direct access to admin.html
app.use('/admin.html', (req, res) => {
  res.redirect('/');
});

// Then serve static files, but exclude admin.html
app.use(express.static('public', {
  index: false,
  setHeaders: (res, path) => {
    if (path.includes('admin.html')) {
      res.status(403).end();
    }
  }
}));

// Add the root route last
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Update login response to include initial coins
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userRef = db.collection('users').doc(username);
    const doc = await userRef.get();
    if (!doc.exists) {
      return res.status(400).send('User not found');
    }
    const user = doc.data();
    if (user.password === password) {
      req.session.user = { 
        username: username, // Make sure to use the correct username
        role: user.role 
      };
      loggedInUsers.add(username);
      
      console.log('User logged in:', username); // Debug log
      
      req.session.save(() => {
        broadcastUserList();
        if (user.role === 'admin') {
          return res.send({ 
            message: 'Login successful', 
            redirect: '/admin',
            username: username,
            role: user.role
          });
        } else {
          return res.send({ 
            message: 'Login successful', 
            redirect: '/',
            coins: user.coins ?? 0,
            username: username,
            role: user.role
          });
        }
      });
    } else {
      res.status(400).send('Invalid credentials');
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send('Internal server error');
  }
});

app.post('/register', async (req, res) => {
  const { username, password, role } = req.body;
  const userRef = db.collection('users').doc(username);
  const doc = await userRef.get();
  if (doc.exists) {
    return res.status(400).send('User already exists');
  }
  await userRef.set({
    password,
    coins: 0,
    wins: 0,
    losses: 0,
    winPercentage: 30,
    role: role || 'user'
  });
  res.send('Registration successful');
});

app.get('/logout', async (req, res) => {
  if (req.session.user) {
    const username = req.session.user.username;
    loggedInUsers.delete(username);
    await updateActiveStatus(username, false);
    broadcastUserList();
  }
  req.session.destroy();
  res.redirect('/');
});

app.ws('/', (ws, req) => {
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data);

      switch (data.type) {
        case 'connect':
          if (data.username) {
            ws.username = data.username;
            loggedInUsers.add(data.username);
            await updateActiveStatus(data.username, true);
            broadcastUserList();
          }
          break;
        case 'adminConnect':
          if (data.username) {
            ws.username = data.username;
            loggedInUsers.add(data.username);
            await updateActiveStatus(data.username, true);
            await sendUserList(ws); // Send user list to admin on connect
          }
          break;
        case 'spin':
          if (data.username) {
            await handleSpin(ws, data.username, data.betAmount);
          } else {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Not logged in' 
            }));
          }
          break;
        case 'updateWinPercentage':
          await updateWinPercentage(data.username, data.winPercentage);
          break;
        case 'logout':
          await logoutUser(ws, data.username);
          break;
        case 'updateUserVariable':
          await updateUserVariable(data.username, data.variable, data.value);
          break;
        // ... other cases ...
      }
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Internal server error' 
      }));
    }
  });

  ws.on('close', async () => {
    if (ws.username) {
      loggedInUsers.delete(ws.username);
      await updateActiveStatus(ws.username, false);
      broadcastUserList();
    }
  });
});

// Endpoint to update user role
app.post('/update-role', isAuthenticated, isAdmin, async (req, res) => {
  const { username, role } = req.body;
  try {
    const userRef = db.collection('users').doc(username);
    const doc = await userRef.get();
    if (!doc.exists) {
      return res.status(400).send('User not found');
    }
    await userRef.update({ role });
    broadcastUserList();
    res.send('Role updated successfully');
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).send('Internal server error');
  }
});

let isRolling = false;

app.post('/roll', (req, res) => {
  if (isRolling) {
    return res.status(400).send('Roll in progress');
  }
  isRolling = true;

  // Simulate roll process
  setTimeout(() => {
    // ...existing roll logic...
    isRolling = false;
    res.send('Roll result');
  }, 2000); // Adjust the timeout as needed
});

async function registerUser(username, password, role) {
  await db.collection('users').doc(username).set({
    password,
    coins: 200,
    wins: 0,
    losses: 0,
    winPercentage: 30,
    role
  });
  broadcastUserList();
}

async function loginUser(ws, session, username, password) {
  const userDoc = await db.collection('users').doc(username).get();
  if (userDoc.exists && userDoc.data().password === password) {
    ws.username = username;
    session.username = username;
    session.role = userDoc.data().role;
    session.save();
    loggedInUsers.add(username);
    ws.send(JSON.stringify({ type: 'login', success: true, username, role: userDoc.data().role }));
    broadcastUserList();
  } else {
    ws.send(JSON.stringify({ type: 'login', success: false }));
  }
}

const iconMap = ["banana", "seven", "cherry", "plum", "orange", "bell", "bar", "lemon", "melon"];
const SYMBOL_MULTIPLIERS = {
  'banana': 1.5,  // Buah memberikan 1.5x
  'cherry': 1.5,  // Buah memberikan 1.5x
  'plum': 1.5,    // Buah memberikan 1.5x
  'orange': 1.5,  // Buah memberikan 1.5x
  'lemon': 1.5,   // Buah memberikan 1.5x
  'melon': 1.5,   // Buah memberikan 1.5x
  'seven': 4,     // Seven memberikan 4x
  'bar': 7,       // Bar memberikan 7x
  'bell': 2       // Bell memberikan 2x
};

async function handleSpin(ws, username, betAmount) {
  if (!username) {
    return ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
  }

  try {
    const userRef = db.collection('users').doc(username);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return ws.send(JSON.stringify({ type: 'error', message: 'User not found' }));
    }

    const userData = userDoc.data();
    const winPercentage = Math.min(Math.max(parseFloat(userData.winPercentage) || 0, 0), 100);
    betAmount = parseInt(betAmount);
    
    if (userData.coins < betAmount) {
      return ws.send(JSON.stringify({ type: 'error', message: 'Not enough coins' }));
    }

    // Kurangi coins dengan betAmount
    const updatedCoins = userData.coins - betAmount;
    await userRef.update({ coins: updatedCoins });

    // Random win check berdasarkan winPercentage
    const isWin = Math.random() * 100 < winPercentage;

    let symbols = Array(3).fill(0).map(() => Math.floor(Math.random() * iconMap.length));
    let result = 'lose';
    let multiplier = 0;
    let combination = null;

    if (isWin) {
      // Jika menang, pilih satu simbol secara random untuk semua reel
      const winningSymbolIndex = Math.floor(Math.random() * iconMap.length);
      symbols = Array(3).fill(winningSymbolIndex);
      const winningSymbol = iconMap[winningSymbolIndex];
      multiplier = SYMBOL_MULTIPLIERS[winningSymbol];
      result = 'win';
      const winAmount = Math.floor(betAmount * multiplier);
      combination = {
        type: 'three_of_a_kind',
        symbol: winningSymbol,
        message: `Triple ${winningSymbol}! Win ${winAmount} coins!` // Removed "win!" prefix
      };
    }

    const winAmount = result === 'win' ? Math.floor(betAmount * multiplier) : 0;
    const newCoins = updatedCoins + winAmount;

    await userRef.update({
      coins: newCoins,
      wins: result === 'win' ? userData.wins + 1 : userData.wins,
      losses: result === 'lose' ? userData.losses + 1 : userData.losses
    });

    ws.send(JSON.stringify({
      type: 'spinResult',
      result,
      newCoins,
      combination,
      symbols, // Kirim array indeks simbol
      username,
      betAmount,
      multiplier,
      winAmount
    }));

    broadcastUserList();
  } catch (error) {
    console.error('Spin error:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Error processing spin' }));
  }
}

async function sendUserList(ws) {
  const usersSnapshot = await db.collection('users').get();
  const users = usersSnapshot.docs.map(doc => ({
    username: doc.id,
    ...doc.data(),
    active: loggedInUsers.has(doc.id)
  }));
  ws.send(JSON.stringify({ type: 'userList', users }));
}

async function updateWinPercentage(username, winPercentage) {
  const userRef = db.collection('users').doc(username);
  const validWinPercentage = Math.min(Math.max(parseFloat(winPercentage), 0), 100);
  await userRef.update({ winPercentage: validWinPercentage });
  broadcastUserList();
}

async function logoutUser(ws, username) {
  if (username) {
    loggedInUsers.delete(username);
    ws.username = null;
    await updateActiveStatus(username, false);
    broadcastUserList();
    ws.send(JSON.stringify({ type: 'logout', success: true }));
  } else {
    ws.send(JSON.stringify({ type: 'logout', success: false }));
  }
}

async function updateUserVariable(username, variable, value) {
  const userRef = db.collection('users').doc(username);
  const updateData = {};
  if (variable === 'coins' && value < 0) {
    value = 0; // Ensure coins cannot be negative
  }
  updateData[variable] = value;
  await userRef.update(updateData);
  broadcastUserList();
}

async function updateActiveStatus(username, isActive) {
  const userRef = db.collection('users').doc(username);
  await userRef.update({ active: isActive });
}

function broadcastUserList() {
  wsInstance.getWss().clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      sendUserList(client);
    }
  });
}

server.listen(3000, () => {
  console.log('Server is listening on port 3000');
});
