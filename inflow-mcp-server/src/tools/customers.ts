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
  filterSmart: z.string().optional().describe("Smart search filter across multiple fields"),
};

export function registerCustomerTools(server: McpServer, client: InflowApiClient): void {

  server.tool(
    "list_customers",
    "List customers from inFlow Inventory with optional filtering and pagination",
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

      const result = await client.get("/customers", queryParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_customer",
    "Get a specific customer by ID from inFlow Inventory",
    {
      customerId: z.string().describe("The customer ID"),
      include: z.string().optional().describe("Comma-separated related data to include"),
    },
    async (params) => {
      const queryParams: Record<string, unknown> = {};
      if (params.include) queryParams.include = params.include;

      const result = await client.get(`/customers/${encodeURIComponent(params.customerId)}`, queryParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "upsert_customer",
    "Create or update a customer in inFlow Inventory. To update, include the customer ID and updatedDate for concurrency control.",
    {
      customer: z.record(z.string(), z.unknown()).describe("Customer data object. Include 'id' and 'updatedDate' to update an existing customer."),
    },
    async (params) => {
      const result = await client.put("/customers", params.customer);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
