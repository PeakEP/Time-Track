import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { InflowApiClient } from "../api-client.js";

const PaginationSchema = {
  skip: z.number().optional().describe("Number of results to skip"),
  count: z.number().min(1).max(100).optional().describe("Number of results to return (max 100, default 20)"),
  sort: z.string().optional().describe("Field to sort by"),
  sortDesc: z.boolean().optional().describe("Sort in descending order"),
  includeCount: z.boolean().optional().describe("Include total count in response"),
  filterSmart: z.string().optional().describe("Smart search filter"),
};

function buildQueryParams(params: Record<string, unknown>): Record<string, unknown> {
  const queryParams: Record<string, unknown> = {};
  if (params.skip !== undefined) queryParams.skip = params.skip;
  if (params.count !== undefined) queryParams.count = params.count;
  if (params.sort) queryParams.sort = params.sort;
  if (params.sortDesc !== undefined) queryParams.sortDesc = params.sortDesc;
  if (params.includeCount !== undefined) queryParams.includeCount = params.includeCount;
  if (params.filterSmart) queryParams["filter[smart]"] = params.filterSmart;
  return queryParams;
}

export function registerReferenceDataTools(server: McpServer, client: InflowApiClient): void {

  // --- Locations ---

  server.tool(
    "list_locations",
    "List all inventory locations from inFlow Inventory",
    PaginationSchema,
    async (params) => {
      const result = await client.get("/locations", buildQueryParams(params));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_location",
    "Get a specific location by ID from inFlow Inventory",
    {
      locationId: z.string().describe("The location ID"),
    },
    async (params) => {
      const result = await client.get(`/locations/${encodeURIComponent(params.locationId)}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Categories ---

  server.tool(
    "list_categories",
    "List all product categories from inFlow Inventory",
    PaginationSchema,
    async (params) => {
      const result = await client.get("/categories", buildQueryParams(params));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_category",
    "Get a specific category by ID from inFlow Inventory",
    {
      categoryId: z.string().describe("The category ID"),
    },
    async (params) => {
      const result = await client.get(`/categories/${encodeURIComponent(params.categoryId)}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Pricing Schemes ---

  server.tool(
    "list_pricing_schemes",
    "List all pricing schemes from inFlow Inventory",
    PaginationSchema,
    async (params) => {
      const result = await client.get("/pricingschemes", buildQueryParams(params));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Payment Terms ---

  server.tool(
    "list_payment_terms",
    "List all payment terms from inFlow Inventory",
    PaginationSchema,
    async (params) => {
      const result = await client.get("/paymentterms", buildQueryParams(params));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Tax Codes ---

  server.tool(
    "list_tax_codes",
    "List all tax codes from inFlow Inventory",
    PaginationSchema,
    async (params) => {
      const result = await client.get("/taxcodes", buildQueryParams(params));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Currencies ---

  server.tool(
    "list_currencies",
    "List all currencies from inFlow Inventory",
    PaginationSchema,
    async (params) => {
      const result = await client.get("/currencies", buildQueryParams(params));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Custom Fields ---

  server.tool(
    "list_custom_fields",
    "List all custom fields defined in inFlow Inventory",
    {
      entityType: z.string().optional().describe("Filter by entity type (e.g. 'product', 'customer', 'salesOrder')"),
    },
    async (params) => {
      const queryParams: Record<string, unknown> = {};
      if (params.entityType) queryParams["filter[entityType]"] = params.entityType;

      const result = await client.get("/customfields", queryParams);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Team Members ---

  server.tool(
    "list_team_members",
    "List all team members from inFlow Inventory",
    PaginationSchema,
    async (params) => {
      const result = await client.get("/teammembers", buildQueryParams(params));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Adjustment Reasons ---

  server.tool(
    "list_adjustment_reasons",
    "List all stock adjustment reasons from inFlow Inventory",
    PaginationSchema,
    async (params) => {
      const result = await client.get("/adjustmentreasons", buildQueryParams(params));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // --- Operation Types ---

  server.tool(
    "list_operation_types",
    "List all operation types from inFlow Inventory",
    PaginationSchema,
    async (params) => {
      const result = await client.get("/operationtypes", buildQueryParams(params));
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
