/*
  Post-build deployment script
  - Package dist and publish via an isolated, verified directory exchange
  - Uses SFTP via ssh2-sftp-client
  - Reads connection info from env vars to avoid hardcoding secrets
  - SFTP uploads one tar.gz; Python verifies content before atomic activation
  - Requires local Python 3.9+, remote Python 3 + Linux renameat2 on the same filesystem
  - SFTP HTTP cache headers must be configured on the web server; S3 sets them here
  - S3 requires @aws-sdk/client-s3 installed in the deployment environment

  Required env vars (recommended):
    DEPLOY_HOST   = 8.137.145.5
    DEPLOY_USER   = root
    DEPLOY_PASS   = ********        (or use DEPLOY_KEY_FILE for SSH key)
    DEPLOY_REMOTE_DIR = /var/www/blog
    CLEAN_REMOTE  = obsolete; SFTP never clears the live site before uploading
    SSH_PORT      = 22              (optional)
    DEPLOY_KEY_FILE = C:\\Users\\<you>\\.ssh\\id_rsa (optional, prefer key over password)
*/

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import SftpClient from "ssh2-sftp-client";
import { cacheControlFor, collectDeploymentFiles, contentTypeFor, publishInOrder } from "./deploy-plan.mjs";
import { parseDeployArgs, validateSiteDir, createArchive, runRemote, publishArchive } from "./deploy-archive.mjs";

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

function assertPreconditions(action) {
	if (["deploy", "pack"].includes(action) && !fs.existsSync(LOCAL_DIR)) {
		throw new Error(
			`Local build directory not found: ${LOCAL_DIR}. Run build first.`,
		);
	}
	if (action === "pack") return;
	if (PROVIDER === "sftp") {
		validateSiteDir(REMOTE_DIR);
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
		if (action !== "deploy") throw new Error("This operation is only supported by SFTP");
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
	const started = performance.now();
	const action = parseDeployArgs(process.argv.slice(2));
	assertPreconditions(action);
	const files = ["deploy", "pack"].includes(action) ? collectDeploymentFiles(LOCAL_DIR, EXCLUDES) : [];
	if (action === "pack") {
		const archive = await createArchive(LOCAL_DIR, files);
		log(JSON.stringify({ archivePath: archive.archivePath, sha256: archive.archiveSha256, files: files.length, rawBytes: archive.manifest.totalBytes, archiveBytes: archive.archiveBytes, seconds: archive.seconds }));
		log("Local archive retained for inspection; remove its temporary directory when finished. No server connection made.");
		return;
	}

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
			if (action !== "deploy") {
				log(JSON.stringify(await runRemote(sftp, { action, siteDir: REMOTE_DIR })));
				return;
			}
			log("Preflight:", JSON.stringify(await runRemote(sftp, { action: "check", siteDir: REMOTE_DIR })));
			const archive = await createArchive(LOCAL_DIR, files);
			try {
				log(`Packed ${files.length} files: ${(archive.manifest.totalBytes / 1048576).toFixed(2)} -> ${(archive.archiveBytes / 1048576).toFixed(2)} MiB in ${archive.seconds.toFixed(2)}s`);
				const result = await publishArchive(sftp, REMOTE_DIR, archive, { log });
				log("Release:", JSON.stringify(result));
				log("Current and previous archives retained privately. Apache/PM2 are unchanged.");
			} finally { try { archive.cleanup(); } catch (cause) { log("Local archive cleanup deferred:", cause.message); } }
			log(`Deployment total: ${((performance.now() - started) / 1000).toFixed(2)}s`);
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
