import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.APP_ENCRYPTION_KEY = "a".repeat(64);

type Row = Record<string, unknown>;
let selectRows: Row[] = [];
const calls: { sql: string; params: unknown[] }[] = [];
vi.mock("@/lib/db", () => ({
  dbQuery: vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.trim().startsWith("SELECT")) return { rows: selectRows, rowCount: selectRows.length };
    return { rows: [], rowCount: 1 };
  }),
  getDb: () => ({ connect: async () => providerClient }),
}));

const clientCalls: string[] = [];
let sellerInsertRows: Row[] = [];
const providerClient = {
  query: vi.fn(async (sql: string, _params?: unknown[]) => {
    clientCalls.push(sql.trim().split(/\s+/).slice(0, 3).join(" "));
    if (sql.includes("INSERT INTO users")) return { rows: [{ id: "u-1" }] };
    if (sql.includes("INSERT INTO sellers")) return { rows: sellerInsertRows };
    return { rows: [] };
  }),
  release: () => undefined,
};

import {
  decryptErpKey,
  encryptErpKey,
  findSellerByPartnerKey,
  getSellerErpCredentials,
  hashErpKey,
} from "@/lib/seller/erp-credentials";
import { getPartnerSeller } from "@/app/api/partner/_lib/auth";

const KEY = "msk_0123456789abcdef";

beforeEach(() => {
  selectRows = [];
  calls.length = 0;
  clientCalls.length = 0;
  sellerInsertRows = [];
  process.env.PARTNER_PROVISION_SECRET = "s".repeat(32);
});

describe("ERP key storage", () => {
  it("encrypts with a random IV and decrypts back", () => {
    const a = encryptErpKey(KEY);
    const b = encryptErpKey(KEY);
    expect(a).not.toBe(b);
    expect(a).not.toContain(KEY);
    expect(decryptErpKey(a)).toBe(KEY);
  });

  it("looks up partner sellers by hash and upgrades legacy plaintext rows", async () => {
    selectRows = [{ id: "s-1", display_name: "Firma", legacy: true }];
    const seller = await findSellerByPartnerKey(KEY);
    expect(seller).toEqual({ id: "s-1", display_name: "Firma" });
    expect(calls[0].params[0]).toBe(hashErpKey(KEY));
    const upgrade = calls.find((c) => c.sql.includes("erp_api_key = NULL"));
    expect(upgrade?.params[1]).toBe(hashErpKey(KEY));
    expect(decryptErpKey(String(upgrade?.params[2]))).toBe(KEY);
  });

  it("returns decrypted credentials for outbound calls", async () => {
    selectRows = [{ erp_api_url: "https://erp.example.com", erp_api_key: null, erp_api_key_enc: encryptErpKey(KEY), erp_connected: true }];
    await expect(getSellerErpCredentials("s-1")).resolves.toEqual({ url: "https://erp.example.com", key: KEY });
  });
});

describe("partner auto-provision", () => {
  function req(): Request {
    return new Request("http://localhost/api/partner/products", {
      headers: {
        "x-api-key": KEY,
        "x-partner-secret": "s".repeat(32),
        "x-company-name": "Firma SRL",
        "x-company-email": "victim@example.com",
      },
    });
  }

  it("never rebinds an existing seller found by email", async () => {
    sellerInsertRows = []; // ON CONFLICT (email) DO NOTHING → nothing returned
    const seller = await getPartnerSeller(req());
    expect(seller).toBeNull();
    expect(clientCalls).toContain("ROLLBACK");
    expect(clientCalls).not.toContain("COMMIT");
  });

  it("creates a new seller storing only hash + ciphertext", async () => {
    sellerInsertRows = [{ id: "s-new", display_name: "Firma SRL" }];
    const seller = await getPartnerSeller(req());
    expect(seller?.id).toBe("s-new");
    const insert = providerClient.query.mock.calls.find((c) => String(c[0]).includes("INSERT INTO sellers"));
    const params = (insert?.[1] ?? []) as unknown[];
    expect(params).not.toContain(KEY);
    expect(params).toContain(hashErpKey(KEY));
    expect(String(insert?.[0])).toContain("DO NOTHING");
  });
});
