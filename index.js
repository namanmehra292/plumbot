const mineflayer = require("mineflayer");
const http = require("http");

const HOST = process.env.MC_HOST || "play.plumsmp.fun";
const PORT = Number(process.env.MC_PORT || 25565);
const USERNAME = process.env.BOT_USERNAME;
const PASSWORD = process.env.BOT_PASSWORD;
const VERSION = process.env.MC_VERSION || false; // e.g. "1.20.4" to force a version

if (!USERNAME || !PASSWORD) {
  console.error("Set BOT_USERNAME and BOT_PASSWORD environment variables.");
  process.exit(1);
}

let status = "starting";
let delay = 15000;
let lastAuth = 0;
const events = [];

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  events.push(line);
  if (events.length > 80) events.shift();
}

http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`status: ${status}\n\n${events.join("\n")}\n`);
  })
  .listen(process.env.PORT || 3000);

function start() {
  status = "connecting";
  let banned = false;
  let joined = false;
  const seen = new Set();

  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    auth: "offline",
    version: VERSION,
  });

  // Watchdog: if we never get into the world, reconnect instead of hanging.
  const watchdog = setTimeout(() => {
    if (!joined) {
      log("not in the world after 90s, reconnecting");
      bot.end("watchdog");
    }
  }, 90000);

  bot.once("login", () => log(`login packet received (version ${bot.version})`));
  bot.once("game", () => log("game state received"));

  // Log each distinct packet name once, with the connection state, to see where it stalls.
  bot._client.on("packet", (data, meta) => {
    const key = `${meta.state}:${meta.name}`;
    if (!seen.has(key) && seen.size < 60) {
      seen.add(key);
      log(`packet ${key}`);
    }
  });

  bot.on("resourcePack", (url) => {
    log(`resource pack offered (${String(url).slice(0, 80)}), accepting`);
    bot.acceptResourcePack();
  });

  bot.on("messagestr", (msg) => {
    console.log("[chat]", msg);
    const m = msg.toLowerCase();
    if (Date.now() - lastAuth < 5000) return;
    if (m.includes("/register")) {
      lastAuth = Date.now();
      bot.chat(`/register ${PASSWORD} ${PASSWORD}`);
      log("sent /register");
    } else if (m.includes("/login")) {
      lastAuth = Date.now();
      bot.chat(`/login ${PASSWORD}`);
      log("sent /login");
    }
  });

  const markOnline = (why) => {
    if (joined) return;
    joined = true;
    clearTimeout(watchdog);
    status = "online";
    delay = 15000;
    log(`in the world (${why})`);
  };
  bot.once("spawn", () => markOnline("spawn"));
  bot.once("respawn", () => markOnline("respawn"));

  bot.on("kicked", (reason) => {
    const text = typeof reason === "string" ? reason : JSON.stringify(reason);
    log("kicked: " + text);
    if (/ban/i.test(text)) banned = true;
  });

  bot.on("error", (err) => log("error: " + err.message));

  bot.on("end", (reason) => {
    clearTimeout(watchdog);
    status = "disconnected";
    if (banned) {
      log("looks like a ban, not reconnecting");
      return;
    }
    log(`disconnected (${reason}), retrying in ${delay / 1000}s`);
    setTimeout(start, delay);
    delay = Math.min(delay * 2, 300000);
  });
}

start();
