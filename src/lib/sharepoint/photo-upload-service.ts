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

/** Date key (YYYY-MM-DD) in Asia/Ho_Chi_Minh — same TZ as reporting "today". */
function vnDateSegment(submittedAt: string): string {
  const d = submittedAt ? new Date(submittedAt) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(safe);
}

/**
 * Drive-relative folder for a submission (Phase R1 — FLAT date segment):
 *   Img/<DepartmentCode>/<YYYY-MM-DD>/<SubmissionId>
 * The path encodes department + date so reporting can treat Data_SubmissionPhotos
 * as the source of truth WITHOUT a header lookup. Deterministic → retries
 * overwrite the same files (idempotent). Area/user/check-item are metadata only.
 * (Old layout Img/<Dept>/<YYYY>/<MM>/<DD>/<Sub> is still READ — see report-service
 * parsePhotoPath — but never written by new code.)
 */
export function buildSubmissionFolder(submissionId: string, submittedAt: string, departmentCode: string): string {
  const dept = (departmentCode || "UNKNOWN").replace(/[^\w-]/g, "_");
  return `${FOLDERS.img}/${dept}/${vnDateSegment(submittedAt)}/${submissionId}`;
}

/** Deterministic file names for a photo pair (1-based seq) using the REAL ext. */
export function buildPhotoFileNames(
  seqNo: number,
  originalExt = "jpg",
  watermarkedExt = "jpg",
): { original: string; watermarked: string } {
  const n = pad2(seqNo);
  return { original: `original-${n}.${originalExt}`, watermarked: `watermarked-${n}.${watermarkedExt}` };
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
  /** REAL types detected from bytes (filenames + content-type derive from these). */
  originalExt?: string;
  watermarkedExt?: string;
  originalType?: string;
  watermarkedType?: string;
}

/** Upload an original+watermarked pair into the submission folder. Idempotent paths. */
export async function uploadPhotoPair(input: PhotoPairInput): Promise<UploadedPhoto> {
  const { client, driveId, folder, seqNo } = input;
  const names = buildPhotoFileNames(seqNo, input.originalExt ?? "jpg", input.watermarkedExt ?? "jpg");
  const originalPath = `${folder}/${names.original}`;
  const watermarkedPath = `${folder}/${names.watermarked}`;
  const [orig, wm] = await Promise.all([
    uploadBytesToImgPath(client, driveId, originalPath, input.original, input.originalType ?? "image/jpeg"),
    uploadBytesToImgPath(client, driveId, watermarkedPath, input.watermarked, input.watermarkedType ?? "image/jpeg"),
  ]);
  return {
    seqNo,
    originalPath,
    watermarkedPath,
    originalWebUrl: orig.webUrl,
    watermarkedWebUrl: wm.webUrl,
  };
}

/** Download a photo's bytes via an existing client/drive (for integrity verify). */
export async function downloadFromImgPath(
  client: SharePointGraphClient,
  driveId: string,
  relativePath: string,
): Promise<{ data: ArrayBuffer; contentType: string }> {
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  return client.getContent(`/drives/${driveId}/root:/${encoded}:/content`);
}

/** Download a photo's bytes by its drive-relative path (for the authenticated proxy). */
export async function getImgContent(relativePath: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  const client = await getAppOnlyClient();
  const driveId = await getDriveId(client);
  return downloadFromImgPath(client, driveId, relativePath);
}

/** Hard-delete a file by drive-relative path (admin delete). Tolerates 404. Returns true if deleted. */
export async function deleteImgFile(relativePath: string): Promise<boolean> {
  if (!relativePath || !relativePath.startsWith(FOLDERS.img)) return false;
  const client = await getAppOnlyClient();
  const driveId = await getDriveId(client);
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  try {
    await client.del(`/drives/${driveId}/root:/${encoded}`);
    return true;
  } catch {
    return false; // already gone / not found
  }
}
