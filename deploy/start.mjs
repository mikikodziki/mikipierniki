// Startup file of the CloudLinux "Node.js App" on seohost; LiteSpeed starts it (see deploy/README.md).
// Settings and passwords live in ../mikipierniki-data/.env, outside public_html: environment
// variables set in the panel would be written into public_html/.htaccess.
process.loadEnvFile(new URL("../mikipierniki-data/.env", import.meta.url));
await import("./dist/server/entry.mjs");
