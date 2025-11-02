// tests/EnergyToken.test.ts

import { describe, it, expect, beforeEach } from "vitest";

const ERR_UNAUTHORIZED = 100;
const ERR_INSUFFICIENT_BALANCE = 102;
const ERR_ALREADY_INITIALIZED = 106;
const ERR_NOT_INITIALIZED = 107;

interface Allowance {
  owner: string;
  spender: string;
  amount: bigint;
}

class EnergyTokenMock {
  state: {
    owner: string;
    initialized: boolean;
    totalSupply: bigint;
    balances: Map<string, bigint>;
    allowances: Map<string, Allowance>;
  };
  caller: string = "ST1OWNER";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      owner: "ST1OWNER",
      initialized: false,
      totalSupply: 0n,
      balances: new Map(),
      allowances: new Map(),
    };
    this.caller = "ST1OWNER";
  }

  private getKey(owner: string, spender: string): string {
    return `${owner}-${spender}`;
  }

  initialize(
    initialSupply: bigint,
    recipient: string
  ): { ok: boolean; value: boolean } {
    if (this.state.initialized) return { ok: false, value: false };
    if (this.caller !== this.state.owner) return { ok: false, value: false };
    this.state.balances.set(
      recipient,
      (this.state.balances.get(recipient) || 0n) + initialSupply
    );
    this.state.totalSupply = initialSupply;
    this.state.initialized = true;
    return { ok: true, value: true };
  }

  getTotalSupply(): { ok: boolean; value: bigint } {
    return { ok: true, value: this.state.totalSupply };
  }

  getBalance(account: string): { ok: boolean; value: bigint } {
    return { ok: true, value: this.state.balances.get(account) || 0n };
  }

  getAllowance(owner: string, spender: string): { ok: boolean; value: bigint } {
    const key = this.getKey(owner, spender);
    const allowance = this.state.allowances.get(key);
    return { ok: true, value: allowance?.amount || 0n };
  }

  transfer(
    amount: bigint,
    sender: string,
    recipient: string
  ): { ok: boolean; value: boolean } {
    if (!this.state.initialized) return { ok: false, value: false };
    if (this.caller !== sender && this.caller !== recipient)
      return { ok: false, value: false };
    const senderBal = this.state.balances.get(sender) || 0n;
    if (senderBal < amount) return { ok: false, value: false };
    this.state.balances.set(sender, senderBal - amount);
    this.state.balances.set(
      recipient,
      (this.state.balances.get(recipient) || 0n) + amount
    );
    return { ok: true, value: true };
  }

  approve(spender: string, amount: bigint): { ok: boolean; value: boolean } {
    if (!this.state.initialized) return { ok: false, value: false };
    const key = this.getKey(this.caller, spender);
    this.state.allowances.set(key, { owner: this.caller, spender, amount });
    return { ok: true, value: true };
  }

  transferFrom(
    owner: string,
    recipient: string,
    amount: bigint
  ): { ok: boolean; value: boolean } {
    if (!this.state.initialized) return { ok: false, value: false };
    const key = this.getKey(owner, this.caller);
    const allowance = this.state.allowances.get(key);
    if (!allowance || allowance.amount < amount)
      return { ok: false, value: false };
    const ownerBal = this.state.balances.get(owner) || 0n;
    if (ownerBal < amount) return { ok: false, value: false };
    this.state.balances.set(owner, ownerBal - amount);
    this.state.balances.set(
      recipient,
      (this.state.balances.get(recipient) || 0n) + amount
    );
    this.state.allowances.set(key, {
      ...allowance,
      amount: allowance.amount - amount,
    });
    return { ok: true, value: true };
  }

  mint(amount: bigint, recipient: string): { ok: boolean; value: boolean } {
    if (!this.state.initialized) return { ok: false, value: false };
    if (this.caller !== this.state.owner) return { ok: false, value: false };
    this.state.balances.set(
      recipient,
      (this.state.balances.get(recipient) || 0n) + amount
    );
    this.state.totalSupply += amount;
    return { ok: true, value: true };
  }

  burn(amount: bigint, sender: string): { ok: boolean; value: boolean } {
    if (!this.state.initialized) return { ok: false, value: false };
    if (this.caller !== sender && this.caller !== this.state.owner)
      return { ok: false, value: false };
    const bal = this.state.balances.get(sender) || 0n;
    if (bal < amount) return { ok: false, value: false };
    this.state.balances.set(sender, bal - amount);
    this.state.totalSupply -= amount;
    return { ok: true, value: true };
  }

  setOwner(newOwner: string): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.owner) return { ok: false, value: false };
    this.state.owner = newOwner;
    return { ok: true, value: true };
  }

  revokeAllowance(spender: string): { ok: boolean; value: boolean } {
    if (!this.state.initialized) return { ok: false, value: false };
    const key = this.getKey(this.caller, spender);
    this.state.allowances.delete(key);
    return { ok: true, value: true };
  }
}

describe("EnergyToken", () => {
  let token: EnergyTokenMock;

  beforeEach(() => {
    token = new EnergyTokenMock();
    token.reset();
  });

  it("initializes with correct supply", () => {
    const result = token.initialize(1000000n, "ST1USER");
    expect(result.ok).toBe(true);
    expect(token.getTotalSupply().value).toBe(1000000n);
    expect(token.getBalance("ST1USER").value).toBe(1000000n);
  });

  it("rejects double initialization", () => {
    token.initialize(1000n, "ST1USER");
    const result = token.initialize(500n, "ST2USER");
    expect(result.ok).toBe(false);
  });

  it("transfers tokens correctly", () => {
    token.initialize(1000n, "ST1USER");
    token.caller = "ST1USER";
    token.transfer(300n, "ST1USER", "ST2USER");
    expect(token.getBalance("ST1USER").value).toBe(700n);
    expect(token.getBalance("ST2USER").value).toBe(300n);
  });

  it("rejects transfer with insufficient balance", () => {
    token.initialize(100n, "ST1USER");
    token.caller = "ST1USER";
    const result = token.transfer(200n, "ST1USER", "ST2USER");
    expect(result.ok).toBe(false);
  });

  it("allows approved spending", () => {
    token.initialize(1000n, "ST1OWNER");
    token.caller = "ST1OWNER";
    token.transfer(500n, "ST1OWNER", "ST2USER");
    token.caller = "ST2USER";
    token.approve("ST3SPENDER", 200n);
    token.caller = "ST3SPENDER";
    const result = token.transferFrom("ST2USER", "ST4RECIPIENT", 150n);
    expect(result.ok).toBe(true);
    expect(token.getBalance("ST4RECIPIENT").value).toBe(150n);
    expect(token.getAllowance("ST2USER", "ST3SPENDER").value).toBe(50n);
  });

  it("rejects transfer-from over allowance", () => {
    token.initialize(1000n, "ST1OWNER");
    token.caller = "ST1OWNER";
    token.transfer(500n, "ST1OWNER", "ST2USER");
    token.caller = "ST2USER";
    token.approve("ST3SPENDER", 100n);
    token.caller = "ST3SPENDER";
    const result = token.transferFrom("ST2USER", "ST4RECIPIENT", 150n);
    expect(result.ok).toBe(false);
  });

  it("mints new tokens as owner", () => {
    token.initialize(1000n, "ST1USER");
    token.caller = "ST1OWNER";
    token.mint(500n, "ST2USER");
    expect(token.getTotalSupply().value).toBe(1500n);
    expect(token.getBalance("ST2USER").value).toBe(500n);
  });

  it("rejects mint by non-owner", () => {
    token.initialize(1000n, "ST1USER");
    token.caller = "ST2HACKER";
    const result = token.mint(100n, "ST3USER");
    expect(result.ok).toBe(false);
  });

  it("burns tokens correctly", () => {
    token.initialize(1000n, "ST1USER");
    token.caller = "ST1USER";
    token.burn(300n, "ST1USER");
    expect(token.getBalance("ST1USER").value).toBe(700n);
    expect(token.getTotalSupply().value).toBe(700n);
  });

  it("allows owner to burn others' tokens", () => {
    token.initialize(1000n, "ST1OWNER");
    token.caller = "ST1OWNER";
    token.transfer(400n, "ST1OWNER", "ST2USER");
    token.burn(200n, "ST2USER");
    expect(token.getBalance("ST2USER").value).toBe(200n);
  });

  it("changes owner successfully", () => {
    token.initialize(1000n, "ST1USER");
    token.caller = "ST1OWNER";
    token.setOwner("ST2NEWOWNER");
    expect(token.state.owner).toBe("ST2NEWOWNER");
  });

  it("revokes allowance", () => {
    token.initialize(1000n, "ST1USER");
    token.caller = "ST1USER";
    token.approve("ST2SPENDER", 500n);
    token.revokeAllowance("ST2SPENDER");
    expect(token.getAllowance("ST1USER", "ST2SPENDER").value).toBe(0n);
  });

  it("rejects operations before initialization", () => {
    const transfer = token.transfer(100n, "ST1", "ST2");
    const mint = token.mint(100n, "ST1");
    const burn = token.burn(100n, "ST1");
    expect(transfer.ok).toBe(false);
    expect(mint.ok).toBe(false);
    expect(burn.ok).toBe(false);
  });
});
