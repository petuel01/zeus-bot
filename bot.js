const { Boom } = require('@hapi/boom');
const { makeWASocket } = require('@adiwajshing/baileys').default;
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const path = require('path');

// Session and pairing code storage
const sessions = {};
const pairingCodes = {};

// Configure express
app.use(express.static('public'));
app.use(express.json());

// Create sessions directory if not exists
if (!fs.existsSync('sessions')) {
    fs.mkdirSync('sessions');
}

// WhatsApp connection handler
async function connectToWhatsApp(sessionId) {
    if (sessions[sessionId]) return sessions[sessionId];

    const { state, saveState } = await useSession(sessionId);
    
    const sock = makeWASocket({
        printQRInTerminal: false,
        auth: state,
        logger: { level: 'silent' }
    });

    sessions[sessionId] = sock;

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        
        if (qr) {
            io.to(sessionId).emit('qr', qr);
        }
        
        if (connection === 'open') {
            io.to(sessionId).emit('connected', sessionId);
        }
    });

    sock.ev.on('creds.update', saveState);

    return sock;
}

// Session management
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

// Routes
app.get('/scan/qr', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/qr-scan.html'));
});

app.get('/scan/pairing', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/pairing-code.html'));
});

app.post('/api/generate-code', (req, res) => {
    const { phone } = req.body;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    pairingCodes[code] = {
        phone,
        expires: Date.now() + 600000 // 10 minutes
    };
    
    res.json({ code });
});

app.post('/api/verify-code', (req, res) => {
    const { code } = req.body;
    const record = pairingCodes[code];
    
    if (!record || record.expires < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired code' });
    }
    
    // In real implementation, verify with WhatsApp here
    res.json({ success: true, sessionId: generateSessionId() });
});

// Socket.io setup
io.on('connection', (socket) => {
    socket.on('join-session', (sessionId) => {
        socket.join(sessionId);
        connectToWhatsApp(sessionId);
    });
});

// Helper functions
function generateSessionId() {
    return Math.random().toString(36).substring(2, 10);
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`QR Scanner: http://localhost:${PORT}/scan/qr`);
    console.log(`Pairing Code: http://localhost:${PORT}/scan/pairing`);
});