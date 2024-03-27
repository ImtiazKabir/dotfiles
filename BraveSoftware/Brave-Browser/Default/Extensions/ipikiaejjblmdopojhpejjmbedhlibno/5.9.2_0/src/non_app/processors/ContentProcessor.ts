import assert from "assert";

export interface ContentProcessorResponse {
  collection: string;
  id: number;
  field: string;
}
export function assertJsonIsContentProcessorResponse(jsonResponse: any) {
  assert(jsonResponse.collection, "collection not found in response");
  assert(jsonResponse.id, "id not found in response");
  assert(jsonResponse.field, "field not found in response");
}
export function isContentProcessorResponse(object: any) {
  return (
    object.collection !== undefined &&
    object.id !== undefined &&
    object.field !== undefined
  );
}

export abstract class ContentProcessor {
  debug: boolean;

  constructor(debug: boolean = false) {
    this.debug = debug;
  }

  abstract process(
    contentElements: HTMLElement[]
  ): Promise<ContentProcessorResponse | string>;
}
