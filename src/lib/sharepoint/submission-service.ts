/**
 * Submission list access (Phase 2C.2) — read + create-item helpers ONLY.
 * Does NOT upload photos and is NOT wired to the offline queue in this phase.
 * The Upload Engine (later) will call these after putting files in 5S/img.
 */
import { DATA_LISTS } from "./sharepoint-config";
import { getAppOnlyClient, type SharePointGraphClient } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import { mapSubmission, mapSubmissionPhoto } from "./list-helpers";
import type { GraphCollection, GraphListItem } from "./sharepoint-types";
import type { SubmissionPhotoRecord, SubmissionRecord } from "@/types/sharepoint";

async function ctx(): Promise<{ client: SharePointGraphClient; siteId: string }> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  return { client, siteId: site.id };
}

async function requireList(client: SharePointGraphClient, siteId: string, name: string): Promise<string> {
  const id = await findListId(client, siteId, name);
  if (!id) throw new Error(`List ${name} chưa tồn tại — chạy provision trước.`);
  return id;
}

export async function getSubmissions(top = 200): Promise<SubmissionRecord[]> {
  const { client, siteId } = await ctx();
  const listId = await requireList(client, siteId, DATA_LISTS.submissions);
  const res = await client.get<GraphCollection<GraphListItem>>(
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=${top}`,
  );
  return res.value.map((it) => mapSubmission(it.fields));
}

/** Read Data_SubmissionPhotos line items (Original/Watermarked paths included). */
export async function getSubmissionPhotos(top = 999): Promise<SubmissionPhotoRecord[]> {
  const { client, siteId } = await ctx();
  const listId = await requireList(client, siteId, DATA_LISTS.submissionPhotos);
  const res = await client.get<GraphCollection<GraphListItem>>(
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=${top}`,
  );
  return res.value.map((it) => mapSubmissionPhoto(it.fields));
}

/** Create a submission header item. (No photo upload.) */
export async function createSubmissionHeader(rec: SubmissionRecord): Promise<void> {
  const { client, siteId } = await ctx();
  const listId = await requireList(client, siteId, DATA_LISTS.submissions);
  await client.post(`/sites/${siteId}/lists/${listId}/items`, {
    fields: {
      Title: rec.SubmissionId,
      SubmissionId: rec.SubmissionId,
      DepartmentCode: rec.DepartmentCode,
      AreaCode: rec.AreaCode,
      AreaName: rec.AreaName,
      ReporterName: rec.ReporterName,
      ReporterEmail: rec.ReporterEmail,
      PhotoCount: rec.PhotoCount,
      SubmissionDate: rec.SubmissionDate,
      SubmittedAt: rec.SubmittedAt,
      Latitude: rec.Latitude,
      Longitude: rec.Longitude,
      Address: rec.Address,
      Status: rec.Status,
      SyncStatus: rec.SyncStatus,
    },
  });
}

/** Create a submission photo (line) item. URLs point at already-uploaded files (future). */
export async function createSubmissionPhoto(rec: SubmissionPhotoRecord): Promise<void> {
  const { client, siteId } = await ctx();
  const listId = await requireList(client, siteId, DATA_LISTS.submissionPhotos);
  await client.post(`/sites/${siteId}/lists/${listId}/items`, {
    fields: {
      Title: rec.PhotoId,
      PhotoId: rec.PhotoId,
      SubmissionId: rec.SubmissionId,
      SeqNo: rec.SeqNo,
      OriginalPhotoUrl: rec.OriginalPhotoUrl,
      WatermarkedPhotoUrl: rec.WatermarkedPhotoUrl,
      CaptureTime: rec.CaptureTime,
      Latitude: rec.Latitude,
      Longitude: rec.Longitude,
      Address: rec.Address,
    },
  });
}
