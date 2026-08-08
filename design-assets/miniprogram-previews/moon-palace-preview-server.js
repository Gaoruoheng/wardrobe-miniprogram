const http = require("http");
const fs = require("fs");
const path = require("path");

const routes = {
  "/": "moon-palace-index-preview.html",
  "/add": "moon-palace-add-preview.html"
};

http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  const file = path.join(__dirname, routes[pathname] || routes["/"]);

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(String(err));
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(data);
  });
}).listen(5002, "127.0.0.1");
