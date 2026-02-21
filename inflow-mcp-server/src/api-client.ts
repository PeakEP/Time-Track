import { InflowConfig, ApiError } from "./types.js";

export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per ms
  private lastRefill: number;

  constructor(requestsPerMinute: number) {
    this.maxTokens = requestsPerMinute;
    this.tokens = requestsPerMinute;
    this.refillRate = requestsPerMinute / 60000;
    this.lastRefill = Date.now();
  }

  async waitForToken(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitTime = Math.ceil((1 - this.tokens) / this.refillRate);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

export class InflowApiClient {
  private config: InflowConfig;
  private rateLimiter: RateLimiter;

  constructor(config: InflowConfig) {
    this.config = config;
    this.rateLimiter = new RateLimiter(config.rateLimit);
  }

  private get baseUrl(): string {
    return `${this.config.baseUrl}/${this.config.companyId}`;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      Accept: `application/json;version=${this.config.apiVersion}`,
      "Content-Type": "application/json",
    };
  }

  private log(message: string, data?: unknown): void {
    if (this.config.debug) {
      console.error(`[inflow-mcp] ${message}`, data ?? "");
    }
  }

  async request<T>(
    method: string,
    path: string,
    params?: Record<string, unknown>,
    body?: unknown
  ): Promise<T> {
    await this.rateLimiter.waitForToken();

    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    this.log(`${method} ${url.toString()}`);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
        this.log(`Retry attempt ${attempt} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        await this.rateLimiter.waitForToken();
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          this.config.requestTimeout
        );

        const response = await fetch(url.toString(), {
          method,
          headers: this.headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          if (response.status === 204) {
            return undefined as T;
          }
          const data = await response.json();
          this.log("Response:", data);
          return data as T;
        }

        if (response.status === 429 || response.status >= 500) {
          const errorText = await response.text().catch(() => "");
          lastError = new Error(
            `HTTP ${response.status}: ${errorText}`
          );
          this.log(`Retryable error: ${response.status}`);
          continue;
        }

        // Non-retryable error
        const errorBody = await response.text().catch(() => "");
        let errorMessage: string;
        try {
          const parsed = JSON.parse(errorBody);
          errorMessage = parsed.message || parsed.error || errorBody;
        } catch {
          errorMessage = errorBody;
        }

        const apiError: ApiError = {
          status: response.status,
          message: errorMessage,
          details: errorBody,
        };
        throw new Error(
          `inFlow API Error (${apiError.status}): ${apiError.message}`
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("inFlow API Error")
        ) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
        if (error instanceof Error && error.name === "AbortError") {
          lastError = new Error("Request timed out");
        }
        this.log(`Request error: ${lastError.message}`);
      }
    }

    throw lastError || new Error("Request failed after retries");
  }

  async get<T>(
    path: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>("GET", path, params);
  }

  async post<T>(
    path: string,
    body?: unknown,
    params?: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>("POST", path, params, body);
  }

  async put<T>(
    path: string,
    body?: unknown,
    params?: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>("PUT", path, params, body);
  }

  async delete<T>(
    path: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>("DELETE", path, params);
  }
}
