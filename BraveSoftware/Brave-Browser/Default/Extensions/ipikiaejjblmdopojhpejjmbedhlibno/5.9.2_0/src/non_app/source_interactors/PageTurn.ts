import assert from "assert";

export enum PageDirection {
  Next = "next",
  Previous = "previous",
}

export enum PageTurnAction {
  Preload = "preload",
  TurnAndPreload = "turnAndPreload",
  TurnAndExtract = "turnAndExtract",
}

export class PageTurnMessage {
  constructor(
    public action: PageTurnAction,
    public direction: PageDirection,
    public sourceTabId: number
  ) {}
}

// previously: page turn messages can be
// - preload the content on the next page
// - turn the page, then preload the content on the page after that
// - [deprecate] turn page and extract (and load)

// in the future: page turn messages can be
// - page turn in a certain direction
// - set the appropriate cache to equal the content on the current page (e.g. if turning forward, set the previous page cache to the current page content)
// - return the content on the new page: from the appropriate cache, otherwise parse/process it
