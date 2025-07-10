const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Economy Bot is running!');
});
server.listen(3000);