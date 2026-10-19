# PlayCircle admin website

A small React (Vite) site for running the game: dashboard numbers, find players, add or take away coins (with a reason), suspend or ban, see games and purchases, and read the audit log.

```bash
cd admin
cp .env.example .env     # VITE_API_URL = your backend address
npm install
npm run dev              # http://localhost:5173
npm run build            # static files in dist/ to host anywhere
```

On the backend, allow the site's address: `CORS_ORIGINS=http://localhost:5173` (and your real admin address when you host it).

Make your own account an admin (after you have registered it in the app):

```bash
cd backend
DATABASE_URL=postgresql://... npm run make-admin -- you@example.com
```

Only accounts with the admin role can log in here, and every admin action is stored in the audit log with who did it and why. Admins cannot be banned or adjusted from this site.
