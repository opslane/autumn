// Seeds a verified email/password login straight into Postgres (Better Auth tables).
import { createRequire } from "node:module";

// Resolve packages the way the app does, from its server workspace.
const appRequire = createRequire("/app/server/package.json");
const EMAIL = "verify@example.com";
const PASSWORD = "Verify-Passw0rd!";

const { hashPassword } = appRequire("better-auth/crypto");
const { Client } = appRequire("pg");

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
	const userId = "user_opslane_verify";
	const passwordHash = await hashPassword(PASSWORD);
	await client.query(
		`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		 VALUES ($1, 'Verify User', $2, true, now(), now())
		 ON CONFLICT (email) DO UPDATE SET email_verified = true`,
		[userId, EMAIL],
	);
	await client.query(
		`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
		 VALUES ('account_opslane_verify', $1, 'credential', $1, $2, now(), now())
		 ON CONFLICT (id) DO UPDATE SET password = EXCLUDED.password`,
		[userId, passwordHash],
	);
	console.log(`seeded ${EMAIL}`);
} finally {
	await client.end();
}
