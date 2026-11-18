const http = require("http");
const fs = require("fs");
const path = require("path");

const host = "0.0.0.0";
const port = Number(process.env.PORT || 4173);
const root = __dirname;
const resultsFile = path.join(root, "results.json");

function readResults() {
  try {
    const value = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeResults(results) {
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2), "utf8");
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Credentials": "true"
  });
  response.end(JSON.stringify(value));
}

function getCookie(request, name) {
  const cookies = (request.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function setCookie(response, name, value) {
  response.setHeader("Set-Cookie", `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=31536000`);
}

function getContentType(filePath) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  };
  return types[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const origin = request.headers.origin;
  const allowedOrigin = process.env.ALLOWED_ORIGIN;

  if (allowedOrigin && origin === allowedOrigin) {
    response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Credentials", "true");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/results") {
    const results = readResults()
      .sort((a, b) => b.score - a.score || a.time - b.time)
      .slice(0, 50);
    sendJson(response, 200, { results });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/results") {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10000) request.destroy();
    });
    request.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        sendJson(response, 400, { error: "Yaroqsiz maʼlumot" });
        return;
      }

      const submitId = getCookie(request, "bayroq_submit");
      if (submitId) {
        sendJson(response, 409, { error: "Savolga javob allaqachon topshirilgan" });
        return;
      }

      const name = String(payload.name || "").trim().slice(0, 50);
      const className = String(payload.className || "").trim().slice(0, 30);
      const score = Number(payload.score);
      const time = Number(payload.time);

      if (!name || !className || !Number.isInteger(score) || score < 0 || score > 10 ||
          !Number.isFinite(time) || time < 0 || time > 120) {
        sendJson(response, 400, { error: "Maʼlumotlar toʻliq emas" });
        return;
      }

      const id = cryptoRandomId();
      const results = readResults();
      results.push({ id, name, className, score, time, createdAt: new Date().toISOString() });
      results.sort((a, b) => b.score - a.score || a.time - b.time);
      writeResults(results.slice(0, 100));
      setCookie(response, "bayroq_submit", id);
      sendJson(response, 201, { submitted: true });
    });
    return;
  }

  let requestPath = decodeURIComponent(url.pathname);
  if (requestPath === "/") requestPath = "/index.html";
  const filePath = path.resolve(root, "." + requestPath);
  if (!filePath.startsWith(root + path.sep)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    response.writeHead(200, { "Content-Type": getContentType(filePath) });
    response.end(data);
  });
});

function cryptoRandomId() {
  return require("crypto").randomBytes(16).toString("hex");
}

server.listen(port, host, () => {
  console.log(`Bayroq kuni serveri: http://${host}:${port}`);
});
