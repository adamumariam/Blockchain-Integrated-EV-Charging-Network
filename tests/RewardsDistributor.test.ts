// tests/RewardsDistributor.test.ts

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Cl, ClarityType, cvToValue } from "@stacks/transactions";

const ERR_UNAUTHORIZED = 100;
const ERR_INVALID_SESSION = 101;
const ERR_ALREADY_CLAIMED = 102;
const ERR_INVALID_AMOUNT = 103;
const ERR_INVALID_TIMESTAMP = 104;
const ERR_ORACLE_NOT_SET = 105;
const ERR_STATION_NOT_REGISTERED = 106;
const ERR_USER_NOT_REGISTERED = 107;
const ERR_MAX_REWARD_EXCEEDED = 112;
const ERR_INVALID_PROOF = 111;

interface Session {
  user: string;
  station: string;
  kwh: bigint;
  timestamp: bigint;
  offPeak: boolean;
  claimed: boolean;
  proofHash: Buffer;
}

class RewardsDistributorMock {
  state: {
    oracle: string | null;
    tokenContract: string;
    stationRegistry: string;
    userRegistry: string;
    totalRewards: bigint;
    nonce: bigint;
    sessions: Map<bigint, Session>;
    dailyRewards: Map<string, bigint>;
  };
  blockHeight: bigint = 1000n;
  caller: string = "ST1USER";
  stxTransfers: Array<{ amount: bigint; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      oracle: null,
      tokenContract: "SP000000000000000000002Q6VF78.energy-token",
      stationRegistry: "SP000000000000000000002Q6VF78.station-registry",
      userRegistry: "SP000000000000000000002Q6VF78.user-registry",
      totalRewards: 0n,
      nonce: 0n,
      sessions: new Map(),
      dailyRewards: new Map(),
    };
    this.blockHeight = 1000n;
    this.caller = "ST1USER";
    this.stxTransfers = [];
  }

  setOracle(newOracle: string): { ok: boolean; value: boolean } {
    if (this.state.oracle === null || this.caller !== this.state.oracle)
      return { ok: false, value: false };
    this.state.oracle = newOracle;
    return { ok: true, value: true };
  }

  setTokenContract(contract: string): { ok: boolean; value: boolean } {
    if (this.state.oracle === null || this.caller !== this.state.oracle)
      return { ok: false, value: false };
    this.state.tokenContract = contract;
    return { ok: true, value: true };
  }

  setStationRegistry(registry: string): { ok: boolean; value: boolean } {
    if (this.state.oracle === null || this.caller !== this.state.oracle)
      return { ok: false, value: false };
    this.state.stationRegistry = registry;
    return { ok: true, value: true };
  }

  setUserRegistry(registry: string): { ok: boolean; value: boolean } {
    if (this.state.oracle === null || this.caller !== this.state.oracle)
      return { ok: false, value: false };
    this.state.userRegistry = registry;
    return { ok: true, value: true };
  }

  isOffPeak(timestamp: bigint): boolean {
    const hour = Number((timestamp % 1440n) / 60n);
    return hour >= 22 || hour < 6;
  }

  isRegistered(principal: string): boolean {
    return principal === "ST1USER" || principal === "ST1STATION";
  }

  assertRegistered(principal: string): { ok: boolean; value: boolean } {
    return { ok: true, value: this.isRegistered(principal) };
  }

  mint(amount: bigint, to: string): { ok: boolean; value: boolean } {
    return { ok: true, value: true };
  }

  private getDay(): bigint {
    return this.blockHeight / 1440n;
  }

  private updateDailyCap(
    user: string,
    amount: bigint
  ): { ok: boolean; value: boolean } {
    const key = `${user}-${this.getDay()}`;
    const current = this.state.dailyRewards.get(key) || 0n;
    if (current + amount > 10000n) return { ok: false, value: false };
    this.state.dailyRewards.set(key, current + amount);
    return { ok: true, value: true };
  }

  private verifyProof(
    sessionId: bigint,
    proof: Buffer,
    user: string,
    station: string,
    kwh: bigint,
    ts: bigint
  ): boolean {
    const data = `${sessionId}${user}${station}${kwh}${ts}${this.blockHeight}`;
    const hash = Buffer.from(
      require("crypto").createHash("sha256").update(data).digest()
    );
    return Buffer.compare(proof, hash) === 0;
  }

  submitSession(
    station: string,
    kwh: bigint,
    timestamp: bigint,
    proof: Buffer
  ): { ok: boolean; value: bigint | number } {
    if (!this.state.oracle) return { ok: false, value: ERR_ORACLE_NOT_SET };
    if (!this.isRegistered(this.caller))
      return { ok: false, value: ERR_USER_NOT_REGISTERED };
    if (!this.isRegistered(station))
      return { ok: false, value: ERR_STATION_NOT_REGISTERED };
    if (kwh <= 0n || kwh > 500n)
      return { ok: false, value: ERR_INVALID_AMOUNT };
    if (timestamp < this.blockHeight - 1440n || timestamp > this.blockHeight)
      return { ok: false, value: ERR_INVALID_TIMESTAMP };
    if (
      !this.verifyProof(
        this.state.nonce,
        proof,
        this.caller,
        station,
        kwh,
        timestamp
      )
    )
      return { ok: false, value: ERR_INVALID_PROOF };

    const offPeak = this.isOffPeak(timestamp);
    this.state.sessions.set(this.state.nonce, {
      user: this.caller,
      station,
      kwh,
      timestamp,
      offPeak,
      claimed: false,
      proofHash: proof,
    });
    const id = this.state.nonce;
    this.state.nonce += 1n;
    return { ok: true, value: id };
  }

  claimReward(sessionId: bigint): { ok: boolean; value: bigint | number } {
    const session = this.state.sessions.get(sessionId);
    if (!session) return { ok: false, value: ERR_INVALID_SESSION };
    if (session.user !== this.caller)
      return { ok: false, value: ERR_UNAUTHORIZED };
    if (session.claimed) return { ok: false, value: ERR_ALREADY_CLAIMED };

    const base = session.kwh * 100n;
    const multiplier = session.offPeak ? 200n : 50n;
    const reward = (base * multiplier) / 100n;

    const capResult = this.updateDailyCap(session.user, reward);
    if (!capResult.ok) return { ok: false, value: ERR_MAX_REWARD_EXCEEDED };

    this.state.sessions.set(sessionId, { ...session, claimed: true });
    this.state.totalRewards += reward;
    return { ok: true, value: reward };
  }

  getPendingReward(sessionId: bigint): { ok: boolean; value: bigint | number } {
    const session = this.state.sessions.get(sessionId);
    if (!session || session.claimed)
      return { ok: false, value: ERR_ALREADY_CLAIMED };
    const base = session.kwh * 100n;
    const multiplier = session.offPeak ? 200n : 50n;
    return { ok: true, value: (base * multiplier) / 100n };
  }

  getUserRewardsToday(user: string): { ok: boolean; value: bigint } {
    const key = `${user}-${this.getDay()}`;
    return { ok: true, value: this.state.dailyRewards.get(key) || 0n };
  }
}

describe("RewardsDistributor", () => {
  let mock: RewardsDistributorMock;
  let simnet: any;

  beforeEach(() => {
    mock = new RewardsDistributorMock();
    mock.reset();
    mock.state.oracle = "ST1ORACLE";
    mock.caller = "ST1ORACLE";
    mock.setOracle("ST1ORACLE");
    mock.setStationRegistry("mock-station");
    mock.setUserRegistry("mock-user");
    simnet = { blockHeight: 1000 };
  });

  it("rejects claim by non-owner", () => {
    mock.caller = "ST1USER";
    const proof = Buffer.from(
      require("crypto")
        .createHash("sha256")
        .update("0ST1USERST1STATION1009001000")
        .digest()
    );
    mock.submitSession("ST1STATION", 100n, 900n, proof);
    mock.caller = "ST2HACKER";
    const claim = mock.claimReward(0n);
    expect(claim.ok).toBe(false);
    expect(claim.value).toBe(ERR_UNAUTHORIZED);
  });

  it("applies peak multiplier correctly", () => {
    mock.caller = "ST1USER";
    const proof = Buffer.from(
      require("crypto")
        .createHash("sha256")
        .update("0ST1USERST1STATION1007201000")
        .digest()
    );
    mock.submitSession("ST1STATION", 100n, 720n, proof);
    const claim = mock.claimReward(0n);
    expect(claim.ok).toBe(true);
    expect(claim.value).toBe(5000n);
  });

  it("enforces daily reward cap", () => {
    mock.caller = "ST1USER";
    let proof = Buffer.from(
      require("crypto")
        .createHash("sha256")
        .update("0ST1USERST1STATION5009001000")
        .digest()
    );
    mock.submitSession("ST1STATION", 500n, 900n, proof);
    mock.claimReward(0n);

    proof = Buffer.from(
      require("crypto")
        .createHash("sha256")
        .update("1ST1USERST1STATION5009011000")
        .digest()
    );
    mock.submitSession("ST1STATION", 500n, 901n, proof);
    const claim = mock.claimReward(1n);
    expect(claim.ok).toBe(false);
    expect(claim.value).toBe(ERR_MAX_REWARD_EXCEEDED);
  });

  it("rejects invalid proof", () => {
    mock.caller = "ST1USER";
    const badProof = Buffer.alloc(32, 0);
    const result = mock.submitSession("ST1STATION", 100n, 900n, badProof);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROOF);
  });

  it("rejects unregistered user", () => {
    mock.caller = "ST3UNKNOWN";
    const proof = Buffer.from(
      require("crypto")
        .createHash("sha256")
        .update("0ST3UNKNOWNST1STATION1009001000")
        .digest()
    );
    const result = mock.submitSession("ST1STATION", 100n, 900n, proof);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_USER_NOT_REGISTERED);
  });

  it("rejects kwh over limit", () => {
    mock.caller = "ST1USER";
    const proof = Buffer.from(
      require("crypto")
        .createHash("sha256")
        .update("0ST1USERST1STATION5019001000")
        .digest()
    );
    const result = mock.submitSession("ST1STATION", 501n, 900n, proof);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AMOUNT);
  });

  it("rejects double claim", () => {
    mock.caller = "ST1USER";
    const proof = Buffer.from(
      require("crypto")
        .createHash("sha256")
        .update("0ST1USERST1STATION1009001000")
        .digest()
    );
    mock.submitSession("ST1STATION", 100n, 900n, proof);
    mock.claimReward(0n);
    const second = mock.claimReward(0n);
    expect(second.ok).toBe(false);
    expect(second.value).toBe(ERR_ALREADY_CLAIMED);
  });
});
