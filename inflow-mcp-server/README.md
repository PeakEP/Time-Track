# inFlow Inventory MCP Server

An MCP (Model Context Protocol) server that integrates with the [inFlow Inventory](https://www.inflowinventory.com/) Cloud API, enabling AI assistants like Claude to manage inventory, orders, customers, and more.

## Prerequisites

- Node.js 18+
- inFlow Inventory subscription with the API add-on
- API Key and Company ID from inFlow Settings > Integrations

## Setup

```bash
cd inflow-mcp-server
npm install
npm run build
```

## Configuration

Set the following environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `INFLOW_COMPANY_ID` | Yes | — | Your inFlow Company ID |
| `INFLOW_API_KEY` | Yes | — | Your inFlow API Key |
| `INFLOW_BASE_URL` | No | `https://cloudapi.inflowinventory.com` | API base URL |
| `INFLOW_API_VERSION` | No | `2025-06-24` | API version |
| `INFLOW_RATE_LIMIT` | No | `60` | Max requests per minute |
| `INFLOW_REQUEST_TIMEOUT` | No | `30000` | Request timeout (ms) |
| `INFLOW_MAX_RETRIES` | No | `3` | Max retry attempts |
| `INFLOW_RETRY_DELAY` | No | `1000` | Base retry delay (ms) |
| `INFLOW_DEBUG` | No | `false` | Enable debug logging |

## Claude Desktop / Claude Code Configuration

Add to your MCP settings:

```json
{
  "mcpServers": {
    "inflow-inventory": {
      "command": "node",
      "args": ["/path/to/inflow-mcp-server/dist/index.js"],
      "env": {
        "INFLOW_COMPANY_ID": "your-company-id",
        "INFLOW_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Available Tools (44 total)

### Products (6 tools)
- `list_products` — List products with filtering, pagination, and includes
- `get_product` — Get a specific product by ID
- `upsert_product` — Create or update a product
- `get_inventory_summary` — Get inventory summary for a product
- `get_inventory_summaries_batch` — Batch inventory summaries (up to 100)
- `get_bill_of_materials` — Get BOM for a product

### Customers (3 tools)
- `list_customers` — List customers with filtering and pagination
- `get_customer` — Get a specific customer by ID
- `upsert_customer` — Create or update a customer

### Vendors (3 tools)
- `list_vendors` — List vendors with filtering and pagination
- `get_vendor` — Get a specific vendor by ID
- `upsert_vendor` — Create or update a vendor

### Sales Orders (3 tools)
- `list_sales_orders` — List sales orders (smart filter searches order number + customer name)
- `get_sales_order` — Get a specific sales order by ID
- `upsert_sales_order` — Create or update a sales order

### Purchase Orders (3 tools)
- `list_purchase_orders` — List purchase orders
- `get_purchase_order` — Get a specific purchase order by ID
- `upsert_purchase_order` — Create or update a purchase order

### Inventory Operations (12 tools)
- Stock Adjustments: `list_stock_adjustments`, `get_stock_adjustment`, `upsert_stock_adjustment`
- Stock Counts: `list_stock_counts`, `get_stock_count`, `upsert_stock_count`
- Stock Transfers: `list_stock_transfers`, `get_stock_transfer`, `upsert_stock_transfer`
- Manufacturing Orders: `list_manufacturing_orders`, `get_manufacturing_order`, `upsert_manufacturing_order`

### Reference Data (11 tools)
- `list_locations`, `get_location`
- `list_categories`, `get_category`
- `list_pricing_schemes`
- `list_payment_terms`
- `list_tax_codes`
- `list_currencies`
- `list_custom_fields`
- `list_team_members`
- `list_adjustment_reasons`
- `list_operation_types`

### Webhooks (3 tools)
- `list_webhooks` — List all configured webhooks
- `upsert_webhook` — Create or update a webhook
- `delete_webhook` — Delete a webhook

## API Features

- **Pagination**: Use `skip` and `count` (max 100 per page, default 20)
- **Smart Search**: `filterSmart` searches across relevant fields per endpoint
- **Nested Includes**: e.g. `include=lines.product.category` on sales orders
- **Rate Limiting**: Automatic token-bucket rate limiting (60 req/min default)
- **Retry Logic**: Exponential backoff on 429/5xx responses
- **Concurrency Control**: Include `updatedDate` on updates to prevent conflicts
