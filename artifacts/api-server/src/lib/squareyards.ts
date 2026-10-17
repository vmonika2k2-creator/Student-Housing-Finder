import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { StudentHousingListing } from "@workspace/api-zod";

const DEFAULT_MCP_ENDPOINT = "https://sy-mcp.squareyards.com/mcp/external";
const MCP_TIMEOUT_MS = 25_000;
const MAX_DETAIL_LOOKUPS = 8;
const LISTING_CACHE_TTL_MS = 20 * 60_000;

export type RentalSearchInput = {
  location: string;
  minMonthlyRent?: number;
  maxMonthlyRent?: number;
  bedrooms?: string;
  propertyType?: string;
  furnishing?: "Furnished" | "Semi-Furnished" | "Unfurnished";
  amenities?: Array<"parking" | "lift" | "gym" | "security">;
  landmark?: string;
};
export type RentalSearchResult = {
  listings: StudentHousingListing[];
  total: number;
  page: number;
  totalPages: number;
  note?: string;
};

type JsonRecord = Record<string, unknown>;
type DiscoveredTool = { name: string; inputSchema?: { properties?: Record<string, unknown>; required?: string[] } };
type CachedListing = { listing: StudentHousingListing; expiresAt: number };

const listingCache = new Map<string, CachedListing>();
const allowedAmenities = new Set(["parking", "lift", "gym", "security"]);

function parseRentalSearchInput(value: unknown): RentalSearchInput & { amenities: NonNullable<RentalSearchInput["amenities"]> } {
  if (!isRecord(value)) throw new SquareYardsError("Provide rental search details and try again.", 400);
  const location = typeof value.location === "string" ? value.location.trim() : "";
  if (!location || location.length > 120) throw new SquareYardsError("Enter a Pune locality or area (up to 120 characters).", 400);
  const numericField = (key: string): number | undefined => {
    const candidate = value[key];
    if (candidate === undefined || candidate === null || candidate === "") return undefined;
    if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < 0 || candidate > 100_000_000) {
      throw new SquareYardsError(`${key} must be a whole INR amount between 0 and 100,000,000.`, 400);
    }
    return candidate;
  };
  const optionalText = (key: string, maxLength: number): string | undefined => {
    const candidate = value[key];
    if (candidate === undefined || candidate === null || candidate === "") return undefined;
    if (typeof candidate !== "string" || candidate.trim().length > maxLength) throw new SquareYardsError(`${key} must be no longer than ${maxLength} characters.`, 400);
    return candidate.trim() || undefined;
  };
  const minMonthlyRent = numericField("minMonthlyRent");
  const maxMonthlyRent = numericField("maxMonthlyRent");
  const furnishing = value.furnishing;
  if (furnishing !== undefined && furnishing !== "" && !["Furnished", "Semi-Furnished", "Unfurnished"].includes(String(furnishing))) {
    throw new SquareYardsError("Choose furnished, semi-furnished, or unfurnished.", 400);
  }
  const rawAmenities = value.amenities ?? [];
  if (!Array.isArray(rawAmenities) || rawAmenities.length > 4 || rawAmenities.some((item) => typeof item !== "string" || !allowedAmenities.has(item))) {
    throw new SquareYardsError("Choose supported property amenities and try again.", 400);
  }
  const landmark = optionalText("landmark", 120);
  return {
    location,
    minMonthlyRent,
    maxMonthlyRent,
    bedrooms: optionalText("bedrooms", 40),
    propertyType: optionalText("propertyType", 80),
    furnishing: furnishing as RentalSearchInput["furnishing"],
    amenities: rawAmenities as NonNullable<RentalSearchInput["amenities"]>,
    landmark,
  };
}

export class SquareYardsError extends Error {
  constructor(message: string, readonly statusCode = 502) {
    super(message);
    this.name = "SquareYardsError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const normalized = value.replace(/[₹,\s]/g, "");
      if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
    }
  }
  return null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function getStructured(result: unknown): JsonRecord {
  if (!isRecord(result) || result.isError === true) {
    const text = isRecord(result) && Array.isArray(result.content)
      ? result.content.map((item) => isRecord(item) && typeof item.text === "string" ? item.text : "").filter(Boolean).join(" ")
      : "";
    throw new SquareYardsError(text || "Square Yards returned an MCP tool error.");
  }
  if (isRecord(result.structuredContent)) {
    if (typeof result.structuredContent.error === "string") throw new SquareYardsError(result.structuredContent.error);
    return result.structuredContent;
  }
  throw new SquareYardsError("Square Yards returned an unexpected response without structured listing data.");
}

function findTool(tools: DiscoveredTool[], name: string): DiscoveredTool {
  const found = tools.find((tool) => tool.name === name);
  if (!found) throw new SquareYardsError(`Square Yards does not currently advertise the required ${name} tool.`);
  return found;
}

function argsFromDiscoveredSchema(tool: DiscoveredTool, candidates: JsonRecord): JsonRecord {
  const properties = tool.inputSchema?.properties;
  if (!properties || typeof properties !== "object") {
    throw new SquareYardsError(`Square Yards did not provide an input schema for ${tool.name}.`);
  }
  const args: JsonRecord = {};
  for (const [key, value] of Object.entries(candidates)) {
    if (value !== undefined && value !== null && value !== "" && Object.hasOwn(properties, key)) args[key] = value;
  }
  for (const required of tool.inputSchema?.required ?? []) {
    if (!Object.hasOwn(args, required)) throw new SquareYardsError(`Square Yards requires ${required} for ${tool.name}.`);
  }
  return args;
}

function listingUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  try {
    const url = new URL(raw, "https://www.squareyards.com/");
    if (url.protocol !== "https:" || !/(^|\.)squareyards\.com$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseListing(raw: unknown, detailValue?: unknown): StudentHousingListing | null {
  if (!isRecord(raw)) return null;
  const detail = isRecord(detailValue) ? detailValue.detail : undefined;
  const listingData = isRecord(detail) && isRecord(detail.listingData) ? detail.listingData : {};
  const attributes = isRecord(listingData.attributes) ? listingData.attributes : {};
  const rent = readNumber(raw.price, listingData.totalPrice);
  const bhk = readString(raw.unitType, listingData.unitType, typeof raw.bhk === "number" ? `${raw.bhk} BHK` : null, attributes["Number of Rooms"] ? `${attributes["Number of Rooms"]} BHK` : null);
  const propertyType = readString(raw.propertyType, listingData.propertyType);
  const furnishingStatus = readString(attributes["Furnishing Status"]);
  const furnished = furnishingStatus?.toLowerCase() === "furnished"
    ? true
    : furnishingStatus?.toLowerCase() === "unfurnished"
      ? false
      : null;
  const area = readString(raw.areaText)
    ?? (() => {
      const areaValue = readNumber(raw.areaSqft, listingData.availArea, listingData.atreaInSqFt);
      const unit = readString(listingData.areaUOMName) ?? "Sq.Ft.";
      return areaValue === null ? null : `${new Intl.NumberFormat("en-IN").format(areaValue)} ${unit}`;
    })();
  const amenities = readStringArray(raw.amenities).length
    ? readStringArray(raw.amenities)
    : readStringArray(listingData.amenities);
  const images = readStringArray(listingData.images);
  const imageUrl = readString(raw.image, images[0]);
  const id = readString(raw.id, listingData.propertyId, isRecord(detail) ? detail.propertyId : null);
  if (!id) return null;
  const title = readString(raw.title, listingData.propertyTitle, isRecord(detail) ? detail.name : null) ?? "Rental listing";
  const neighborhood = readString(raw.locality, listingData.subLocalityName) ?? "Location not provided";
  const city = readString(raw.city, listingData.cityName) ?? "Pune";
  const roomType = bhk ?? propertyType ?? "Rental listing";
  const distanceKm = readNumber(raw.distanceInKm);
  const isVerified = typeof raw.isVerified === "boolean" ? raw.isVerified : null;
  const deposit = readString(attributes["Security Deposit"]);

  return {
    id,
    title,
    city,
    neighborhood,
    monthlyRent: rent,
    currency: "INR",
    roomType,
    furnished,
    furnishingStatus,
    transitMinutes: null,
    amenities,
    imageUrl: imageUrl ?? "",
    tag: "Square Yards listing",
    propertyType,
    bedrooms: bhk,
    deposit,
    area,
    distanceKm,
    listingUrl: listingUrl(raw.url ?? listingData.url),
    isVerified,
  };
}

export function cacheRentalListings(listings: StudentHousingListing[]) {
  const now = Date.now();
  for (const listing of listings) listingCache.set(listing.id, { listing, expiresAt: now + LISTING_CACHE_TTL_MS });
  for (const [id, cached] of listingCache) if (cached.expiresAt <= now) listingCache.delete(id);
}

export function getCachedRentalListings(ids: string[]): StudentHousingListing[] {
  const now = Date.now();
  return ids.flatMap((id) => {
    const cached = listingCache.get(id);
    if (!cached || cached.expiresAt <= now) {
      listingCache.delete(id);
      return [];
    }
    return [cached.listing];
  });
}

async function runWithTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new SquareYardsError("Square Yards took too long to respond. Please try the search again.", 504)), MCP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function searchSquareYardsRentals(input: RentalSearchInput): Promise<RentalSearchResult> {
  const criteria = parseRentalSearchInput(input);
  if (criteria.minMonthlyRent !== undefined && criteria.maxMonthlyRent !== undefined && criteria.minMonthlyRent > criteria.maxMonthlyRent) {
    throw new SquareYardsError("Minimum monthly rent cannot be greater than the maximum.", 400);
  }

  const endpoint = process.env.SQUAREYARDS_MCP_URL ?? DEFAULT_MCP_ENDPOINT;
  const client = new Client({ name: "student-housing-finder", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));

  try {
    return await runWithTimeout((async () => {
      await client.connect(transport);
      const { tools: discoveredTools } = await client.listTools();
      const tools = discoveredTools as DiscoveredTool[];
      const searchTool = findTool(tools, "search_properties");
      const detailsTool = findTool(tools, "get_entity_details");
      const candidates: JsonRecord = {
        listingType: "Rent",
        location: criteria.landmark ? undefined : criteria.location,
        cityHint: "Pune",
        minPrice: criteria.minMonthlyRent,
        maxPrice: criteria.maxMonthlyRent,
        bedrooms: criteria.bedrooms,
        propertyTypeName: criteria.propertyType,
        furnishing: criteria.furnishing,
        amenityName: criteria.amenities.length ? criteria.amenities.map((item) => item === "gym" ? "gymnasium" : item).join(",") : undefined,
        size: MAX_DETAIL_LOOKUPS,
      };

      if (criteria.landmark) {
        const entityTool = findTool(tools, "search_entities");
        const entityArgs = argsFromDiscoveredSchema(entityTool, {
          q: criteria.landmark,
          entityType: "landmark",
          cityHint: "Pune",
          size: 10,
        });
        const entityResult = getStructured(await client.callTool({ name: entityTool.name, arguments: entityArgs }));
        const entities = Array.isArray(entityResult.entities) ? entityResult.entities.filter(isRecord) : [];
        const exact = entities.filter((entity) =>
          typeof entity.type === "string" && entity.type.toLowerCase() === "landmark" &&
          typeof entity.cityName === "string" && entity.cityName.toLowerCase() === "pune",
        );
        const query = criteria.landmark.toLowerCase();
        const match = exact.find((entity) => typeof entity.name === "string" && entity.name.toLowerCase() === query)
          ?? (exact.length === 1 ? exact[0] : undefined);
        const coordinates = match && isRecord(match.coordinates) ? match.coordinates : null;
        const lat = coordinates ? readNumber(coordinates.lat) : null;
        const long = coordinates ? readNumber(coordinates.lon) : null;
        if (!match || lat === null || long === null) {
          throw new SquareYardsError(`Could not resolve “${criteria.landmark}” to a Pune landmark. Try its full name or search by locality instead.`, 422);
        }
        candidates.lat = lat;
        candidates.long = long;
      }

      const searchArgs = argsFromDiscoveredSchema(searchTool, candidates);
      const searchResponse = getStructured(await client.callTool({ name: searchTool.name, arguments: searchArgs }));
      if (searchResponse.ambiguous === true) {
        throw new SquareYardsError("Square Yards could not identify one Pune location. Enter a more specific locality or landmark.", 422);
      }
      const rawListings = Array.isArray(searchResponse.listings) ? searchResponse.listings : [];
      const puneListings = rawListings.filter((raw) => {
        if (!isRecord(raw)) return false;
        const resultCity = readString(raw.city);
        return !resultCity || resultCity.toLowerCase() === "pune";
      });

      const enriched = await Promise.all(puneListings.slice(0, MAX_DETAIL_LOOKUPS).map(async (raw) => {
        if (!isRecord(raw)) return null;
        const id = readString(raw.id);
        if (!id) return parseListing(raw);
        try {
          const detailArgs = argsFromDiscoveredSchema(detailsTool, { entity: "listing", id });
          const details = getStructured(await client.callTool({ name: detailsTool.name, arguments: detailArgs }));
          return parseListing(raw, details);
        } catch {
          return parseListing(raw);
        }
      }));

      const listings = enriched.filter((item): item is StudentHousingListing => item !== null);
      cacheRentalListings(listings);
      return {
        listings,
        total: readNumber(searchResponse.total) ?? listings.length,
        page: readNumber(searchResponse.page) ?? 1,
        totalPages: readNumber(searchResponse.totalPages) ?? 1,
        ...((puneListings.length !== rawListings.length && listings.length === 0)
          ? { note: "Square Yards returned results outside Pune for this location. Try a Pune locality or landmark." }
          : typeof searchResponse.note === "string" ? { note: searchResponse.note } : {}),
      };
    })());
  } catch (error) {
    if (error instanceof SquareYardsError) throw error;
    const detail = error instanceof Error ? error.message : "Unknown MCP connection error";
    throw new SquareYardsError(`Square Yards MCP request failed: ${detail}`);
  } finally {
    try { await transport.terminateSession(); } catch { /* The service may be stateless or already closed. */ }
    await client.close().catch(() => undefined);
  }
}
