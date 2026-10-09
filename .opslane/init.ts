// One-shot setup for the Opslane Verify check: extensions, SQS queues, Kafka topics.
// Runs with bun inside the app image (cwd /app/server). Resolves app packages by absolute path.
import { createRequire } from "node:module";

const APP_ROOT = "/app";
// Resolve packages the way the app does, from its server workspace.
const appRequire = createRequire("/app/server/package.json");

const SQS_QUEUES = [
	{ name: "autumn.fifo", fifo: true },
	{ name: "autumn-track.fifo", fifo: true },
	{ name: "autumn-track-async", fifo: false },
	{ name: "autumn-stripe-webhook.fifo", fifo: true },
] as const;

const createExtension = async () => {
	const { Client } = appRequire("pg");
	const client = new Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();
	await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
	await client.end();
};

const createQueues = async () => {
	const endpoint = process.env.SQS_ENDPOINT;
	if (!endpoint) throw new Error("SQS_ENDPOINT is not set");
	for (const queue of SQS_QUEUES) {
		const params = new URLSearchParams({
			Action: "CreateQueue",
			QueueName: queue.name,
			Version: "2012-11-05",
		});
		if (queue.fifo) {
			params.set("Attribute.1.Name", "FifoQueue");
			params.set("Attribute.1.Value", "true");
			params.set("Attribute.2.Name", "ContentBasedDeduplication");
			params.set("Attribute.2.Value", "true");
		}
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: params,
		});
		if (!response.ok) {
			throw new Error(
				`CreateQueue ${queue.name} failed: ${response.status} ${await response.text()}`,
			);
		}
	}
};

const createTopics = async () => {
	const { createBalanceWorkerEnv } = await import(
		`${APP_ROOT}/packages/env/src/balanceWorker/balanceWorkerEnv.ts`
	);
	const { Kafka } = appRequire("kafkajs");
	const env = createBalanceWorkerEnv({ ...process.env, KAFKA_AUTH_MODE: "none" });
	const admin = new Kafka({
		clientId: "opslane-verify-setup",
		brokers: env.KAFKA_BROKERS,
	}).admin();
	await admin.connect();
	try {
		const existing = new Set(await admin.listTopics());
		const topics = [
			{ topic: env.BALANCE_WORKER_METERING_TOPIC, partitions: env.BALANCE_WORKER_PARTITION_COUNT },
			{
				topic: env.BALANCE_WORKER_OWNERSHIP_TOPIC,
				partitions: env.BALANCE_WORKER_PARTITION_COUNT,
				configEntries: [{ name: "cleanup.policy", value: "compact" }],
			},
			{ topic: env.BALANCE_WORKER_COMMAND_TOPIC, partitions: env.BALANCE_WORKER_PARTITION_COUNT },
			{
				topic: env.BALANCE_WORKER_CATALOG_INVALIDATION_TOPIC,
				partitions: 1,
				configEntries: [{ name: "retention.ms", value: "3600000" }],
			},
		]
			.filter(({ topic }) => !existing.has(topic))
			.map(({ topic, partitions, configEntries }) => ({
				topic,
				numPartitions: partitions,
				replicationFactor: 1,
				configEntries,
			}));
		if (topics.length > 0) {
			await admin.createTopics({ waitForLeaders: true, topics });
		}
	} finally {
		await admin.disconnect();
	}
};

await createExtension();
await createQueues();
await createTopics();
console.log("opslane init done");
