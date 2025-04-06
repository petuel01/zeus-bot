const { Boom } = require('@hapi/boom');
const makeWASocket = require('@adiwajshing/baileys').default;
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

// Session management
let sessions = {};

async function connectToWhatsApp(sessionId) {
    if(sessions[sessionId]) return sessions[sessionId];

    const { state, saveState } = await useSession(sessionId);
    
    const sock = makeWASocket({
        printQRInTerminal: false,
        auth: state,
        logger: { level: 'silent' }
    });

    sessions[sessionId] = sock;

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        
        if(qr) {
            io.to(sessionId).emit('qr', qr);
        }
        
        if(connection === 'open') {
            io.to(sessionId).emit('connected');
        }
    });

    sock.ev.on('creds.update', saveState);

    return sock;
}

async function useSession(sessionId) {
    const sessionFile = `./sessions/${sessionId}.json`;
    
    const writeData = (data) => {
        fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2));
    };
    
    let state;
    try {
        state = JSON.parse(fs.readFileSync(sessionFile));
    } catch {
        state = {};
    }
    
    return {
        state,
        saveState: () => writeData(state)
    };
}

// Web server setup
app.use(express.static('public'));
app.use(express.json());

app.post('/start-session', (req, res) => {
    const sessionId = req.body.sessionId || Math.random().toString(36).substring(7);
    connectToWhatsApp(sessionId);
    res.json({ sessionId });
});

io.on('connection', (socket) => {
    socket.on('join', (sessionId) => {
        socket.join(sessionId);
    });
});

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});