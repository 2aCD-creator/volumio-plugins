const io = require('socket.io-client');
const socket = io.connect('http://localhost:3000');

// Call the endpoint
const restoreAsoundConfig = { 'endpoint': 'user_interface/peppy_screensaver', 'method': 'restoreAsoundConfig', 'data': '' };
socket.emit('callMethod', restoreAsoundConfig);

// Sleep and exit as I don't feel like figuring out the correct push response.
setTimeout(() => process.exit(0), 1000);