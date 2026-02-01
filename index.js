const axios = require('axios');
const fs = require('fs');
const WebSocket = require('ws');
const readline = require('readline-sync');
const config = require('./config.json');

/* =======================
   REMOTE LICENSE CHECK (LIVE)
   ======================= */

// RAW GitHub link to your keys.json
const LICENSE_URL = "https://raw.githubusercontent.com/Rahat-cmd/license-server/main/keys.json";

async function checkCode() {
    const userCode = readline.question("Enter your 4-digit code: ").trim();

    if (!/^\d{4}$/.test(userCode)) {
        console.error("❌ Code must be 4 digits!");
        process.exit(1);
    }

    try {
        // Fetch live keys with cache prevention
        const res = await axios.get(LICENSE_URL + "?t=" + Date.now(), {
            timeout: 5000,
            headers: { 'Cache-Control': 'no-cache', 'Accept': 'application/json' }
        });

        let keys = res.data;
        if (typeof keys === 'string') keys = JSON.parse(keys);

        // Live check
        if (keys[userCode] === true) {
            console.log("✅ Code accepted. Running script...");
        } else {
            console.error("❌ Wrong code or disabled. Access denied!");
            process.exit(1);
        }

    } catch (err) {
        console.error("❌ Could not reach license server. Try again later.", err.message);
        process.exit(1);
    }
}

/* =======================
   DISCORD VC SCRIPT
   ======================= */

const FILEPATH = './tokens.txt';
const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
const DISCORD_USER_URL = "https://discord.com/api/v9/users/@me";

function getTimestamp() {
    return `[${new Date().toLocaleTimeString()}]`;
}

function readAndSortTokens(filepath) {
    return fs.readFileSync(filepath, 'utf-8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

async function checkToken(token, index) {
    try {
        await axios.get(DISCORD_USER_URL, { headers: { Authorization: token } });
        console.log(`${getTimestamp()} Token ${index + 1} is valid`);
        return token;
    } catch {
        console.error(`${getTimestamp()} Token ${index + 1} invalid`);
        return null;
    }
}

async function validateTokens(tokens) {
    const results = await Promise.all(tokens.map(checkToken));
    return tokens.filter((_, i) => results[i] !== null);
}

function wsJoin(token) {
    let ws = new WebSocket(GATEWAY_URL);
    let heartbeatInterval = null;
    let sequence = null;

    ws.on('open', () => {
        ws.send(JSON.stringify({
            op: 2,
            d: { token, properties: { os: 'Linux', browser: 'Firefox', device: 'desktop' } }
        }));
    });

    ws.on('message', (data) => {
        const payload = JSON.parse(data);
        const { op, s, d } = payload;
        if (s) sequence = s;

        if (op === 10) {
            heartbeatInterval = setInterval(() => {
                ws.send(JSON.stringify({ op: 1, d: sequence }));
            }, d.heartbeat_interval * 0.9);

            setTimeout(() => {
                ws.send(JSON.stringify({
                    op: 4,
                    d: {
                        guild_id: config.GUILD_ID,
                        channel_id: config.VC_CHANNEL,
                        self_mute: !!config.MUTED,
                        self_deaf: !!config.DEAFEN
                    }
                }));
                console.log(`${getTimestamp()} ${token.slice(0, 8)}... joined VC`);
            }, 2000);
        }
    });

    ws.on('close', () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        setTimeout(() => wsJoin(token), 5000 + Math.random() * 5000);
    });
}

/* =======================
   MAIN
   ======================= */

async function main() {
    if (!fs.existsSync(FILEPATH)) {
        console.error(`${getTimestamp()} tokens.txt not found!`);
        return;
    }

    const tokens = readAndSortTokens(FILEPATH);
    const validTokens = await validateTokens(tokens);

    console.log(`${getTimestamp()} Starting ${validTokens.length} voice connections...`);

    validTokens.forEach((token, i) => {
        setTimeout(() => wsJoin(token), i * 2000);
    });
}

/* =======================
   RUN LICENSE CHECK THEN MAIN
   ======================= */
(async () => {
    await checkCode(); // ✅ check license live
    main();            // ✅ run VC only if license valid
})();
