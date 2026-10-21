import { config } from "dotenv";

// Same precedence as Next.js for local work: .env.local wins over .env.
config({ path: [".env.local", ".env"], quiet: true });
