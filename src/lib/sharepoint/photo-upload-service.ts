/**
 * SharePoint photo upload (Phase 3.0) — app-only Graph Drive API.
 *
 * Uploads original + watermarked JPEGs into the "5S" document library under a
 * deterministic folder so retries overwrite the same files (idempotent):
 *   Img/YYYY/MM/DD/<DepartmentCode>/<SubmissionId>/{original,watermarked}-NN.jpg
 *
 * Uploads raw bytes (ArrayBuffer), never base64. Small-file PUT (≤ ~4MB) which
 * also creates any missing parent folders. Returns the drive-relative path
 * (stored in Data_SubmissionPhotos) so the photo proxy can stream it back.
 */
import { FOLDERS } from "./sharepoint-config";
import { getAppOnlyClient, type SharePointGraphClient } from "./graph-client";
import { resolveLibraryDrive, resolveSite } from "./site-context";

export interface UploadedPhoto {
  seqNo: number;
  originalPath: string; // drive-relative, e.g. Img/2026/06/26/TCKS/SUB-.../original-01.jpg
  watermarkedPath: string;
  originalWebUrl: string;
  watermarkedWebUrl: string;
}

interface DriveItemResult {
  id: string;
  name: string;
  webUrl: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Drive-relative folder for a submission, derived from submittedAt (VN day not required — uses ISO date parts of submittedAt UTC→ but we accept explicit yyyy/mm/dd). */
export function buildSubmissionFolder(submissionId: string, submittedAt: string, departmentCode: string): string {
  const d = new Date(submittedAt);
  const yyyy = String(d.getFullYear());
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const dept = (departmentCode || "UNKNOWN").replace(/[^\w-]/g, "_");
  return `${FOLDERS.img}/${yyyy}/${mm}/${dd}/${dept}/${submissionId}`;
}

/** Deterministic file names for a photo pair (1-based seq). */
export function buildPhotoFileNames(seqNo: number): { original: string; watermarked: string } {
  const n = pad2(seqNo);
  return { original: `original-${n}.jpg`, watermarked: `watermarked-${n}.jpg` };
}

async function getDriveId(client: SharePointGraphClient): Promise<string> {
  const site = await resolveSite(client);
  const drive = await resolveLibraryDrive(client, site.id);
  if (!drive) throw new Error('Không tìm thấy thư viện tài liệu "5S".');
  return drive.id;
}

/** Upload one blob to a drive-relative path (overwrites on retry). Returns webUrl. */
export async function uploadBytesToImgPath(
  client: SharePointGraphClient,
  driveId: string,
  relativePath: string,
  data: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<DriveItemResult> {
  // PUT .../root:/<path>:/content — creates missing folders, overwrites existing file.
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  return client.putContent<DriveItemResult>(`/drives/${driveId}/root:/${encoded}:/content`, data, contentType);
}

/** Ensure the submission folder context (returns the drive id + folder path). */
export async function ensureSubmissionFolder(
  submissionId: string,
  submittedAt: string,
  departmentCode: string,
): Promise<{ driveId: string; folder: string }> {
  const client = await getAppOnlyClient();
  const driveId = await getDriveId(client);
  const folder = buildSubmissionFolder(submissionId, submittedAt, departmentCode);
  // No explicit folder creation needed — small-file PUT creates parents. Folder
  // path is returned for building file paths; existing folders are reused.
  return { driveId, folder };
}

export interface PhotoPairInput {
  client: SharePointGraphClient;
  driveId: string;
  folder: string;
  seqNo: number;
  original: ArrayBuffer | Uint8Array;
  watermarked: ArrayBuffer | Uint8Array;
  contentType?: string;
}

/** Upload an original+watermarked pair into the submission folder. Idempotent paths. */
export async function uploadPhotoPair(input: PhotoPairInput): Promise<UploadedPhoto> {
  const { client, driveId, folder, seqNo } = input;
  const contentType = input.contentType ?? "image/jpeg";
  const names = buildPhotoFileNames(seqNo);
  const originalPath = `${folder}/${names.original}`;
  const watermarkedPath = `${folder}/${names.watermarked}`;
  const [orig, wm] = await Promise.all([
    uploadBytesToImgPath(client, driveId, originalPath, input.original, contentType),
    uploadBytesToImgPath(client, driveId, watermarkedPath, input.watermarked, contentType),
  ]);
  return {
    seqNo,
    originalPath,
    watermarkedPath,
    originalWebUrl: orig.webUrl,
    watermarkedWebUrl: wm.webUrl,
  };
}

/** Download a photo's bytes by its drive-relative path (for the authenticated proxy). */
export async function getImgContent(relativePath: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  const client = await getAppOnlyClient();
  const driveId = await getDriveId(client);
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  return client.getContent(`/drives/${driveId}/root:/${encoded}:/content`);
}
