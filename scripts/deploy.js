/*
  Post-build deployment script
  - Sync dist/* to remote /var/www/blog (or DEPLOY_REMOTE_DIR)
  - Uses SFTP via ssh2-sftp-client
  - Reads connection info from env vars to avoid hardcoding secrets
  - Publishes resources, HTML, then root version.json; retains old assets/pages
  - SFTP requires OpenSSH posix-rename; individual files are atomic, the site is not
  - SFTP HTTP cache headers must be configured on the web server; S3 sets them here
  - S3 requires @aws-sdk/client-s3 installed in the deployment environment

  Required env vars (recommended):
    DEPLOY_HOST   = 8.137.145.5
    DEPLOY_USER   = root
    DEPLOY_PASS   = ********        (or use DEPLOY_KEY_FILE for SSH key)
    DEPLOY_REMOTE_DIR = /var/www/blog
    CLEAN_REMOTE  = deprecated; ignored (old assets are retained)
    SSH_PORT      = 22              (optional)
    DEPLOY_KEY_FILE = C:\\Users\\<you>\\.ssh\\id_rsa (optional, prefer key over password)
*/

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import SftpClient from "ssh2-sftp-client";
import { cacheControlFor, collectDeploymentFiles, contentTypeFor, publishInOrder } from "./deploy-plan.mjs";
import { randomUUID } from "node:crypto";

const log = (...args) => console.log("[deploy]", ...args);
const error = (...args) => console.error("[deploy]", ...args);

const LOCAL_DIR = path.resolve(process.cwd(), "dist");

function loadConfigFile() {
	const tryPaths = [
		path.resolve(process.cwd(), "deploy.config.json"),
		path.resolve(process.cwd(), "scripts", "deploy.config.json"),
	];
	for (const p of tryPaths) {
		if (fs.existsSync(p)) {
			try {
				const raw = fs.readFileSync(p, "utf8");
				const cfg = JSON.parse(raw);
				log("Loaded config from", p);
				return cfg;
			} catch (e) {
				error("Failed to read/parse config file:", p, e?.message || e);
				throw e;
			}
		}
	}
	return {};
}

const fileCfg = loadConfigFile();

const REMOTE_DIR =
	fileCfg.remoteDir || process.env.DEPLOY_REMOTE_DIR || "/var/www/blog";
// provider: 'sftp' (default) or 's3'
const PROVIDER = (
	fileCfg.provider ||
	process.env.DEPLOY_PROVIDER ||
	"sftp"
).toLowerCase();
const HOST = fileCfg.host || process.env.DEPLOY_HOST;
const USER = fileCfg.user || process.env.DEPLOY_USER || "root";
const PORT = Number(fileCfg.port || process.env.SSH_PORT || 22);
const PASS = fileCfg.password || process.env.DEPLOY_PASS; // avoid logging this
const KEY_FILE = fileCfg.keyFile || process.env.DEPLOY_KEY_FILE; // prefer key if provided
const EXCLUDES = Array.isArray(fileCfg.excludes)
	? fileCfg.excludes
	: [".DS_Store"];

function assertPreconditions() {
	if (!fs.existsSync(LOCAL_DIR)) {
		throw new Error(
			`Local build directory not found: ${LOCAL_DIR}. Run build first.`,
		);
	}
	if (PROVIDER === "sftp") {
		if (!HOST) {
			throw new Error("DEPLOY_HOST is required for sftp provider");
		}
		if (!USER) {
			throw new Error("DEPLOY_USER is required for sftp provider");
		}
		if (!PASS && !KEY_FILE) {
			throw new Error(
				"Provide either DEPLOY_PASS or DEPLOY_KEY_FILE for sftp authentication",
			);
		}
	} else if (PROVIDER === "s3") {
		// for s3, bucket and region should be provided via env or config file
		const S3_BUCKET =
			fileCfg.s3Bucket || process.env.S3_BUCKET || process.env.DEPLOY_S3_BUCKET;
		const S3_REGION =
			fileCfg.s3Region || process.env.S3_REGION || process.env.AWS_REGION;
		if (!S3_BUCKET) {
			throw new Error(
				"S3_BUCKET (or DEPLOY_S3_BUCKET) is required for s3 provider",
			);
		}
		if (!S3_REGION) {
			throw new Error("S3_REGION (or AWS_REGION) is required for s3 provider");
		}
	} else {
		throw new Error(`Unknown DEPLOY_PROVIDER: ${PROVIDER}`);
	}
}

async function main() {
	assertPreconditions();
	const files = collectDeploymentFiles(LOCAL_DIR, EXCLUDES);
	if (fileCfg.cleanRemote !== undefined || process.env.CLEAN_REMOTE !== undefined) {
		log("cleanRemote/CLEAN_REMOTE is deprecated and ignored; existing remote assets will be retained.");
	}
	log("Publishing resources, then HTML, then version.json. This is not an atomic whole-site directory switch.");
	log("Old assets and removed pages are retained; mutable same-name resources may be replaced. Prune separately after old clients expire.");

	if (PROVIDER === "sftp") {
		const sftp = new SftpClient();
		let privateKey;
		if (KEY_FILE) {
			try {
				privateKey = fs.readFileSync(KEY_FILE);
			} catch (e) {
				throw new Error(
					`Failed to read DEPLOY_KEY_FILE at ${KEY_FILE}: ${e?.message || e}`,
				);
			}
		}

		const connectConfig = {
			host: HOST,
			port: PORT,
			username: USER,
			readyTimeout: 20_000,
			algorithms: {
				serverHostKey: [
					"ssh-rsa",
					"ssh-ed25519",
					"ecdsa-sha2-nistp256",
					"rsa-sha2-512",
					"rsa-sha2-256",
				],
			},
			...(privateKey ? { privateKey } : { password: PASS }),
		};

		log(`Connecting to ${USER}@${HOST}:${PORT} ...`);
		try {
			await sftp.connect(connectConfig);
			log("Connected. Ensuring remote directory exists:", REMOTE_DIR);
			const exists = await sftp.exists(REMOTE_DIR);
			if (!exists) {
				await sftp.mkdir(REMOTE_DIR, true);
			} else if (exists !== "d") {
				throw new Error(
					`Remote path exists but is not a directory: ${REMOTE_DIR}`,
				);
			}

			log("Uploading files from", LOCAL_DIR, "to", REMOTE_DIR);
			const directories = new Set([REMOTE_DIR]);
			await publishInOrder(files, async ({ localPath, key }) => {
				const destination = path.posix.join(REMOTE_DIR, key);
				const directory = path.posix.dirname(destination);
				if (!directories.has(directory)) {
					await sftp.mkdir(directory, true);
					directories.add(directory);
				}
				// OpenSSH's atomic rename extension prevents readers seeing a partial
				// file. Failure leaves the previous file/version intact; do not fall
				// back to deleting live files on servers without this extension.
				const temporary = `${destination}.deploy-${randomUUID()}.tmp`;
				try {
					await sftp.put(localPath, temporary);
					await sftp.posixRename(temporary, destination);
				} catch (cause) {
					await sftp.delete(temporary).catch(() => {});
					throw cause;
				}
				log("Uploaded:", key);
			});
			log("Upload completed. Configure HTTP cache headers on the SFTP web server separately.");
		} finally {
			await sftp.end();
			log("Connection closed.");
		}
	} else if (PROVIDER === "s3") {
		// Dynamic import to avoid requiring AWS SDK when not used
		log("Deploying to S3 provider");
		const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
		const S3_BUCKET =
			fileCfg.s3Bucket || process.env.S3_BUCKET || process.env.DEPLOY_S3_BUCKET;
		const S3_REGION =
			fileCfg.s3Region || process.env.S3_REGION || process.env.AWS_REGION;

		const s3 = new S3Client({ region: S3_REGION });

		log(`Uploading ${files.length} files to s3://${S3_BUCKET}/`);

		try {
			await publishInOrder(files, async ({ localPath, key }) => {
				const body = fs.readFileSync(localPath);
				const contentType = contentTypeFor(key);
				try {
					await s3.send(
						new PutObjectCommand({
							Bucket: S3_BUCKET,
							Key: key,
							Body: body,
							ContentType: contentType,
							CacheControl: cacheControlFor(key),
						}),
					);
					log("Uploaded:", key);
				} catch (e) {
					error("Failed to upload:", key, e?.message || e);
					throw e;
				}
			});
			log("S3 upload completed.");
		} finally {
			s3.destroy();
		}
	}
}

main().catch((e) => {
	error("Deployment failed:", e?.message || e);
	process.exitCode = 1;
});
