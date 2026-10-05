// HTTPS in front of `next start` (which only speaks HTTP), so a phone on the home
// Wi-Fi can use the camera and location with the production build.
//
//   npx next start -p 5461 -H 127.0.0.1
//   node scripts/https-proxy.mjs            # https://<this-mac>:5460 → http://127.0.0.1:5461
//
// Uses the same self-signed certificate the dev server made (certificates/).
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

const LISTEN = Number(process.env.PORT ?? 5460);
const TARGET = Number(process.env.TARGET ?? 5461);

const server = https.createServer(
  { key: readFileSync("certificates/localhost-key.pem"), cert: readFileSync("certificates/localhost.pem") },
  (req, res) => {
    const up = http.request(
      { host: "127.0.0.1", port: TARGET, method: req.method, path: req.url, headers: { ...req.headers, "x-forwarded-proto": "https" } },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    up.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  },
);
server.listen(LISTEN, "0.0.0.0", () => console.log(`https://0.0.0.0:${LISTEN} → http://127.0.0.1:${TARGET}`));
