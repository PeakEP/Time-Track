#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { InflowApiClient } from "./api-client.js";
import { InflowConfig } from "./types.js";
import { registerProductTools } from "./tools/products.js";
import { registerCustomerTools } from "./tools/customers.js";
import { registerVendorTools } from "./tools/vendors.js";
import { registerSalesOrderTools } from "./tools/sales-orders.js";
import { registerPurchaseOrderTools } from "./tools/purchase-orders.js";
import { registerInventoryTools } from "./tools/inventory.js";
import { registerReferenceDataTools } from "./tools/reference-data.js";
import { registerWebhookTools } from "./tools/webhooks.js";

function getConfig(): InflowConfig {
  const companyId = process.env.INFLOW_COMPANY_ID;
  const apiKey = process.env.INFLOW_API_KEY;

  if (!companyId) {
    console.error("Error: INFLOW_COMPANY_ID environment variable is required.");
    console.error("Find your Company ID at: inFlow Settings > Integrations");
    process.exit(1);
  }

  if (!apiKey) {
    console.error("Error: INFLOW_API_KEY environment variable is required.");
    console.error("Generate an API key at: inFlow Settings > Integrations > Add New API Key");
    process.exit(1);
  }

  return {
    companyId,
    apiKey,
    baseUrl: process.env.INFLOW_BASE_URL || "https://cloudapi.inflowinventory.com",
    apiVersion: process.env.INFLOW_API_VERSION || "2025-06-24",
    rateLimit: parseInt(process.env.INFLOW_RATE_LIMIT || "60", 10),
    requestTimeout: parseInt(process.env.INFLOW_REQUEST_TIMEOUT || "30000", 10),
    maxRetries: parseInt(process.env.INFLOW_MAX_RETRIES || "3", 10),
    retryDelay: parseInt(process.env.INFLOW_RETRY_DELAY || "1000", 10),
    debug: process.env.INFLOW_DEBUG === "true",
  };
}

async function main(): Promise<void> {
  const config = getConfig();
  const client = new InflowApiClient(config);

  const server = new McpServer({
    name: "inflow-inventory",
    version: "1.0.0",
  });

  // Register all tool groups
  registerProductTools(server, client);
  registerCustomerTools(server, client);
  registerVendorTools(server, client);
  registerSalesOrderTools(server, client);
  registerPurchaseOrderTools(server, client);
  registerInventoryTools(server, client);
  registerReferenceDataTools(server, client);
  registerWebhookTools(server, client);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`inFlow MCP Server running (company: ${config.companyId})`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
