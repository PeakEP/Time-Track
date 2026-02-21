import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { InflowApiClient } from "../api-client.js";

const PaginationSchema = {
  skip: z.number().optional().describe("Number of results to skip"),
  count: z.number().min(1).max(100).optional().describe("Number of results to return (max 100, default 20)"),
  sort: z.string().optional().describe("Field to sort by"),
  sortDesc: z.boolean().optional().describe("Sort in descending order"),
  includeCount: z.boolean().optional().describe("Include total count in response"),
  include: z.string().optional().describe("Comma-separated related data to include (e.g. 'cost,defaultPrice,vendorItems,inventoryLines')"),
  filterSmart: z.string().optional().describe("Smart search filter across multiple fields"),
};

export function registerProductTools(server: McpServer, client: InflowApiClient): void {

  server.tool(
    "list_products",
    "List products from inFlow Inventory with optional filtering, pagination, and includes",
    PaginationSchema,
    async (params) => {
      const queryParams: Record<string, unknown> = {};
      if (params.skip !== undefined) queryParams.skip = params.skip;
      if (params.count !== undefined) queryParams.count = params.count;
      if (params.sort) queryParams.sort = params.sort;
      if (params.sortDesc !== undefined) queryParams.sortDesc = params.sortDesc;
      if (params.includeCount !== undefined) queryParams.includeCount = params.includeCount;
      if (params.include) queryParams.include = params.include;
      if (params.filterSmart) queryParams["filter[smart]"] = params.filterSmart;

      const result = await client.get("/products", queryParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_product",
    "Get a specific product by ID from inFlow Inventory",
    {
      productId: z.string().describe("The product ID"),
      include: z.string().optional().describe("Comma-separated related data to include (e.g. 'cost,defaultPrice,vendorItems,inventoryLines')"),
    },
    async (params) => {
      const queryParams: Record<string, unknown> = {};
      if (params.include) queryParams.include = params.include;

      const result = await client.get(`/products/${encodeURIComponent(params.productId)}`, queryParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "upsert_product",
    "Create or update a product in inFlow Inventory. To update, include the product ID and updatedDate for concurrency control.",
    {
      product: z.record(z.string(), z.unknown()).describe("Product data object. Include 'id' and 'updatedDate' to update an existing product."),
    },
    async (params) => {
      const result = await client.put("/products", params.product);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_inventory_summary",
    "Get inventory summary for a specific product, including quantity on hand across locations",
    {
      productId: z.string().describe("The product ID"),
    },
    async (params) => {
      const result = await client.get(`/products/${encodeURIComponent(params.productId)}/inventorySummary`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_inventory_summaries_batch",
    "Get inventory summaries for multiple products at once (up to 100)",
    {
      productIds: z.array(z.string()).min(1).max(100).describe("Array of product IDs to get inventory summaries for"),
    },
    async (params) => {
      const result = await client.post("/products/inventorySummaries", {
        productIds: params.productIds,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_bill_of_materials",
    "Get the bill of materials (BOM) for a specific product",
    {
      productId: z.string().describe("The product ID"),
    },
    async (params) => {
      const result = await client.get(`/products/${encodeURIComponent(params.productId)}/billOfMaterials`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
