import { describe, it, expect, beforeEach } from "vitest";

const ERR_UNAUTHORIZED = 100;
const ERR_ALREADY_REGISTERED = 101;
const ERR_NOT_REGISTERED = 102;
const ERR_STATION_NOT_OWNER = 108;

interface Station {
  name: string;
  owner: string;
  location: string;
  powerKw: bigint;
  pricePerKwh: bigint;
  status: boolean;
  registeredAt: bigint;
}

class StationRegistryMock {
  state: {
    admin: string;
    registrationFee: bigint;
    totalStations: bigint;
    stations: Map<bigint, Station>;
    byOwner: Map<string, bigint>;
    byLocation: Map<string, bigint>;
  };
  blockHeight: bigint = 1000n;
  caller: string = "ST1ADMIN";
  stxTransfers: Array<{ amount: bigint; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      admin: "ST1ADMIN",
      registrationFee: 1000000n,
      totalStations: 0n,
      stations: new Map(),
      byOwner: new Map(),
      byLocation: new Map(),
    };
    this.blockHeight = 1000n;
    this.caller = "ST1ADMIN";
    this.stxTransfers = [];
  }

  setAdmin(newAdmin: string): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setRegistrationFee(newFee: bigint): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (newFee <= 0n) return { ok: false, value: false };
    this.state.registrationFee = newFee;
    return { ok: true, value: true };
  }

  registerStation(
    name: string,
    location: string,
    powerKw: bigint,
    pricePerKwh: bigint
  ): { ok: boolean; value: bigint | number } {
    if (this.state.byOwner.has(this.caller))
      return { ok: false, value: ERR_ALREADY_REGISTERED };
    if (name.length === 0 || name.length > 50) return { ok: false, value: 103 };
    if (location.length === 0 || location.length > 100)
      return { ok: false, value: 103 };
    if (powerKw < 1n || powerKw > 1000n) return { ok: false, value: 104 };
    if (pricePerKwh <= 0n) return { ok: false, value: 106 };
    if (this.state.byLocation.has(location))
      return { ok: false, value: ERR_ALREADY_REGISTERED };

    this.stxTransfers.push({
      amount: this.state.registrationFee,
      from: this.caller,
      to: this.state.admin,
    });

    const id = this.state.totalStations;
    this.state.stations.set(id, {
      name,
      owner: this.caller,
      location,
      powerKw,
      pricePerKwh,
      status: true,
      registeredAt: this.blockHeight,
    });
    this.state.byOwner.set(this.caller, id);
    this.state.byLocation.set(location, id);
    this.state.totalStations += 1n;
    return { ok: true, value: id };
  }

  updateStation(
    stationId: bigint,
    name: string,
    location: string,
    powerKw: bigint,
    pricePerKwh: bigint
  ): { ok: boolean; value: boolean } {
    const station = this.state.stations.get(stationId);
    if (!station) return { ok: false, value: false };
    if (station.owner !== this.caller) return { ok: false, value: false };
    if (name.length === 0 || name.length > 50)
      return { ok: false, value: false };
    if (powerKw < 1n || powerKw > 1000n) return { ok: false, value: false };
    if (pricePerKwh <= 0n) return { ok: false, value: false };

    if (station.location !== location) {
      if (this.state.byLocation.has(location))
        return { ok: false, value: false };
      this.state.byLocation.delete(station.location);
      this.state.byLocation.set(location, stationId);
    }

    this.state.stations.set(stationId, {
      ...station,
      name,
      location,
      powerKw,
      pricePerKwh,
    });
    return { ok: true, value: true };
  }

  toggleStatus(stationId: bigint): { ok: boolean; value: boolean } {
    const station = this.state.stations.get(stationId);
    if (!station) return { ok: false, value: false };
    if (station.owner !== this.caller) return { ok: false, value: false };
    this.state.stations.set(stationId, { ...station, status: !station.status });
    return { ok: true, value: true };
  }

  transferOwnership(
    stationId: bigint,
    newOwner: string
  ): { ok: boolean; value: boolean } {
    const station = this.state.stations.get(stationId);
    if (!station) return { ok: false, value: false };
    if (station.owner !== this.caller) return { ok: false, value: false };
    this.state.byOwner.delete(station.owner);
    this.state.byOwner.set(newOwner, stationId);
    this.state.stations.set(stationId, { ...station, owner: newOwner });
    return { ok: true, value: true };
  }

  deregisterStation(stationId: bigint): { ok: boolean; value: boolean } {
    const station = this.state.stations.get(stationId);
    if (!station) return { ok: false, value: false };
    if (station.owner !== this.caller && this.caller !== this.state.admin)
      return { ok: false, value: false };
    this.state.stations.delete(stationId);
    this.state.byOwner.delete(station.owner);
    this.state.byLocation.delete(station.location);
    this.state.totalStations -= 1n;
    return { ok: true, value: true };
  }

  getStation(id: bigint): Station | null {
    return this.state.stations.get(id) || null;
  }

  isRegistered(principal: string): boolean {
    return this.state.byOwner.has(principal);
  }

  getTotalStations(): { ok: boolean; value: bigint } {
    return { ok: true, value: this.state.totalStations };
  }
}

describe("StationRegistry", () => {
  let registry: StationRegistryMock;

  beforeEach(() => {
    registry = new StationRegistryMock();
    registry.reset();
  });

  it("registers a station successfully", () => {
    registry.caller = "ST1OPERATOR";
    const result = registry.registerStation(
      "FastCharge X1",
      "Downtown Plaza",
      150n,
      5000n
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0n);
    expect(registry.stxTransfers).toContainEqual({
      amount: 1000000n,
      from: "ST1OPERATOR",
      to: "ST1ADMIN",
    });
  });

  it("prevents double registration by owner", () => {
    registry.caller = "ST1OPERATOR";
    registry.registerStation("Station A", "Loc1", 100n, 4000n);
    const result = registry.registerStation("Station B", "Loc2", 200n, 5000n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_REGISTERED);
  });

  it("prevents duplicate location", () => {
    registry.caller = "ST1OP1";
    registry.registerStation("A", "SameLoc", 100n, 4000n);
    registry.caller = "ST1OP2";
    const result = registry.registerStation("B", "SameLoc", 150n, 4500n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_REGISTERED);
  });

  it("updates station details", () => {
    registry.caller = "ST1OP";
    registry.registerStation("OldName", "OldLoc", 100n, 4000n);
    const result = registry.updateStation(0n, "NewName", "NewLoc", 200n, 5500n);
    expect(result.ok).toBe(true);
    const station = registry.getStation(0n);
    expect(station?.name).toBe("NewName");
    expect(station?.location).toBe("NewLoc");
    expect(station?.powerKw).toBe(200n);
  });

  it("rejects update by non-owner", () => {
    registry.caller = "ST1OP1";
    registry.registerStation("A", "Loc1", 100n, 4000n);
    registry.caller = "ST1HACKER";
    const result = registry.updateStation(0n, "Hacked", "Loc1", 100n, 4000n);
    expect(result.ok).toBe(false);
  });

  it("toggles station status", () => {
    registry.caller = "ST1OP";
    registry.registerStation("A", "Loc1", 100n, 4000n);
    registry.toggleStatus(0n);
    const station = registry.getStation(0n);
    expect(station?.status).toBe(false);
  });

  it("transfers ownership", () => {
    registry.caller = "ST1OLD";
    registry.registerStation("A", "Loc1", 100n, 4000n);
    registry.transferOwnership(0n, "ST1NEW");
    const station = registry.getStation(0n);
    expect(station?.owner).toBe("ST1NEW");
    expect(registry.state.byOwner.get("ST1OLD")).toBeUndefined();
  });

  it("deregisters station as owner", () => {
    registry.caller = "ST1OP";
    registry.registerStation("A", "Loc1", 100n, 4000n);
    const result = registry.deregisterStation(0n);
    expect(result.ok).toBe(true);
    expect(registry.state.totalStations).toBe(0n);
    expect(registry.getStation(0n)).toBeNull();
  });

  it("deregisters station as admin", () => {
    registry.caller = "ST1OP";
    registry.registerStation("A", "Loc1", 100n, 4000n);
    registry.caller = "ST1ADMIN";
    const result = registry.deregisterStation(0n);
    expect(result.ok).toBe(true);
  });

  it("changes registration fee", () => {
    registry.caller = "ST1ADMIN";
    registry.setRegistrationFee(2000000n);
    registry.caller = "ST1OP";
    registry.registerStation("A", "Loc1", 100n, 4000n);
    expect(registry.stxTransfers[0].amount).toBe(2000000n);
  });

  it("queries station by owner and location", () => {
    registry.caller = "ST1OP";
    registry.registerStation("Fast", "CityCenter", 120n, 4800n);
    expect(registry.state.byOwner.get("ST1OP")).toBe(0n);
    expect(registry.state.byLocation.get("CityCenter")).toBe(0n);
  });

  it("returns correct total count", () => {
    registry.caller = "ST1OP1";
    registry.registerStation("A", "L1", 100n, 4000n);
    registry.caller = "ST1OP2";
    registry.registerStation("B", "L2", 150n, 5000n);
    expect(registry.getTotalStations().value).toBe(2n);
  });
});
