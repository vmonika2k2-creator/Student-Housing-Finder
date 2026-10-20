import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { StudentHousingListing } from "@workspace/api-zod";
import { cacheRentalListings } from "./squareyards";

const DEFAULT_ENDPOINT = "https://themineworks--india-real-estate-mcp.apify.actor/mcp";
type RecordValue = Record<string, unknown>;
type Tool = { name: string; inputSchema?: { properties?: Record<string, unknown>; required?: string[] } };

export class ApifyRealEstateError extends Error {
  constructor(message: string, readonly statusCode = 502) {
    super(message);
    this.name = "ApifyRealEstateError";
  }
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}
function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/[₹,\s]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}
function arrayValue(...values: unknown[]): string[] {
  for (const value of values) {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  }
  return [];
}
function structured(value: unknown): RecordValue {
  if (!isRecord(value) || value.isError === true) throw new ApifyRealEstateError("Apify returned an MCP tool error.");
  if (isRecord(value.structuredContent)) return value.structuredContent;
  if (Array.isArray(value.content)) {
    for (const item of value.content) {
      if (!isRecord(item) || typeof item.text !== "string") continue;
      try {
        const parsed: unknown = JSON.parse(item.text);
        if (isRecord(parsed)) return parsed;
        if (Array.isArray(parsed)) return { listings: parsed };
      } catch { /* Ignore non-JSON content. */ }
    }
  }
  throw new ApifyRealEstateError("Apify returned an unexpected response.");
}
function findTool(tools: Tool[], name: string): Tool {
  const found = tools.find((tool) => tool.name === name);
  if (!found) throw new ApifyRealEstateError("Apify does not advertise the " + name + " tool.", 503);
  return found;
}
function toolArguments(tool: Tool, candidates: RecordValue): RecordValue {
  const props = tool.inputSchema?.properties;
  if (!props) throw new ApifyRealEstateError("Apify did not provide an input schema for " + tool.name + ".");
  const args: RecordValue = {};
  for (const [key, value] of Object.entries(candidates)) {
    if (value !== undefined && value !== null && value !== "" && Object.hasOwn(props, key)) args[key] = value;
  }
  for (const key of tool.inputSchema?.required ?? []) {
    if (!Object.hasOwn(args, key)) throw new ApifyRealEstateError("Apify requires " + key + " for " + tool.name + ".");
  }
  return args;
}
function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    const hosts = ["99acres.com", "magicbricks.com", "nobroker.in", "housing.com"];
    return url.protocol === "https:" && hosts.some((host) => url.hostname === host || url.hostname.endsWith("." + host)) ? url.toString() : null;
  } catch { return null; }
}
function listing(raw: unknown, source: string): StudentHousingListing | null {
  if (!isRecord(raw)) return null;
  const rawId = stringValue(raw.id, raw.listing_id, raw.property_id, raw.url, raw.listing_url, raw.property_url, raw.propertyUrl, raw.listingUrl);
  if (!rawId) return null;
  const title = stringValue(raw.title, raw.property_title, raw.name) ?? "Rental listing";
  const bhk = stringValue(raw.bhk, raw.bedrooms, raw.configuration, raw.unit_type);
  const propertyType = stringValue(raw.property_type, raw.propertyType, raw.type);
  const furnishing = stringValue(raw.furnishing, raw.furnishing_status);
  const images = arrayValue(raw.images, raw.image_urls);
  const labels: Record<string, string> = { ninetynine_acres: "99acres", magicbricks: "MagicBricks", nobroker: "NoBroker", housing: "Housing.com" };
  return {
    id: "apify:" + source + ":" + rawId,
    title,
    city: stringValue(raw.city) ?? "Pune",
    neighborhood: stringValue(raw.locality, raw.location, raw.address, raw.area) ?? "Location not provided",
    monthlyRent: numberValue(raw.price, raw.rent, raw.monthly_rent, raw.amount),
    currency: "INR",
    roomType: bhk ?? propertyType ?? "Rental listing",
    furnished: furnishing ? (/furnished/i.test(furnishing) && !/semi|unfurnished/i.test(furnishing)) : null,
    furnishingStatus: furnishing,
    transitMinutes: null,
    amenities: arrayValue(raw.amenities, raw.features),
    imageUrl: stringValue(raw.image, raw.image_url, images[0]) ?? "",
    tag: labels[source] ?? "Apify listing",
    propertyType,
    bedrooms: bhk,
    deposit: stringValue(raw.deposit, raw.security_deposit),
    area: stringValue(raw.area_text, raw.area, raw.area_sqft),
    distanceKm: numberValue(raw.distance_km),
    listingUrl: safeSourceUrl(raw.url ?? raw.listing_url ?? raw.property_url ?? raw.propertyUrl ?? raw.listingUrl),
    isVerified: null,
  };
}
async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new ApifyRealEstateError("Add APIFY_API_TOKEN to Replit Secrets before connecting Apify.", 503);
  const endpoint = process.env.APIFY_MCP_URL ?? DEFAULT_ENDPOINT;
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new ApifyRealEstateError("APIFY_MCP_URL must be a valid HTTPS URL.", 503); }
  if (url.protocol !== "https:" || url.hostname !== "themineworks--india-real-estate-mcp.apify.actor") {
    throw new ApifyRealEstateError("APIFY_MCP_URL must use the official India Real Estate MCP host.", 503);
  }
  const client = new Client({ name: "student-housing-finder", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: "Bearer " + token } } });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => { await client.connect(transport); return work(client); })(),
      new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new ApifyRealEstateError("Apify took too long to respond. Please try again.", 504)), 30_000); }),
    ]);
  } catch (error) {
    if (error instanceof ApifyRealEstateError) throw error;
    throw new ApifyRealEstateError("Apify MCP request failed: " + (error instanceof Error ? error.message : "Unknown connection error"));
  } finally {
    if (timer) clearTimeout(timer);
    try { await transport.terminateSession(); } catch { /* The server may be stateless. */ }
    await client.close().catch(() => undefined);
  }
}
export async function checkApifyConnection(): Promise<{ connected: boolean; tools: string[] }> {
  return withClient(async (client) => {
    const result = await client.listTools();
    const names = (result.tools as Tool[]).map((tool) => tool.name);
    return { connected: names.includes("search_all_india_properties"), tools: names };
  });
}
export async function searchApifyIndiaRentals(input: unknown): Promise<{ listings: StudentHousingListing[]; total: number; page: number; totalPages: number; note?: string }> {
  if (!isRecord(input) || typeof input.location !== "string" || !input.location.trim() || input.location.trim().length > 120) {
    throw new ApifyRealEstateError("Enter a city or locality (up to 120 characters).", 400);
  }
  const locality = input.location.trim();
  const optionalPrice = (key: string): number | undefined => {
    const value = input[key];
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100_000_000) throw new ApifyRealEstateError(key + " must be a whole INR amount.", 400);
    return value;
  };
  const min = optionalPrice("minMonthlyRent");
  const max = optionalPrice("maxMonthlyRent");
  if (min !== undefined && max !== undefined && min > max) throw new ApifyRealEstateError("Minimum monthly rent cannot be greater than the maximum.", 400);
  return withClient(async (client) => {
    const discovered = await client.listTools();
    const tool = findTool(discovered.tools as Tool[], "search_all_india_properties");
    const args = toolArguments(tool, {
      city: "Pune", listing_type: "rent", max_per_source: 5,
      locality, min_price: min, max_price: max,
      bedrooms: typeof input.bedrooms === "string" ? input.bedrooms : undefined,
      property_type: typeof input.propertyType === "string" ? input.propertyType : undefined,
    });
    const response = structured(await client.callTool({ name: tool.name, arguments: args }));
    const grouped = isRecord(response.results_by_source) ? response.results_by_source : {};
    const results: Array<{ item: unknown; source: string }> = [];
    for (const [source, entries] of Object.entries(grouped)) {
      if (Array.isArray(entries)) for (const item of entries) results.push({ item, source });
    }
    if (!results.length && Array.isArray(response.listings)) {
      for (const item of response.listings) results.push({ item, source: "unknown" });
    }
    const listings = results.map(({ item, source }) => listing(item, source)).filter((item): item is StudentHousingListing => item !== null);
    cacheRentalListings(listings);
    return {
      listings, total: numberValue(response.total_listings_found, response.total) ?? listings.length,
      page: 1, totalPages: 1,
      ...(typeof response.sources_tier === "string" ? { note: "Apify source coverage: " + response.sources_tier + ". Confirm availability and terms with the listing contact." } : {}),
    };
  });
}

export async function searchMagicBricksRentals(input: unknown): Promise<{ listings: StudentHousingListing[]; total: number; page: number; totalPages: number; note: string }> {
  if (!isRecord(input) || typeof input.location !== "string" || !input.location.trim() || input.location.trim().length > 120) {
    throw new ApifyRealEstateError("Enter a Pune locality or area (up to 120 characters).", 400);
  }
  const locality = input.location.trim();
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new ApifyRealEstateError("Add APIFY_API_TOKEN to Replit Secrets before connecting Apify.", 503);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch("https://api.apify.com/v2/acts/thirdwatch~magicbricks-scraper/run-sync-get-dataset-items?clean=true&format=json&limit=20", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ city: "Pune", locality, listingType: "rent", maxResults: 20 }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const statusCode = response.status === 401 || response.status === 403 ? 503 : 502;
      throw new ApifyRealEstateError(`MagicBricks search failed (HTTP ${response.status}). Check the Apify token and actor access.`, statusCode);
    }
    const payload: unknown = await response.json();
    const rawListings = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.items) ? payload.items : null;
    if (!rawListings) throw new ApifyRealEstateError("MagicBricks returned an unexpected response.");
    const listings = rawListings.map((item) => listing(item, "magicbricks")).filter((item): item is StudentHousingListing => item !== null);
    cacheRentalListings(listings);
    return {
      listings,
      total: listings.length,
      page: 1,
      totalPages: 1,
      note: "Live MagicBricks rental results for Pune. Apify actor usage charges may apply; confirm availability and terms with the listing contact.",
    };
  } catch (error) {
    if (error instanceof ApifyRealEstateError) throw error;
    if (controller.signal.aborted) throw new ApifyRealEstateError("MagicBricks took too long to respond. Please try again.", 504);
    throw new ApifyRealEstateError("MagicBricks search failed: " + (error instanceof Error ? error.message : "Unknown connection error"));
  } finally {
    clearTimeout(timer);
  }
}
