import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog, productAccess, products } from "@/db/schema";
import { createProduct } from "@/lib/settings/products";
import { upsertProductAccess } from "@/lib/settings/product-access";
import { createProductSchema, upsertProductAccessSchema } from "@/lib/settings/schemas";

describe("settings schemas", () => {
  it("requires catalog number and description", () => {
    const bad = createProductSchema.safeParse({
      vendorId: 1,
      catalogNumber: "",
      description: "",
    });
    expect(bad.success).toBe(false);
  });

  it("accepts access mode and par level", () => {
    const ok = upsertProductAccessSchema.parse({
      productId: "1",
      departmentId: "1",
      accessMode: "on_shelf",
      locationId: "1",
      parLevel: "5",
    });
    expect(ok.parLevel).toBe(5);
    expect(ok.accessMode).toBe("on_shelf");
  });
});

describe("settings create product + access", () => {
  let dbPath: string;
  let prevPath: string | undefined;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ku-settings-test-${Date.now()}.sqlite`);
    prevPath = process.env.KU_DB_PATH;
    process.env.KU_DB_PATH = dbPath;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = undefined;
    execSync("npx tsx db/seed.ts", {
      cwd: path.resolve(__dirname, "../../.."),
      env: { ...process.env, KU_DB_PATH: dbPath },
      stdio: "pipe",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = undefined;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const held = (globalThis as any).__kuDb as { sqlite?: { close: () => void } } | undefined;
    held?.sqlite?.close();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = undefined;
    if (prevPath === undefined) delete process.env.KU_DB_PATH;
    else process.env.KU_DB_PATH = prevPath;
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("adds a product with identifiers, access mode, par level, and audit rows", async () => {
    const { createDb } = await import("@/db");
    const created = createDb(dbPath);
    const { db } = created;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__kuDb = created;

    const product = await createProduct(
      {
        vendorId: 1,
        catalogNumber: "NEW-SHEATH-01",
        description: "Phase 2 test sheath (placeholder)",
        category: "sheath",
        gtin: "00012345678905",
        hibc: "+H123TEST0",
      },
      4,
      db,
    );

    expect(product.catalogNumber).toBe("NEW-SHEATH-01");

    await upsertProductAccess(
      {
        productId: product.id,
        departmentId: 1,
        accessMode: "on_shelf",
        locationId: 1,
        parLevel: 6,
      },
      2,
      db,
    );

    const listed = await db
      .select()
      .from(products)
      .where(eq(products.catalogNumber, "NEW-SHEATH-01"));
    expect(listed).toHaveLength(1);

    const access = await db
      .select()
      .from(productAccess)
      .where(eq(productAccess.productId, product.id));
    expect(access[0]?.accessMode).toBe("on_shelf");
    expect(access[0]?.parLevel).toBe(6);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entity, "products"));
    expect(audits.some((a) => a.action === "create" && a.entityId === product.id)).toBe(
      true,
    );

    const accessAudits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entity, "product_access"));
    expect(
      accessAudits.some((a) => a.entityId === product.id && a.detail?.includes("par=6")),
    ).toBe(true);
  });
});
