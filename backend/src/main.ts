import { config } from "./config.js";
import { createApp } from "./server.js";

createApp().listen(config.port, "127.0.0.1", () => {
  console.log(`Support triage API listening on http://127.0.0.1:${config.port}`);
});
