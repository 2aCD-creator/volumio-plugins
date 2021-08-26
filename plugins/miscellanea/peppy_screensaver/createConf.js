const io = require('socket.io-client');
const socket = io.connect('http://localhost:3000');

// Call the endpoint
const createMPDFile = { 'endpoint': 'music_service/mpd', 'method': 'createMPDFile', 'data': '' };
socket.emit('callMethod', createMPDFile);

const createAirPlayFile = { 'endpoint': 'music_service/airplay_emulation', 'method': 'outputDeviceCallback', 'data': '' };
socket.emit('callMethod', createAirPlayFile);


// Sleep and exit as I don't feel like figuring out the correct push response.
setTimeout(() => process.exit(0), 1000);