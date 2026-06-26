/**
 * Admin photo moderation (Phase 3.3) — soft-delete / restore Data_SubmissionPhotos
 * rows + optional hard-delete of the underlying files in the 5S library.
 *
 * Soft delete: IsDeleted=true + DeletedAt/DeletedBy/DeleteReason (additive fields).
 * Header Data_Submissions is NEVER deleted; PhotoCount is recalculated to the
 * number of non-deleted photos. If all photos are deleted the header remains
 * "uploaded" with PhotoCount=0 (documented behavior — keeps the audit trail).
 */
import { DATA_LISTS } from "./sharepoint-config";
import { getAppOnlyClient, type SharePointGraphClient } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import { mapSubmissionPhoto } from "./list-helpers";
import { deleteImgFile, getImgContent } from "./photo-upload-service";
import type { GraphCollection, GraphListItem } from "./sharepoint-types";
import type { SubmissionPhotoRecord } from "@/types/sharepoint";

async function ctx(): Promise<{ client: SharePointGraphClient; siteId: string }> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  return { client, siteId: site.id };
}

async function photoItems(client: SharePointGraphClient, siteId: string, listId: string): Promise<GraphListItem[]> {
  const res = await client.get<GraphCollection<GraphListItem>>(
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`,
  );
  return res.value;
}

async function recalcPhotoCount(
  client: SharePointGraphClient,
  siteId: string,
  submissionId: string,
  photoRows: GraphListItem[],
): Promise<number> {
  const visible = photoRows
    .map((it) => mapSubmissionPhoto(it.fields))
    .filter((p) => p.SubmissionId === submissionId && !p.IsDeleted).length;
  const subListId = await findListId(client, siteId, DATA_LISTS.submissions);
  if (subListId) {
    const subs = await client.get<GraphCollection<GraphListItem>>(
      `/sites/${siteId}/lists/${subListId}/items?expand=fields&$top=999`,
    );
    const hit = subs.value.find((it) => (it.fields as Record<string, unknown>).SubmissionId === submissionId);
    if (hit) {
      await client.patch(`/sites/${siteId}/lists/${subListId}/items/${hit.id}/fields`, { PhotoCount: visible });
    }
  }
  return visible;
}

export interface DeletePhotoInput {
  photoId: string;
  reason: string;
  deletedBy: string;
  deleteFiles: boolean;
}

export interface DeletePhotoResult {
  ok: boolean;
  photoId: string;
  filesDeleted: { original: boolean; watermarked: boolean };
  remainingPhotos: number;
  note?: string;
}

export async function softDeletePhoto(input: DeletePhotoInput): Promise<DeletePhotoResult> {
  const { client, siteId } = await ctx();
  const listId = await findListId(client, siteId, DATA_LISTS.submissionPhotos);
  if (!listId) throw new Error("Chưa có list Data_SubmissionPhotos.");
  const items = await photoItems(client, siteId, listId);
  const it = items.find((x) => mapSubmissionPhoto(x.fields).PhotoId === input.photoId);
  if (!it) return { ok: false, photoId: input.photoId, filesDeleted: { original: false, watermarked: false }, remainingPhotos: 0, note: "not found" };
  const rec = mapSubmissionPhoto(it.fields);

  await client.patch(`/sites/${siteId}/lists/${listId}/items/${it.id}/fields`, {
    IsDeleted: true,
    DeletedAt: new Date().toISOString(),
    DeletedBy: input.deletedBy,
    DeleteReason: (input.reason || "").slice(0, 250),
  });

  const filesDeleted = { original: false, watermarked: false };
  if (input.deleteFiles) {
    if (rec.OriginalPhotoUrl) filesDeleted.original = await deleteImgFile(rec.OriginalPhotoUrl);
    if (rec.WatermarkedPhotoUrl) filesDeleted.watermarked = await deleteImgFile(rec.WatermarkedPhotoUrl);
  }

  const remaining = await recalcPhotoCount(client, siteId, rec.SubmissionId, items.map((x) => (x.id === it.id ? { ...x, fields: { ...x.fields, IsDeleted: true } } : x)));
  return { ok: true, photoId: input.photoId, filesDeleted, remainingPhotos: remaining };
}

export async function restorePhoto(photoId: string): Promise<{ ok: boolean; note?: string }> {
  const { client, siteId } = await ctx();
  const listId = await findListId(client, siteId, DATA_LISTS.submissionPhotos);
  if (!listId) throw new Error("Chưa có list Data_SubmissionPhotos.");
  const items = await photoItems(client, siteId, listId);
  const it = items.find((x) => mapSubmissionPhoto(x.fields).PhotoId === photoId);
  if (!it) return { ok: false, note: "not found" };
  const rec = mapSubmissionPhoto(it.fields);
  if (!rec.IsDeleted) return { ok: true, note: "đã ở trạng thái hiển thị" };

  // Can only restore if the watermarked file still exists.
  let fileExists = false;
  try {
    const dl = await getImgContent(rec.WatermarkedPhotoUrl);
    fileExists = dl.data.byteLength > 0;
  } catch {
    fileExists = false;
  }
  if (!fileExists) return { ok: false, note: "File ảnh đã bị xoá — không thể khôi phục." };

  await client.patch(`/sites/${siteId}/lists/${listId}/items/${it.id}/fields`, {
    IsDeleted: false,
    DeletedAt: "",
    DeletedBy: "",
    DeleteReason: "",
  });
  await recalcPhotoCount(client, siteId, rec.SubmissionId, items.map((x) => (x.id === it.id ? { ...x, fields: { ...x.fields, IsDeleted: false } } : x)));
  return { ok: true };
}

/** Read photo rows for a submission (admin view, includes deleted). */
export async function getPhotoRecord(photoId: string): Promise<SubmissionPhotoRecord | null> {
  const { client, siteId } = await ctx();
  const listId = await findListId(client, siteId, DATA_LISTS.submissionPhotos);
  if (!listId) return null;
  const items = await photoItems(client, siteId, listId);
  const it = items.find((x) => mapSubmissionPhoto(x.fields).PhotoId === photoId);
  return it ? mapSubmissionPhoto(it.fields) : null;
}
