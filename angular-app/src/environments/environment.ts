// src/environments/environment.ts
// Default: local development (office laptop and Codespaces both use this file;
// start-frontend.sh patches the apiUrl at runtime for Codespaces).

export const environment = {
  production: false,
  // FastAPI backend base URL.
  // In Codespaces this gets patched by start-frontend.sh to the
  // Codespaces-forwarded URL for port 8000 before ng serve starts.
  apiUrl: 'http://localhost:8000',
};
