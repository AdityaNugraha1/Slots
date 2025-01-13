const express = require('express');
const http = require('http');
const session = require('express-session');
const admin = require('firebase-admin');
const serviceAccount = require('./surenjudi103-firebase-adminsdk-xp59q-7a04f91aa8.json');
const bodyParser = require('body-parser');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();
const server = http.createServer(app);

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
const clients = new Set();

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
      
      const response = user.role === 'admin' ? {
        message: 'Login successful',
        redirect: '/admin',
        username: username,
        role: user.role
      } : {
        message: 'Login successful',
        redirect: '/',
        coins: user.coins ?? 0,
        username: username,
        role: user.role
      };
      
      res.json(response);
      // Broadcast user list update after sending response
      broadcastUserList();
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

// Replace WebSocket with SSE endpoint
app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Add client to Set
  clients.add(res);

  // Remove client on connection close
  req.on('close', () => {
    clients.delete(res);
  });
});

// Add new endpoint to get initial user list for admin
app.get('/admin/users', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const users = await getUserList();
    res.json({ users });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Update the broadcast function to be more reliable
function broadcast(eventType, data) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  const deadClients = new Set();
  
  clients.forEach(client => {
    try {
      client.write(message);
      // Force flush the data
      if (typeof client.flush === 'function') {
        client.flush();
      }
    } catch (error) {
      console.error('Error broadcasting to client:', error);
      deadClients.add(client);
    }
  });

  deadClients.forEach(client => clients.delete(client));
}

// Convert WebSocket handlers to regular endpoints
app.post('/spin', async (req, res) => {
  const { username, betAmount } = req.body;
  try {
    const result = await handleSpin(username, betAmount);
    broadcast('spinResult', result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/updateUserVariable', async (req, res) => {
  const { username, variable, value } = req.body;
  
  try {
    // Validate required fields
    if (!username || !variable || value === undefined) {
      throw new Error('Missing required fields');
    }

    const userRef = db.collection('users').doc(username.toString());
    
    let processedValue = value;
    if (variable === 'coins' || variable === 'wins' || variable === 'losses') {
      processedValue = parseInt(value);
      if (isNaN(processedValue)) {
        throw new Error('Invalid number value');
      }
    }

    const updateData = {};
    updateData[variable] = processedValue;
    
    await userRef.update(updateData);
    
    const updatedUserDoc = await userRef.get();
    const updatedUserData = updatedUserDoc.data();
    
    broadcast('userUpdate', {
      username,
      variable,
      value: processedValue,
      userData: updatedUserData
    });
    
    res.json({ 
      success: true,
      updatedValue: processedValue,
      userData: updatedUserData 
    });

  } catch (error) {
    console.error('Error updating user variable:', error);
    res.status(500).json({ 
      error: error.message,
      success: false 
    });
  }
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

// Update handleSpin to broadcast updates immediately
async function handleSpin(username, betAmount) {
  if (!username) {
    return { type: 'error', message: 'Not logged in' };
  }

  try {
    const userRef = db.collection('users').doc(username);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return { type: 'error', message: 'User not found' };
    }

    const userData = userDoc.data();
    const winPercentage = Math.min(Math.max(parseFloat(userData.winPercentage) || 0, 0), 100);
    betAmount = parseInt(betAmount);
    
    if (userData.coins < betAmount) {
      return { type: 'error', message: 'Not enough coins' };
    }

    // Kurangi coins dengan betAmount tapi jangan update database dulu
    const tempCoins = userData.coins - betAmount;
    
    // Random win check berdasarkan winPercentage
    const isWin = Math.random() * 100 < winPercentage;

    let symbols = Array(3).fill(0).map(() => Math.floor(Math.random() * iconMap.length));
    let result = 'lose';
    let multiplier = 0;
    let combination = null;
    let winAmount = 0;

    if (isWin) {
      const winningSymbolIndex = Math.floor(Math.random() * iconMap.length);
      symbols = Array(3).fill(winningSymbolIndex);
      const winningSymbol = iconMap[winningSymbolIndex];
      multiplier = SYMBOL_MULTIPLIERS[winningSymbol];
      result = 'win';
      winAmount = Math.floor(betAmount * multiplier);
      combination = {
        type: 'three_of_a_kind',
        symbol: winningSymbol,
        message: `Triple ${winningSymbol}! Win ${winAmount} coins!`
      };
    }

    const newCoins = tempCoins + winAmount;

    // Return result first without updating database
    return {
      type: 'spinResult',
      result,
      tempCoins,   // Kirim coins sementara (setelah dikurangi bet)
      newCoins,    // Coins akhir setelah win/lose
      combination,
      symbols,
      username,
      betAmount,
      multiplier,
      winAmount,
      shouldUpdateDb: true // Flag untuk update database
    };

  } catch (error) {
    console.error('Spin error:', error);
    return { type: 'error', message: 'Error processing spin' };
  }
}

// Update the sendUserList function to return data instead of sending it
async function getUserList() {
  const usersSnapshot = await db.collection('users').get();
  return usersSnapshot.docs.map(doc => ({
    username: doc.id,
    ...doc.data(),
    active: loggedInUsers.has(doc.id)
  }));
}

// Update broadcastUserList to use the new pattern
async function broadcastUserList() {
  try {
    const users = await getUserList();
    broadcast('userList', { users });
  } catch (error) {
    console.error('Error broadcasting user list:', error);
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

const port = 8080;

server.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
