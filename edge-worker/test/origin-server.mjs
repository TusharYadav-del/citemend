import { createServer } from "node:http";

createServer((request, response) => {
  response.statusCode = request.url?.startsWith("/old") ? 404 : 200;
  response.setHeader("Content-Type", "text/plain");
  response.end(response.statusCode === 404 ? "origin 404" : "origin 200");
}).listen(8788, "127.0.0.1", () => console.log("Local test origin listening on 127.0.0.1:8788"));
