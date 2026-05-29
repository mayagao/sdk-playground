import "dotenv/config";
import { createApp } from "./server/app.js";
import { PORT } from "./server/config.js";

const app = createApp();

app.listen(PORT, () => {
  console.log(`SDK playground: http://localhost:${PORT}`);
  console.log(`  Quick Ask:  http://localhost:${PORT}/`);
  console.log(`  Explainer:  http://localhost:${PORT}/explain.html`);
  if (!process.env.CURSOR_API_KEY?.trim()) {
    console.warn("Set CURSOR_API_KEY in .env (see .env.example)");
  }
});
