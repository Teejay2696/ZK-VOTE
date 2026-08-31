/**
 * Environment Configuration
 *
 * Centralizes all environment variables and configuration.
 * Uses Zod schema (config-schema.ts) for type-safe validation.
 *
 * Secrets can be retrieved dynamically via the SecretManager
 * for runtime fetch from Vault or Fly.io secrets.
 */

import dotenv from "dotenv";
import { validateConfig, type ValidatedConfig, maskSecrets } from "./config-schema.js";

dotenv.config();

// ============================================
// CONFIGURATION (validated via Zod schema)
// ============================================

/**
 * Legacy contract ID validator — kept for backward compatibility.
 * New code should use the schema-validated config directly.
 */
export function isValidContractId(
  contractId: string | undefined,
): contractId is string {
  if (typeof contractId !== "string") return false;
  // Stellar contract IDs are 56-character C-addresses
  if (contractId.length !== 56) return false;
  if (!contractId.startsWith("C")) return false;
  // Base32 alphabet (uppercase)
  return /^C[A-Z2-7]{55}$/.test(contractId);
}

/**
 * Lazy-initialized validated config.
 * Validation runs on first access, not at import time.
 * This allows tests to import config.ts without requiring all
 * environment variables to be set.
 */
let _validatedConfig: ValidatedConfig | null = null;
let _configWarnings: string[] = [];

function getValidatedConfig(): ValidatedConfig {
  if (!_validatedConfig) {
    // In test mode, skip strict validation (matches old behavior)
    if (process.env.RELAYER_TEST_MODE === "true") {
      _validatedConfig = {
        port: Number(process.env.PORT || 3001),
        rpcUrl: process.env.SOROBAN_RPC_URL || "http://localhost:8000/soroban/rpc",
        rpcUrls: [process.env.SOROBAN_RPC_URL || "http://localhost:8000/soroban/rpc"],
        networkPassphrase: process.env.NETWORK_PASSPHRASE || "Standalone Network ; February 2017",
        rpcTimeoutMs: 30_000,
        relayerAuthToken: process.env.RELAYER_AUTH_TOKEN || "test-token-for-testing-only-1234567890",
        relayerSecretKey: process.env.RELAYER_SECRET_KEY,
        votingContractId: process.env.VOTING_CONTRACT_ID || "C000000000000000000000000000000000000000000000000000000000000000",
        treeContractId: process.env.TREE_CONTRACT_ID || "C000000000000000000000000000000000000000000000000000000000000000",
        commentsContractId: process.env.COMMENTS_CONTRACT_ID || "C000000000000000000000000000000000000000000000000000000000000000",
        daoRegistryContractId: process.env.DAO_REGISTRY_CONTRACT_ID,
        membershipSbtContractId: process.env.MEMBERSHIP_SBT_CONTRACT_ID,
        bridgeContractId: process.env.BRIDGE_CONTRACT_ID,
        circuitRegistryContractId: process.env.CIRCUIT_REGISTRY_CONTRACT_ID,
        staticVkVersion: process.env.VOTING_VK_VERSION ? Number(process.env.VOTING_VK_VERSION) : undefined,
        corsOrigins: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()) : ("*" as const),
        logClientIp: process.env.LOG_CLIENT_IP as "plain" | "hash" | undefined,
        logRequestBody: process.env.LOG_REQUEST_BODY !== "false",
        stripRequestBodies: process.env.STRIP_REQUEST_BODIES === "true",
        genericErrors: process.env.RELAYER_GENERIC_ERRORS === "true",
        healthExposeDetails: process.env.HEALTH_EXPOSE_DETAILS !== "false",
        healthcheckPing: process.env.HEALTHCHECK_PING === "true",
        indexerEnabled: process.env.INDEXER_ENABLED !== "false",
        indexerPollIntervalMs: 5000,
        daoSyncIntervalMs: 30_000,
        membershipSyncIntervalMs: 600_000,
        pinataJwt: process.env.PINATA_JWT,
        pinataGateway: process.env.PINATA_GATEWAY,
        ipfsEnabled: !!process.env.PINATA_JWT,
        ipfsBackupDir: process.env.IPFS_BACKUP_DIR || "./data/ipfs-backup",
        web3StorageToken: process.env.WEB3_STORAGE_TOKEN,
        pinVerifyIntervalMs: 3_600_000,
        pinAlertThreshold: 3,
        pinAutoRepin: process.env.PIN_AUTO_REPIN !== "false",
        powEnabled: process.env.POW_ENABLED !== "false",
        powDifficulty: Number(process.env.POW_DIFFICULTY || 20),
        powChallengeTtlMs: 300_000,
        commitmentRateLimit: Number(process.env.COMMITMENT_RATE_LIMIT || 5),
        commitmentRateWindowMs: 60_000,
        flagThreshold: Number(process.env.FLAG_THRESHOLD || 3),
        flagPowDifficulty: Number(process.env.FLAG_POW_DIFFICULTY || 10),
        ttlRenewalIntervalMs: 604_800_000,
        ttlRenewalThresholdMs: 1_209_600_000,
        ttlGracePeriodMs: 259_200_000,
        ttlBatchSize: 5,
        ttlCheckEnabled: process.env.TTL_CHECK_ENABLED !== "false",
        ttlCostTrackingEnabled: process.env.TTL_COST_TRACKING_ENABLED !== "false",
        ttlMaxFee: "1000000",
        ttlSlippageLedgers: 8640,
        backupIntervalMs: 86_400_000,
        s3Bucket: process.env.BACKUP_S3_BUCKET || process.env.S3_BUCKET,
        archivalAgeDays: 90,
        archivalIntervalMs: 86_400_000,
        circuitBreakerRpcFailureThreshold: 5,
        circuitBreakerRpcResetMs: 30_000,
        circuitBreakerPinataFailureThreshold: 5,
        circuitBreakerPinataResetMs: 30_000,
        circuitBreakerGatewayFailureThreshold: 5,
        circuitBreakerGatewayResetMs: 30_000,
        memoryMonitorIntervalMs: 60_000,
        memoryLimitMb: 512,
        memoryWarnRatio: 0.8,
        memoryCriticalRatio: 0.95,
        memoryAutoRestart: process.env.MEMORY_AUTO_RESTART !== "false",
        maxCachedDaos: 5000,
        dbQueryCacheMaxEntries: 500,
        testMode: true,
        logSamplingRate: 1.0,
        logSamplingErrorRate: 1.0,
        logSamplingSlowRate: 1.0,
        logSlowThresholdMs: 1000,
        logBodyMaxChars: 2000,
        hotReloadEnabled: false,
      };
      _configWarnings = ["Test mode enabled — strict validation skipped"];
    } else {
      const { config, warnings } = validateConfig();
      _validatedConfig = config;
      _configWarnings = warnings;

      // Log startup warnings
      for (const w of warnings) {
        console.log(JSON.stringify({ level: "warn", event: "config_warning", message: w }));
      }

      // Log config summary (secrets masked)
      console.log(
        JSON.stringify({
          level: "info",
          event: "config_loaded",
          env: maskSecrets(process.env),
          variables: Object.keys(process.env).length,
          ipfsEnabled: config.ipfsEnabled,
          indexerEnabled: config.indexerEnabled,
          testMode: config.testMode,
        }),
      );
    }
  }
  return _validatedConfig;
}

/**
 * The config object is the public API for the rest of the codebase.
 * It provides the same shape as the legacy config object but is fully
 * validated and typed via the Zod schema.
 *
 * Validation runs lazily on first property access.
 */
export const config: ValidatedConfig = new Proxy({} as ValidatedConfig, {
  get(_target, prop, _receiver) {
    return (getValidatedConfig() as any)[prop];
  },
});

// Re-export for backward compatibility
export type { ValidatedConfig };

// ============================================
// SIZE LIMITS (unchanged — not env-configured)
// ====================================

export const LIMITS = {
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_METADATA_SIZE: 100 * 1024, // 100KB
  MAX_PROPOSAL_BODY: 100_000, // 100KB text
  MAX_COMMENT_BODY: 10_000, // 10KB text
  MAX_JSON_BODY: 100 * 1024, // Express body limit
  IPFS_CACHE_TTL: 15 * 60 * 1000, // 15 minutes
} as const;

// ============================================
// ALLOWED MIME TYPES
// ============================================

export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/bmp",
  "image/tiff",
] as const;

// ============================================
// BN254 CONSTANTS
// ============================================

// BN254 field modulus (p)
export const BN254_MODULUS = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
);

// BN254 scalar field modulus (r)
export const BN254_SCALAR_FIELD = BigInt(
  "0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
);

// ============================================
// ENVIRONMENT VALIDATION (replaced by Zod)
// ============================================

/**
 * Legacy validateEnv() — now handled by config-schema.ts.
 * Kept as a no-op for backward compatibility with callers.
 *
 * The schema validation at import time (above) handles all validation.
 */
export function validateEnv(): void {
  // Validation already performed at module load time via validateConfig().
  // This function is kept as a no-op for backward compatibility.
}

// ============================================
// CONFIG CHANGE TRACKING
// ============================================

import { detectConfigChanges, type ConfigSnapshot } from "./config-schema.js";

/** Store previous snapshot for change detection */
let previousSnapshot: ConfigSnapshot = { ...process.env };

/**
 * Check for config changes since last check.
 * Call periodically or after SIGUSR2.
 * Returns changes detected (empty if none).
 */
export function checkConfigChanges(): Array<{ key: string; old: string | undefined; new: string | undefined }> {
  const currentSnapshot = { ...process.env };
  const changes = detectConfigChanges(previousSnapshot, currentSnapshot);
  previousSnapshot = currentSnapshot;

  if (changes.length > 0) {
    console.log(
      JSON.stringify({
        level: "info",
        event: "config_changed",
        changes: changes.map((c) => ({
          key: c.key,
          old: c.old,
          new: c.new,
        })),
      }),
    );
  }

  return changes;
}

// ============================================
// .env.example GENERATION
// ============================================

import { generateEnvExample } from "./config-schema.js";

/**
 * Generate .env.example content.
 * Used by the config:generate script.
 */
export function getEnvExample(): string {
  return generateEnvExample();
}
