// ====== keep_alive.js ======
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is Alive!');
});

function keepAlive() {
  app.listen(3000, () => {
    console.log('✅ keep_alive server running!');
  });
}

module.exports = keepAlive;
// ====== keep_alive.js ======