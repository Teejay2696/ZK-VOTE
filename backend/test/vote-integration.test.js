import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";

const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "zkvote-vote-integration-"),
);
const dbPath = path.join(tempDir, "vote.db");

process.env.RELAYER_TEST_MODE = "true";
process.env.RELAYER_SECRET_KEY =
  "SCVZXEUXJLRZKPCUXGXN53BJTD3RAZPRSSXHXDGSZQH5EOGEUTWINUXF";
process.env.RELAYER_AUTH_TOKEN = "vote-integration-token";
process.env.AUTH_MASTER_KEY = "vote-integration-auth-master-key";
process.env.VOTING_CONTRACT_ID = "C".padEnd(56, "A");
process.env.TREE_CONTRACT_ID = "C".padEnd(56, "B");
process.env.COMMENTS_CONTRACT_ID = "C".padEnd(56, "D");
process.env.SOROBAN_RPC_URL = "http://localhost";
process.env.NETWORK_PASSPHRASE = "Test";
process.env.CORS_ORIGIN = "http://localhost";

const { default: votingRoutes, setVoteExecutorForTests } =
  await import("../src/routes/voting.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");
const { initDb, closeDb, getTransactionLog, upsertDao } =
  await import("../src/services/db.js");

const app = express();
app.use(express.json());
app.use(votingRoutes);
app.use(errorHandler);

const validProof = (cLastByte = "03") => ({
  a: "01".padStart(128, "0"),
  b: "02".padStart(256, "0"),
  c: cLastByte.padStart(128, "0"),
});

const uniqueFieldHex = (suffix) =>
  `${Date.now().toString(16)}${suffix}`.padStart(64, "0");

test("POST /vote completes a successful vote flow", async (t) => {
  initDb(dbPath);

  t.after(() => {
    setVoteExecutorForTests(null);
    closeDb();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Windows can keep SQLite handles briefly after close.
    }
  });

  upsertDao({
    id: 7,
    name: "Test DAO",
    creator: "G".padEnd(56, "A"),
    membership_open: 1,
    members_can_propose: 1,
    metadata_cid: null,
    member_count: 1,
  });

  let capturedInput;

  setVoteExecutorForTests(async (input) => {
    capturedInput = input;

    return {
      sendResult: {
        status: "PENDING",
      },
      result: {
        status: "SUCCESS",
      },
    };
  });

  const nullifier = uniqueFieldHex("01");
  const root = "02".padStart(64, "0");

  const response = await request(app)
    .post("/vote")
    .set("Authorization", "Bearer vote-integration-token")
    .send({
      daoId: 7,
      proposalId: 11,
      choice: true,
      nullifier,
      root,
      proof: validProof(),
      redundantProof: validProof(),
    });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    success: true,
    status: "SUCCESS",
  });

  assert.ok(capturedInput);
  assert.equal(capturedInput.daoId, 7);
  assert.equal(capturedInput.proposalId, 11);
  assert.equal(capturedInput.choice, true);
  assert.equal(capturedInput.nullifier, nullifier);
  assert.equal(capturedInput.root, root);

  // Conversion happens before the injected submission boundary.
  assert.ok(capturedInput.scNullifier);
  assert.ok(capturedInput.scRoot);
  assert.ok(capturedInput.scProof);

  assert.equal(getTransactionLog(nullifier), null);
});

test("POST /vote rejects mismatched redundant proof before submission", async (t) => {
  const mismatchTempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "zkvote-vote-redundancy-"),
  );
  initDb(path.join(mismatchTempDir, "vote.db"));

  t.after(() => {
    setVoteExecutorForTests(null);
    closeDb();
    try {
      fs.rmSync(mismatchTempDir, { recursive: true, force: true });
    } catch {
      // Windows can keep SQLite handles briefly after close.
    }
  });

  let executorCalled = false;
  setVoteExecutorForTests(async () => {
    executorCalled = true;
    return {
      sendResult: {
        status: "PENDING",
        hash: "should_not_submit",
      },
      result: {
        status: "SUCCESS",
      },
    };
  });

  const response = await request(app)
    .post("/vote")
    .set("Authorization", "Bearer vote-integration-token")
    .send({
      daoId: 7,
      proposalId: 11,
      choice: true,
      nullifier: uniqueFieldHex("03"),
      root: "04".padStart(64, "0"),
      proof: validProof(),
      redundantProof: validProof("04"),
    });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "VOTE_REJECTED");
  assert.equal(response.body.error.message, "VOTE_REJECTED");
  assert.equal(executorCalled, false);
});
