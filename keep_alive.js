const express = require('express');

const app = express();

app.get('/', (req, res) => {
    res.send("Bot is alive!");
});

function run() {
    app.listen(10000, '0.0.0.0', () => {
        console.log('Server is running on port 10000');
    });
}

function keep_alive() {
    run();
}

module.exports = keep_alive;
