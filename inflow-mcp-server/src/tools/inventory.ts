import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { InflowApiClient } from "../api-client.js";

const PaginationSchema = {
  skip: z.number().optional().describe("Number of results to skip"),
  count: z.number().min(1).max(100).optional().describe("Number of results to return (max 100, default 20)"),
  sort: z.string().optional().describe("Field to sort by"),
  sortDesc: z.boolean().optional().describe("Sort in descending order"),
  includeCount: z.boolean().optional().describe("Include total count in response"),
  include: z.string().optional().describe("Comma-separated related data to include"),
  filterSmart: z.string().optional().describe("Smart search filter"),
};

function buildQueryParams(params: Record<string, unknown>): Record<string, unknown> {
  const queryParams: Record<string, unknown> = {};
  if (params.skip !== undefined) queryParams.skip = params.skip;
  if (params.count !== undefined) queryParams.count = params.count;
  if (params.sort) queryParams.sort = params.sort;
  if (params.sortDesc !== undefined) queryParams.sortDesc = params.sortDesc;
  if (params.includeCount !== undefined) queryParams.includeCount = params.includeCount;
  if (params.include) queryParams.include = params.include;
  if (params.filterSmart) queryParams["filter[smart]"] = params.filterSmart;
  return queryParams;
}

export function registerInventoryTools(server: McpServer, client: InflowApiClient): void {

  // --- Stock Adjustments ---

  server.tool(
    "list_stock_adjustments",
    "List stock adjustments from inFlow Inventory with optional filtering and pagination",
    PaginationSchema,
    async (params) => {
      const result = await client.get("/stockadjustments", buildQueryParams(params));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_stock_adjustment",
    "Get a specific stock adjustment by ID from inFlow Inventory",
    {
      stockAdjustmentId: z.string().describe("The stock adjustment ID"),
      include: z.string().optional().describe("Comma-separated related data to include"),
    },
    async (params) => {
      const queryParams: Record<string, unknown> = {};
      if (params.include) queryParams.include = params.include;

      const result = await client.get(`/stockadjustments/${encodeURIComponent(params.stockAdjustmentId)}`, queryParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "upsert_stock_adjustment",
    "Create or update a stock adjustment in inFlow Inventory. To update, include the ID and updatedDate.",
    {
      stockAdjustment: z.record(z.string(), z.unknown()).describe("Stock adjustment data object with lines array"),
    },
    async (params) => {
      const result = await client.put("/stockadjustments", params.stockAdjustment);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Stock Counts ---

  server.tool(
    "list_stock_counts",
    "List stock counts from inFlow Inventory with optional filtering and pagination",
    PaginationSchema,
    async (params) => {
      const result = await client.get("/stockcounts", buildQueryParams(params));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_stock_count",
    "Get a specific stock count by ID from inFlow Inventory",
    {
      stockCountId: z.string().describe("The stock count ID"),
      include: z.string().optional().describe("Comma-separated related data to include"),
    },
    async (params) => {
      const queryParams: Record<string, unknown> = {};
      if (params.include) queryParams.include = params.include;

      const result = await client.get(`/stockcounts/${encodeURIComponent(params.stockCountId)}`, queryParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "upsert_stock_count",
    "Create or update a stock count in inFlow Inventory. To update, include the ID and updatedDate.",
    {
      stockCount: z.record(z.string(), z.unknown()).describe("Stock count data object with lines array"),
    },
    async (params) => {
      const result = await client.put("/stockcounts", params.stockCount);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Stock Transfers ---

  server.tool(
    "list_stock_transfers",
    "List stock transfers from inFlow Inventory with optional filtering and pagination",
    PaginationSchema,
    async (params) => {
      const result = await client.get("/stocktransfers", buildQueryParams(params));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_stock_transfer",
    "Get a specific stock transfer by ID from inFlow Inventory",
    {
      stockTransferId: z.string().describe("The stock transfer ID"),
      include: z.string().optional().describe("Comma-separated related data to include"),
    },
    async (params) => {
      const queryParams: Record<string, unknown> = {};
      if (params.include) queryParams.include = params.include;

      const result = await client.get(`/stocktransfers/${encodeURIComponent(params.stockTransferId)}`, queryParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "upsert_stock_transfer",
    "Create or update a stock transfer in inFlow Inventory. To update, include the ID and updatedDate.",
    {
      stockTransfer: z.record(z.string(), z.unknown()).describe("Stock transfer data object with fromLocation, toLocation, and lines array"),
    },
    async (params) => {
      const result = await client.put("/stocktransfers", params.stockTransfer);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Manufacturing Orders ---

  server.tool(
    "list_manufacturing_orders",
    "List manufacturing orders from inFlow Inventory with optional filtering and pagination",
    PaginationSchema,
    async (params) => {
      const result = await client.get("/manufacturingorders", buildQueryParams(params));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_manufacturing_order",
    "Get a specific manufacturing order by ID from inFlow Inventory",
    {
      manufacturingOrderId: z.string().describe("The manufacturing order ID"),
      include: z.string().optional().describe("Comma-separated related data to include"),
    },
    async (params) => {
      const queryParams: Record<string, unknown> = {};
      if (params.include) queryParams.include = params.include;

      const result = await client.get(`/manufacturingorders/${encodeURIComponent(params.manufacturingOrderId)}`, queryParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "upsert_manufacturing_order",
    "Create or update a manufacturing order in inFlow Inventory. To update, include the ID and updatedDate.",
    {
      manufacturingOrder: z.record(z.string(), z.unknown()).describe("Manufacturing order data object"),
    },
    async (params) => {
      const result = await client.put("/manufacturingorders", params.manufacturingOrder);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
