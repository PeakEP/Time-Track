import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { InflowApiClient } from "../api-client.js";

export function registerWebhookTools(server: McpServer, client: InflowApiClient): void {

  server.tool(
    "list_webhooks",
    "List all configured webhooks in inFlow Inventory",
    {},
    async () => {
      const result = await client.get("/webhooks");
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "upsert_webhook",
    "Create or update a webhook in inFlow Inventory. To update, include the webhook ID and updatedDate.",
    {
      webhook: z.record(z.string(), z.unknown()).describe("Webhook data object with 'url' and 'events' array. Include 'id' and 'updatedDate' to update an existing webhook."),
    },
    async (params) => {
      const result = await client.put("/webhooks", params.webhook);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "delete_webhook",
    "Delete a webhook from inFlow Inventory",
    {
      webhookId: z.string().describe("The webhook ID to delete"),
    },
    async (params) => {
      await client.delete(`/webhooks/${encodeURIComponent(params.webhookId)}`);
      return { content: [{ type: "text" as const, text: `Webhook ${params.webhookId} deleted successfully.` }] };
    }
  );
}
