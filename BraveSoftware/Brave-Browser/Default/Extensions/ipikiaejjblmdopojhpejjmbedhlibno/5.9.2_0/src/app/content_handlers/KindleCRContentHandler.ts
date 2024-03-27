import { SourceContentHandler } from "./SourceContentHandler";
import { SourceType } from "./util";
import {
  PageDirection,
  PageTurnAction,
  PageTurnMessage,
} from "../../non_app/source_interactors/PageTurn";

// @ts-ignore
import { pushEvent } from "../../analytics_g.js";

export class KindleCRContentHandler extends SourceContentHandler {
  state: any; // TODO: add type definitions
  storageCache: any; // TODO: add type definitions
  selectedTextSetter: (nextPageSelectedText: string) => void;

  constructor(
    readerTabId: number,
    sourceTabId: number,
    state: any,
    storageCache: any,
    selectedTextSetter: (nextPageSelectedText: string) => void
  ) {
    super(readerTabId, sourceTabId, SourceType.KINDLE_CLOUD_READER);
    this.state = state;
    this.storageCache = storageCache;
    this.selectedTextSetter = selectedTextSetter;

    // set up storage listeners
    chrome.storage.onChanged.addListener(async (changes, namespace) => {
      for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        // handle certain storage keys changing
        switch (key) {
          case this.storageCache.NEXT_PAGE_SELECTED_TEXT:
            const nextPageSelectedText =
              await this.storageCache.getSettingFromStorage(
                this.storageCache.NEXT_PAGE_SELECTED_TEXT
              );
            if (typeof nextPageSelectedText !== "undefined") {
              state.isPreloadingNext = false;
              $(this.getPageTurnRight()).removeClass("disabled");
              console.log(
                "done pre-loading next page text. re-enabling page turn button"
              );
            }
            break;

          default:
            break;
        }
      }
    });

    // preload the next page immediately
    console.log("immediately preloading next page...");

    // reset next page cache when content handler is loaded
    this.storageCache
      .removeSetting(storageCache.NEXT_PAGE_SELECTED_TEXT)
      .then(() => {
        console.log("next page selected text removed");
        // debug
        this.storageCache
          .getSettingFromStorage(storageCache.NEXT_PAGE_SELECTED_TEXT)
          .then((nextPageSelectedText: any) => {
            console.log(
              "next page selected text after removal: ",
              nextPageSelectedText
            );
          });

        this._startWaitingForNextPageSelectedText();

        // turn to the next page so that we can preload it
        // send message to content script in tab to turn page but handle potential nulls
        if (!this.sourceTabId) {
          pushEvent(
            "error",
            "failed-preload-page-turn-event-no-current-tab-id",
            "kindle"
          );
          console.error(
            "No this.sourceTabId, required to send message to turn page."
          );
        }
        if (!this.readerTabId) {
          pushEvent(
            "error",
            "failed-preload-page-turn-event-no-spreed-window-tab-id",
            "kindle"
          );
          console.error(
            "No this.readerTabId, required to send message to turn page."
          );
        }
        if (this.sourceTabId && this.readerTabId) {
          // send to the current tab with kindle cloud reader, not to background
          console.log("sending message to preload next page...");
          chrome.tabs.sendMessage(
            this.sourceTabId,
            new PageTurnMessage(
              PageTurnAction.Preload,
              PageDirection.Next,
              this.readerTabId
            ),
            // {
            //   action: "pageTurnPreload",
            //   direction: PageDirection.Next,
            //   sourceTabId: this.readerTabId,
            // },
            function (response) {
              // response does not contain anything. extraction is async and swiftread window will have an event listener
            }
          );
        }
      });
  }

  setLocationString() {
    // send message to extract the new location string synchronously
    console.log(
      "sending message to extract new location string synchronously..."
    );
    chrome.tabs.sendMessage(
      this.sourceTabId,
      {
        action: "getLocationString",
        sourceTabId: this.readerTabId,
        sourceType: "kindle",
      },
      function (response) {
        const locationString = response.locationString;
        console.log("locationString response:", locationString);
        $("#controls-message").html(locationString);
      }
    );
  }

  // set up helper functions
  private _startWaitingForNextPageSelectedText() {
    console.log("in progress pre-load next page text...");

    this.state.isPreloadingNext = true;
    // disable page turn right button
    $(this.getPageTurnRight()).addClass("disabled");
  }

  // TODO: these page turn on/off functions should probably be abstracted out of the kindle handler: they apply generally to all content handlers
  _pageTurnAreaSpinnerOn(pageTurnElParent: HTMLElement) {
    let spinner = $(pageTurnElParent).find(".fa-spin");
    if (spinner.length > 0) {
      // there's already a spinner, don't add another one
    } else {
      // there isn't a spinner yet, add one
      $(pageTurnElParent).append('<i class="fas fa-circle-notch fa-spin"></i>');
    }
    // turn the spinner on
    spinner = $(pageTurnElParent).find(".fa-spin");
    spinner.removeClass("hidden");
    // turn the button off
    $(pageTurnElParent).find("a").addClass("hidden");
  }
  _pageTurnAreaSpinnerOff(pageTurnElParent: HTMLElement) {
    setTimeout(function () {
      // turn the spinner off
      $(pageTurnElParent).find(".fa-spin").addClass("hidden");
      // turn the button on
      $(pageTurnElParent).find("a").removeClass("hidden");
    }, 100);
  }

  // TODO: this can be abstracted out into the generic content handler class
  async handlePageTurn(event: JQuery.ClickEvent, forward: boolean = true) {
    console.log("------ handle page turn function, forward: ", forward);

    const pageTurnEl = forward
      ? this.getPageTurnRight()
      : this.getPageTurnLeft();
    console.log("pageTurnEl: ", pageTurnEl);

    if (typeof $(pageTurnEl).parent().get(0) === "undefined") {
      throw new Error(`no parent found for pageTurnEl: ${pageTurnEl}`);
    }
    const pageTurnElParent: HTMLElement = $(pageTurnEl).parent().get(0)!;
    // TODO: since we're recasting the element as jquery every time, just pass in the jquery object directly?

    // prevent default event if exists
    if (event) {
      event.preventDefault();
    }
    // prevent execution of page turn next if next page is already preloading
    if (this.state.isPreloadingNext === true && forward === true) {
      console.log("next page is preloading, not turning page");
      return;
    }

    // console.log('using new page turn handler');
    // set the button to spinner
    this._pageTurnAreaSpinnerOn(pageTurnElParent);

    // send message to content script in tab to turn page but handle potential nulls
    if (!this.sourceTabId) {
      pushEvent("error", "failed-kindle-page-turn-event-no-source-tab-id");
      console.error(
        "No this.sourceTabId, required to send message to turn Kindle page."
      );
    }
    if (!this.readerTabId) {
      pushEvent(
        "error",
        "failed-kindle-page-turn-event-no-reader-window-tab-id"
      );
      console.error(
        "No this.readerTabId, required to send message to turn Kindle page."
      );
    }
    if (this.sourceTabId && this.readerTabId) {
      const currentSelectedText = await this.storageCache.getSettingFromStorage(
        this.storageCache.SELECTED_TEXT
      );
      console.log("currentSelectedText: ", currentSelectedText);

      // get next page pre-loaded text if any
      const nextPageSelectedText =
        await this.storageCache.getSettingFromStorage(
          this.storageCache.NEXT_PAGE_SELECTED_TEXT
        );
      console.log("nextPageSelectedText at page turn:", nextPageSelectedText);
      // get previous page pre-loaded text if any
      // TODO: is previous page used anywhere?
      // TODO: e.g. is it set to current page text when turning right, and when turning left is it used to set current page text?
      const previousPageSelectedText =
        await this.storageCache.getSettingFromStorage(
          this.storageCache.PREVIOUS_PAGE_SELECTED_TEXT
        );
      console.log(
        "previousPageSelectedText at page turn:",
        previousPageSelectedText
      );

      // if there is a pre-preloaded next page text and page turn direction is right
      // load that next without reload
      if (
        forward == true &&
        typeof nextPageSelectedText !== "undefined" &&
        nextPageSelectedText !== null
      ) {
        console.log("loading next pre-loaded page...");

        await this.storageCache.removeSetting(
          this.storageCache.NEXT_PAGE_SELECTED_TEXT
        );

        this._startWaitingForNextPageSelectedText();

        // REFRESH WITHOUT RELOAD logic
        // TODO: abstract / generalize this "refresh without reload" logic, it applies to all other content handlers too
        // set selected text to next page's text
        await this.storageCache.setSetting(
          this.storageCache.SELECTED_TEXT,
          nextPageSelectedText
        );
        this.selectedTextSetter(nextPageSelectedText);

        // turn spinner off
        this._pageTurnAreaSpinnerOff(pageTurnElParent);

        // actually turn to the next page in the source, and preload the page after that
        // send to the current tab with kindle cloud reader, not to background
        this.state.isPreloadingNext = true;

        chrome.tabs.sendMessage(
          this.sourceTabId,
          new PageTurnMessage(
            PageTurnAction.TurnAndPreload,
            PageDirection.Next,
            this.readerTabId
          ),
          (response) => {
            // set new location string but only after actual page turn
            console.log("[DEBUG] setting new location string..."); // hypothesis: this fires too soon because of async
            this.setLocationString();
          }
        );
      } else {
        console.log("no page was pre-loaded, turning like normal");

        await this.storageCache.removeSetting(
          this.storageCache.NEXT_PAGE_SELECTED_TEXT
        );
        // if page turn direction is left, set the next page text to current page's text before actually turning the page
        if (forward == false) {
          await this.storageCache.setSetting(
            this.storageCache.NEXT_PAGE_SELECTED_TEXT,
            currentSelectedText
          );
        }

        // turn page, extract
        console.log("sending message to turn page left");
        chrome.tabs.sendMessage(
          this.sourceTabId,
          new PageTurnMessage(
            PageTurnAction.TurnAndExtract,
            PageDirection.Previous,
            this.readerTabId
          ),
          function (response) {}
        );
      }
    }
  }
}
