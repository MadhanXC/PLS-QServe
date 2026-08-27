import express from 'express';
import { createServer as createViteServer } from 'vite';

// This file now handles ONLY local frontend development.
//
// All API routes (health check, send-test-email, send-password-email,
// send-custom-request-notification) have moved to /api/*.ts as standalone
// Vercel Serverless Functions — see api/_lib/resend.ts and the sibling files.
//
// Locally, run `vercel dev` instead of this file directly. `vercel dev`
// serves your Vite frontend AND runs the /api/*.ts functions together,
// so local behavior matches production exactly.
//
// This file is kept only as a fallback for plain `vite`-less workflows or
// reference. In normal development you should not need to run this directly.

async function startDevServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });
  app.use(vite.middlewares);

  app.listen(PORT, () => {
    console.log(`Vite dev server running at http://localhost:${PORT}`);
    console.log('Note: /api routes are NOT available here. Use `vercel dev` to test API routes locally.');
  });
}

startDevServer().catch((err) => {
  console.error('Failed to start dev server:', err);
});
