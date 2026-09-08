import { createApp } from './app.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = process.env.HOST || '127.0.0.1';

createApp()
  .then((app) => {
    app.listen(PORT, HOST, () => {
      console.log(`Japanese N4 prep app running at http://${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
