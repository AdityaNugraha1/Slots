const admin = require('firebase-admin');
const serviceAccount = require('./surenjudi103-firebase-adminsdk-xp59q-7a04f91aa8.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

module.exports = db;
