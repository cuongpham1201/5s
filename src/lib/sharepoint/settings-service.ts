/**
 * Config_Settings access — generic Key/Value store + watermark config helper.
 * App-only Graph client (same pattern as config-service). The settings list is
 * tiny, so we read all rows and match by Key in memory. Never duplicates a Key:
 * setSetting patches the existing row, else creates one.
 */
import { CONFIG_LISTS } from "./sharepoint-config";
import { getAppOnlyClient, type SharePointGraphClient } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import type { GraphCollection, GraphListItem } from "./sharepoint-types";
import {
  DEFAULT_WATERMARK_CONFIG,
  normalizeWatermarkConfig,
  type WatermarkConfig,
} from "@/lib/watermark/watermark-types";

const WATERMARK_KEY = "watermark.config";

async function ctx(): Promise<{ client: SharePointGraphClient; siteId: string }> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  return { client, siteId: site.id };
}

async function readSettings(client: SharePointGraphClient, siteId: string) {
  const listId = await findListId(client, siteId, CONFIG_LISTS.settings);
  if (!listId) return { listId: null as string | null, items: [] as GraphListItem[] };
  const res = await client.get<GraphCollection<GraphListItem>>(
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`,
  );
  return { listId, items: res.value };
}

export async function getSetting(key: string): Promise<string | null> {
  const { client, siteId } = await ctx();
  const { items } = await readSettings(client, siteId);
  const hit = items.find((it) => it.fields?.Key === key);
  const val = hit?.fields?.Value;
  return typeof val === "string" ? val : null;
}

export async function setSetting(key: string, value: string, description?: string): Promise<void> {
  const { client, siteId } = await ctx();
  const listId = await findListId(client, siteId, CONFIG_LISTS.settings);
  if (!listId) throw new Error("Chưa có list Config_Settings — chạy provision trước.");
  const res = await client.get<GraphCollection<GraphListItem>>(
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`,
  );
  const hit = res.value.find((it) => it.fields?.Key === key);
  const fields: Record<string, string> = { Key: key, Value: value, Title: key };
  if (description !== undefined) fields.Description = description;
  if (hit) {
    await client.patch(`/sites/${siteId}/lists/${listId}/items/${hit.id}/fields`, fields);
  } else {
    await client.post(`/sites/${siteId}/lists/${listId}/items`, { fields });
  }
}

/** Watermark config (admin, global). Falls back to defaults when unset/invalid. */
export async function getWatermarkConfig(): Promise<WatermarkConfig> {
  try {
    const raw = await getSetting(WATERMARK_KEY);
    if (!raw) return { ...DEFAULT_WATERMARK_CONFIG };
    return normalizeWatermarkConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_WATERMARK_CONFIG };
  }
}

export async function saveWatermarkConfig(raw: unknown): Promise<WatermarkConfig> {
  const config = normalizeWatermarkConfig(raw);
  await setSetting(WATERMARK_KEY, JSON.stringify(config), "Cấu hình watermark (bật/tắt dòng + dòng tùy chỉnh)");
  return config;
}
