import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { InflowApiClient } from "../api-client.js";

const PaginationSchema = {
  skip: z.number().optional().describe("Number of results to skip"),
  count: z.number().min(1).max(100).optional().describe("Number of results to return (max 100, default 20)"),
  sort: z.string().optional().describe("Field to sort by"),
  sortDesc: z.boolean().optional().describe("Sort in descending order"),
  includeCount: z.boolean().optional().describe("Include total count in response"),
  include: z.string().optional().describe("Comma-separated related data to include (e.g. 'lines,lines.product')"),
  filterSmart: z.string().optional().describe("Smart search across order number and vendor name"),
};

export function registerPurchaseOrderTools(server: McpServer, client: InflowApiClient): void {

  server.tool(
    "list_purchase_orders",
    "List purchase orders from inFlow Inventory with optional filtering and pagination",
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

      const result = await client.get("/purchaseorders", queryParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_purchase_order",
    "Get a specific purchase order by ID from inFlow Inventory",
    {
      purchaseOrderId: z.string().describe("The purchase order ID"),
      include: z.string().optional().describe("Comma-separated related data to include (e.g. 'lines,lines.product')"),
    },
    async (params) => {
      const queryParams: Record<string, unknown> = {};
      if (params.include) queryParams.include = params.include;

      const result = await client.get(`/purchaseorders/${encodeURIComponent(params.purchaseOrderId)}`, queryParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "upsert_purchase_order",
    "Create or update a purchase order in inFlow Inventory. To update, include the order ID and updatedDate for concurrency control.",
    {
      purchaseOrder: z.record(z.string(), z.unknown()).describe("Purchase order data object. Include 'id' and 'updatedDate' to update an existing order. Include 'lines' array for order line items."),
    },
    async (params) => {
      const result = await client.put("/purchaseorders", params.purchaseOrder);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
