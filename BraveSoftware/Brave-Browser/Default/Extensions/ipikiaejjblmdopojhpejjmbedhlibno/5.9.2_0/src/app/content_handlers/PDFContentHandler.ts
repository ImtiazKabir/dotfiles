import { SourceType } from "./util";
import { SourceContentHandler } from "./SourceContentHandler";

// @ts-ignore
import { pushEvent } from "../../analytics_g.js";

export class PDFContentHandler extends SourceContentHandler {
  constructor(readerTabId: number, sourceTabId: number) {
    super(readerTabId, sourceTabId, SourceType.PDF);
  }

  setLocationString() {
    // send message to extract the new location string synchronously
    chrome.tabs.sendMessage(
      this.sourceTabId,
      {
        action: "getLocationString",
        sourceTabId: this.readerTabId,
        sourceType: "pdf",
      },
      function (response) {
        // TODO: refactor out of function
        const locationString = response.locationString;
        // console.log("locationString response:", locationString);
        $("#controls-message").html(locationString);
      }
    );
  }

  // TODO: refactor "forward" to be a direction enum
  handlePageTurn(event: JQuery.ClickEvent, forward: boolean = true) {
    event.preventDefault();
    // TODO: is this at the right level of abstraction? (probably not and needs a refactor)
    // get page turn indicator element
    const iconTag = $(event.target).parents("div").first().find("i");
    iconTag.attr("class", "fas fa-circle-notch fa-spin");
    this._sendPageTurnMessage(forward, iconTag.get().pop());
  }

  // TODO: refactor/abstract some of this out
  _sendPageTurnMessage(forward: boolean, iconTag?: HTMLElement) {
    console.log("turning PDF reader page, forward?", forward);

    // send message to content script in tab to turn page but handle potential nulls
    if (!this.sourceTabId) {
      pushEvent("error", "failed-pdf-page-turn-event-no-source-tab-id");
      console.error(
        "No this.sourceTabId, required to send message to turn pdf page."
      );
    }
    if (!this.readerTabId) {
      pushEvent("error", "failed-pdf-page-turn-event-no-reader-window-tab-id");
      console.error(
        "No this.readerTabId, required to send message to turn pdf page."
      );
    }
    if (this.sourceTabId && this.readerTabId) {
      chrome.tabs.sendMessage(
        this.sourceTabId,
        {
          action: "pdfPageTurn",
          forward: forward,
          sourceTabId: this.readerTabId,
        },
        (response) => {
          // console.log('received response:', response);
          if (response) {
            if (response.success === true) {
              // don't do anything if success, because spreed will reload
              console.log("page turned, waiting for reload...");
            } else if (
              response.success === false &&
              response.status === "no-next-page"
            ) {
              console.log("no next page to turn to");

              // reset the icon
              if (iconTag) {
                if (forward) $(iconTag).attr("class", "fas fa-chevron-right");
                else $(iconTag).attr("class", "fas fa-chevron-left");
              }

              alert(
                "Done reading all pages!\n\nIf you think this is an error, email help@swiftread.com"
              );
            } else {
              // TODO: handle user error with pdf page turn
              pushEvent(
                "error",
                "failed-pdf-page-turn-event-response-not-successful",
                this.readerTabId
                  ? "has_reader_tab_id"
                  : this.readerTabId.toString()
              );
              console.error("Did not extract any text after turning page.");
            }
          } else {
            // this should never happen, but if it does it's because the extension has been updated/background page changed, but this open window is still referencing an old background page
            pushEvent(
              "error",
              "failed-pdf-page-turn-event-no-response",
              this.readerTabId
                ? "has_reader_tab_id"
                : this.readerTabId.toString()
            );
            console.error(
              "Error sending message to turn pdf page: ",
              this.sourceTabId,
              this.readerTabId
            );
          }
        }
      );
    }
  }
}
