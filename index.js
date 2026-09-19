const mineflayer = require("mineflayer");
const http = require("http");

const HOST = process.env.MC_HOST || "play.plumsmp.fun";
const PORT = Number(process.env.MC_PORT || 25565);
const USERNAME = process.env.BOT_USERNAME;
const PASSWORD = process.env.BOT_PASSWORD;

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
  if (events.length > 50) events.shift();
}

// Tiny HTTP server so Render sees an open port and you can check status.
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`status: ${status}\n\n${events.join("\n")}\n`);
  })
  .listen(process.env.PORT || 3000);

function start() {
  status = "connecting";
  let banned = false;

  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    auth: "offline",
  });

  bot.on("resourcePack", () => {
    log("resource pack offered, accepting");
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

bot.once("login", () => {
  status = "online";
  delay = 15000;
  log("logged in to the server");
});

  bot.on("kicked", (reason) => {
    const text = typeof reason === "string" ? reason : JSON.stringify(reason);
    log("kicked: " + text);
    if (/ban/i.test(text)) banned = true;
  });

  bot.on("error", (err) => log("error: " + err.message));

  bot.on("end", (reason) => {
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
