/**
 * Microsoft Graph wire types for SharePoint (Phase 2C.1). Minimal shapes for the
 * read-only foundation; the Upload Engine (2C.2) extends with write payloads.
 */

export interface GraphSite {
  id: string;
  webUrl: string;
  displayName?: string;
}

export interface GraphList {
  id: string;
  name: string;
  displayName?: string;
}

export interface GraphDrive {
  id: string;
  name: string;
  webUrl?: string;
}

/** SharePoint list item field bag — values are unknown until mapped. */
export type GraphListItemFields = Record<string, unknown>;

export interface GraphListItem<TFields extends GraphListItemFields = GraphListItemFields> {
  id: string;
  fields: TFields;
}

export interface GraphCollection<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

export class SharePointError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "SharePointError";
  }
}
