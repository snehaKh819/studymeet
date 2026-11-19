import 'dotenv/config';
import { createApp } from './app.js';

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set');
  process.exit(1);
}

const PORT = process.env.PORT || 5004;

createApp().listen(PORT, '0.0.0.0', () => {
  console.log(`Workspace service listening on port ${PORT}`);
});
