const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
    res.send('Economy Bot is running!');
});

app.listen(port, () => {
    console.log(`Keep-alive server running on port ${port}`);
});