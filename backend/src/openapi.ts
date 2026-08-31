/**
 * OpenAPI 3.1 Specification for ZKVote Backend (Task #339)
 *
 * Source of truth: the committed `backend/openapi.json` (generated docs for
 * every versioned route). `buildOpenApiDocument()` returns that document so
 * the served `/api-docs/openapi.json`, the ``docs:*`` scripts, and the doc
 * itself stay byte-for-byte consistent (see scripts/generate-openapi.ts).
 *
 * Also exports the zod *response* schemas used to validate live responses in
 * test/openapi-validation.test.js, and `ENDPOINTS` (method + route for every
 * documented path) used for API.md coverage and docs accounting.
 */

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "ZKVote Relayer API",
    version: "1.0.0",
    description: "Anonymous voting relayer with full audit trail and incident response",
  },
  servers: [{ url: "http://localhost:3001", description: "Local" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      relayerAuth: { type: "apiKey", in: "header", name: "X-Relayer-Auth" },
    },
    schemas: {
      VoteRequest: {
        type: "object",
        required: ["daoId", "proposalId", "choice", "nullifier", "root", "proof", "publicSignals"],
        properties: {
          daoId: { type: "integer" },
          proposalId: { type: "integer" },
          choice: { type: "boolean" },
          nullifier: { type: "string", description: "BN254 field element hex < modulus (redacted in audit)" },
          root: { type: "string", description: "Merkle root hex (redacted in audit)" },
          proof: { type: "object", description: "Groth16 proof (redacted in audit)", properties: { a: { type: "string" }, b: { type: "string" }, c: { type: "string" } } },
          publicSignals: { $ref: "#/components/schemas/PublicSignals" },
        },
      },
      PublicSignals: {
        type: "object",
        required: ["root", "nullifier", "daoId", "proposalId", "voteChoice", "numCandidates"],
        properties: {
          root: { type: "string" },
          nullifier: { type: "string" },
          daoId: { type: "string" },
          proposalId: { type: "string" },
          voteChoice: { type: "string" },
          numCandidates: { type: "string" },
        }
      },
      AuditEntry: {
        type: "object",
        properties: {
          id: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
          requestId: { type: "string" },
          method: { type: "string" },
          path: { type: "string" },
          action: { type: "string" },
          actor: { type: "string", description: "Hashed actor identifier (PII redacted)" },
          statusCode: { type: "integer" },
          immutable: { type: "boolean", enum: [true] },
        },
      },
      RemediationAction: {
        type: "object",
        required: ["action", "target", "reason", "idempotencyKey"],
        properties: {
          action: { type: "string", enum: ["freeze_dao", "unfreeze_dao", "pause_voting", "resume_voting", "revoke_member", "restore_member", "emergency_pause", "emergency_resume", "rotate_vk", "quarantine_proposal"] },
          target: { type: "string", description: "DAO or proposal identifier" },
          reason: { type: "string", minLength: 5 },
          idempotencyKey: { type: "string", minLength: 8, description: "Replay protection - duplicate keys return 409" },
          metadata: { type: "object", additionalProperties: true },
        },
      },
    };

    for (const status of ep.errorStatuses ?? []) {
      responses[status] = {
        description: `Error (HTTP ${status})`,
        content: { "application/json": { schema: errorResponseSchema } },
      };
    }

    registry.registerPath({
      method: ep.method,
      path: toOpenApiPath(ep.path),
      tags: [ep.tag],
      summary: ep.summary,
      description: ep.rateLimit
        ? `Rate limit: ${ep.rateLimit}.`
        : "No rate limit.",
      security: ep.auth ? [{ [SECURITY_SCHEME]: [] }] : [],
      request: {
        ...(ep.params ? { params: z.object(ep.params) } : {}),
        ...(ep.query ? { query: z.object(ep.query) } : {}),
        ...(ep.body
          ? { body: { content: { "application/json": { schema: ep.body } } } }
          : {}),
      },
      responses,
    });
  }

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "ZK-VOTE Relayer API",
      version: "1.0.0",
      description:
        "Backend relayer for anonymous voting on Stellar/Soroban. Generated from route " +
        "definitions and Zod validation schemas — see backend/API.md for prose docs and " +
        "GET /api-docs for interactive documentation.",
    },
    servers: [
      { url: "http://localhost:3001", description: "Local development" },
    ],
  });
}
