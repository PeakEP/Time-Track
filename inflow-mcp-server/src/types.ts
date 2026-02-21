// inFlow API types

export interface InflowConfig {
  companyId: string;
  apiKey: string;
  baseUrl: string;
  apiVersion: string;
  rateLimit: number;
  requestTimeout: number;
  maxRetries: number;
  retryDelay: number;
  debug: boolean;
}

export interface PaginationParams {
  skip?: number;
  count?: number;
  sort?: string;
  sortDesc?: boolean;
  includeCount?: boolean;
  include?: string;
  "filter[smart]"?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  totalCount?: number;
  hasMore?: boolean;
}

export interface Product {
  id?: string;
  name?: string;
  description?: string;
  category?: string;
  barcode?: string;
  itemType?: string;
  isActive?: boolean;
  cost?: number;
  defaultPrice?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  updatedDate?: string;
  [key: string]: unknown;
}

export interface Customer {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  currency?: string;
  paymentTerms?: string;
  pricingScheme?: string;
  remarks?: string;
  isActive?: boolean;
  updatedDate?: string;
  [key: string]: unknown;
}

export interface Vendor {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  currency?: string;
  paymentTerms?: string;
  remarks?: string;
  isActive?: boolean;
  updatedDate?: string;
  [key: string]: unknown;
}

export interface SalesOrder {
  id?: string;
  orderNumber?: string;
  orderDate?: string;
  customer?: string | Record<string, unknown>;
  status?: string;
  location?: string;
  remarks?: string;
  lines?: OrderLine[];
  updatedDate?: string;
  [key: string]: unknown;
}

export interface PurchaseOrder {
  id?: string;
  orderNumber?: string;
  orderDate?: string;
  vendor?: string | Record<string, unknown>;
  status?: string;
  location?: string;
  remarks?: string;
  lines?: OrderLine[];
  updatedDate?: string;
  [key: string]: unknown;
}

export interface OrderLine {
  product?: string | Record<string, unknown>;
  quantity?: number;
  unitPrice?: number;
  description?: string;
  [key: string]: unknown;
}

export interface StockAdjustment {
  id?: string;
  date?: string;
  location?: string;
  reason?: string;
  remarks?: string;
  lines?: StockAdjustmentLine[];
  updatedDate?: string;
  [key: string]: unknown;
}

export interface StockAdjustmentLine {
  product?: string | Record<string, unknown>;
  quantity?: number;
  [key: string]: unknown;
}

export interface StockCount {
  id?: string;
  date?: string;
  location?: string;
  status?: string;
  remarks?: string;
  lines?: StockCountLine[];
  updatedDate?: string;
  [key: string]: unknown;
}

export interface StockCountLine {
  product?: string | Record<string, unknown>;
  countedQuantity?: number;
  [key: string]: unknown;
}

export interface StockTransfer {
  id?: string;
  date?: string;
  fromLocation?: string;
  toLocation?: string;
  remarks?: string;
  lines?: StockTransferLine[];
  updatedDate?: string;
  [key: string]: unknown;
}

export interface StockTransferLine {
  product?: string | Record<string, unknown>;
  quantity?: number;
  [key: string]: unknown;
}

export interface ManufacturingOrder {
  id?: string;
  orderNumber?: string;
  date?: string;
  product?: string | Record<string, unknown>;
  quantity?: number;
  location?: string;
  status?: string;
  remarks?: string;
  updatedDate?: string;
  [key: string]: unknown;
}

export interface InventorySummary {
  productId?: string;
  productName?: string;
  quantityOnHand?: number;
  quantityAllocated?: number;
  quantityAvailable?: number;
  locations?: InventoryLocation[];
  [key: string]: unknown;
}

export interface InventoryLocation {
  locationId?: string;
  locationName?: string;
  quantityOnHand?: number;
  [key: string]: unknown;
}

export interface BillOfMaterials {
  productId?: string;
  components?: BomComponent[];
  [key: string]: unknown;
}

export interface BomComponent {
  product?: string | Record<string, unknown>;
  quantity?: number;
  [key: string]: unknown;
}

export interface Location {
  id?: string;
  name?: string;
  address?: string;
  isActive?: boolean;
  [key: string]: unknown;
}

export interface Category {
  id?: string;
  name?: string;
  parentCategory?: string;
  [key: string]: unknown;
}

export interface PricingScheme {
  id?: string;
  name?: string;
  [key: string]: unknown;
}

export interface PaymentTerms {
  id?: string;
  name?: string;
  [key: string]: unknown;
}

export interface TaxCode {
  id?: string;
  name?: string;
  rate?: number;
  [key: string]: unknown;
}

export interface Currency {
  id?: string;
  code?: string;
  name?: string;
  exchangeRate?: number;
  [key: string]: unknown;
}

export interface CustomField {
  id?: string;
  name?: string;
  fieldType?: string;
  [key: string]: unknown;
}

export interface TeamMember {
  id?: string;
  name?: string;
  email?: string;
  [key: string]: unknown;
}

export interface Webhook {
  id?: string;
  url?: string;
  events?: string[];
  isActive?: boolean;
  [key: string]: unknown;
}

export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}
