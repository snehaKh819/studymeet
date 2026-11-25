import http from 'node:http';
import { createApp } from './app.js';
import { attachCollab } from './collab/server.js';

export function createServer() {
  const server = http.createServer(createApp());
  const collab = attachCollab(server);
  return { server, collab };
}
