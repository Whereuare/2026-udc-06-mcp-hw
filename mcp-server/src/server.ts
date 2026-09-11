/**
 * MCP server over the seeded catalog domain — SKELETON for Task B.
 *
 * Fill in the TODOs. Requirements: >= 2 tools, >= 1 resource, read-only,
 * and the catalog logic IMPORTED from app/ rather than reimplemented here.
 *
 * API note: the SDK is mid-transition between v1 and v2 and exact signatures
 * move. If something below does not compile against your installed version,
 * trust the SDK docs over this file — checking that is part of the exercise.
 * Docs: https://ts.sdk.modelcontextprotocol.io/
 */

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

// The domain lives in app/ — run `cd app && npm run build` first.
// Do NOT reimplement any of this logic in the server: a server is a thin
// protocol adapter, and duplicated business rules drift apart.
import {
  loadCatalog,
  searchProducts,
  findBySku,
  lowStock,
  inventoryValue,
  categories,
} from "../../app/dist/index.js";

const server = new McpServer({
  name: "catalog-server",
  version: "1.0.0",
});

// ── Tool 1 ────────────────────────────────────────────────────────────────
// The DESCRIPTION is what the model reads to decide whether to call this.
// Say WHEN to use it, not just what it is — same lesson as a SKILL.md
// description in Workshop 5. Vague description => the tool never fires.
server.registerTool(
  "search_inventory",
  {
    description:
      "Search the product catalog by name, SKU, or category. Use when the " +
      "user asks what products exist or asks about a specific item.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Free-text match on product name, SKU, or category"),
    }),
  },
  async ({ query }) => {
    const results = searchProducts(loadCatalog(), query);
    return {
      content: [
        {
          type: "text",
          text:
            results.length === 0
              ? `No products matched "${query}".`
              : results
                  .map(
                    (p) =>
                      `${p.sku} — ${p.name} (${p.category}) · ${p.price} · stock ${p.stock}`,
                  )
                  .join("\n"),
        },
      ],
    };
  },
);

// ── Tool 2 ────────────────────────────────────────────────────────────────
server.registerTool(
  "check_stock",
  {
    description:
      "Check the stock level and reorder status of a specific product by SKU. " +
      "Use when the user asks about a product's availability or inventory status.",
    inputSchema: z.object({
      sku: z.string().describe("Product SKU (e.g., KB-1001)"),
    }),
  },
  async ({ sku }) => {
    const product = findBySku(loadCatalog(), sku);
    if (!product) {
      return {
        content: [
          {
            type: "text",
            text: `No product found with SKU "${sku}".`,
          },
        ],
      };
    }
    const status =
      product.stock <= product.reorderLevel
        ? "⚠️  NEEDS REORDERING"
        : "✓ In stock";
    return {
      content: [
        {
          type: "text",
          text:
            `${product.sku} — ${product.name}\n` +
            `Price: $${product.price.toFixed(2)}\n` +
            `Stock: ${product.stock} units\n` +
            `Reorder level: ${product.reorderLevel}\n` +
            `Status: ${status}`,
        },
      ],
    };
  },
);

// ── Tool 3 ────────────────────────────────────────────────────────────────
server.registerTool(
  "low_stock",
  {
    description:
      "List all products currently below or at their reorder level, sorted by urgency. " +
      "Use when the user asks which items need reordering or restocking.",
    inputSchema: z.object({}),
  },
  async () => {
    const items = lowStock(loadCatalog());
    if (items.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "All items have sufficient stock.",
          },
        ],
      };
    }
    const formatted = items
      .map(
        (p) =>
          `${p.sku} — ${p.name} · ${p.stock}/${p.reorderLevel} (shortage of ${p.reorderLevel - p.stock})`,
      )
      .join("\n");
    return {
      content: [
        {
          type: "text",
          text: `${items.length} product(s) need reordering:\n\n${formatted}`,
        },
      ],
    };
  },
);

// ── Resource ──────────────────────────────────────────────────────────────
// Catalog overview provided as a read-only tool that returns structured metadata
server.registerTool(
  "catalog_summary",
  {
    description:
      "Get an overview of the catalog including total products, categories, and inventory value.",
    inputSchema: z.object({}),
  },
  async () => {
    const catalog = loadCatalog();
    const cats = categories(catalog);
    const value = inventoryValue(catalog);
    return {
      content: [
        {
          type: "text",
          text:
            `Catalog Overview\n` +
            `================\n\n` +
            `Total products: ${catalog.length}\n` +
            `Categories: ${cats.join(", ")}\n` +
            `Total inventory value: $${value.toFixed(2)}\n`,
        },
      ],
    };
  },
);

// ── Connect ───────────────────────────────────────────────────────────────
// stdio: the HOST launches this process and talks over stdin/stdout.
// Nothing is printed to stdout except protocol messages — if you need to
// debug, log to stderr (console.error), never console.log.
const transport = new StdioServerTransport();
await server.connect(transport);
