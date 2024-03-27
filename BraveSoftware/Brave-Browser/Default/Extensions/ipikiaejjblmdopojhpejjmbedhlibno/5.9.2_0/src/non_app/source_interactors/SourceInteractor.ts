import { PageTurnAction, PageDirection, PageTurnMessage } from "./PageTurn";
import { DOMContentParser } from "../parsers/DOMContentParser";
import { ContentProcessor } from "../processors/ContentProcessor";
import { ContentLoader } from "../loaders/ContentLoader";
import { wait } from "../common";
import { dir } from "console";

export abstract class SourceInteractor {
  parser: DOMContentParser;
  processor: ContentProcessor;
  loader: ContentLoader;
  debug: boolean;
  hasListenersKey: string = "hasInteractorListeners";

  constructor(
    parser: DOMContentParser,
    processor: ContentProcessor,
    loader: ContentLoader,
    debug: boolean = false
  ) {
    this.debug = debug;
    this.parser = parser;
    this.processor = processor;
    this.loader = loader;
  }

  protected abstract _buildLoadingIndicatorElement(): HTMLElement;
  showLoadingIndicator() {
    this.hideLoadingIndicator();
    if (this.debug === true) console.log("showing loading indicator...");
    const loadingIndicatorElement = this._buildLoadingIndicatorElement();
    const contentDocument = this.parser;
    // TODO: this might need to be a little different for the kindle cloud reader?
    this.parser.getContentDocument().body.appendChild(loadingIndicatorElement);
  }
  hideLoadingIndicator() {
    if (this.debug === true) console.log("hiding loading indicator...");
    const loadingIndicatorElement = this._buildLoadingIndicatorElement();
    const loadingIndicatorElementId = loadingIndicatorElement.id;
    const contentDocument = this.parser.getContentDocument();
    contentDocument.getElementById(loadingIndicatorElementId)?.remove();
  }

  abstract turnPage(direction: PageDirection): Promise<void>;
  setup(): void {
    // check if window has a property that indicates listeners are already set up
    if (window.hasOwnProperty(this.hasListenersKey)) {
      console.warn("Listeners already set up for this interactor.");
      return;
    }

    if (this.debug)
      console.log("Setting up message listeners for the first time...");

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (this.debug) console.log("message received:", request);
      const pageTurnMessage: PageTurnMessage = request as PageTurnMessage;

      switch (request.action) {
        case "clearLoadingIndicator":
          let clearLoadingTimeout = setTimeout(() => {
            this.hideLoadingIndicator();
          }, 1000);

          sendResponse({
            success: true,
          });
          break;

        case "getLocationString":
          if (request.sourceType === "kindle") {
            const locationString = this.parser.getLocationString();
            sendResponse({
              locationString,
            });
          }
          break;

        case PageTurnAction.Preload:
          if (this.debug)
            console.log("message received to preload next page:", request);

          (async () => {
            await this.preloadNextPage(pageTurnMessage.direction);
          })();
          sendResponse({
            success: true,
          });
          break;

        case PageTurnAction.TurnAndPreload:
          if (this.debug)
            console.log(
              "message received to turn page and then preload following page:",
              request
            );
          (async () => {
            // turn the page
            await this.turnPage(pageTurnMessage.direction);

            // send messsage to update the reader with new location string
            this.updateLocationString();

            // wait 1 second due to amazon throttle for turning pages too quickly
            await wait(1000);

            // then preload the next page
            await this.preloadNextPage(pageTurnMessage.direction);
          })();
          sendResponse({
            success: true,
          });
          break;

        case PageTurnAction.TurnAndExtract:
          if (this.debug)
            console.log(
              "message received to turn page and extract (and not preload following)",
              request
            );
          (async () => {
            await this.turnPage(pageTurnMessage.direction);
            const currentPageContent = this.parser.getCurrentPageContent();
            const processorResponse = await this.processor.process(
              currentPageContent
            );
            await this.loader.load(processorResponse, false, false);
          })();
          sendResponse({
            success: true,
          });
          break;

        default:
          sendResponse({
            success: false,
          });
          break;
      }
    });

    // @ts-ignore
    window[this.hasListenersKey] = true; // set property on window to indicate listeners are set up
  }

  updateLocationString(): void {
    if (this.debug) console.log("updating location string in reader...");
    chrome.runtime.sendMessage(
      { action: "updateLocationString" },
      (response) => {}
    );
  }

  preloadNextPage = async (direction: PageDirection): Promise<void> => {
    if (this.debug) console.log("preloading next page...");
    // turn page
    await this.turnPage(direction);
    // parse the content
    const currentPageContent = this.parser.getCurrentPageContent();
    // process the content
    const processorResponse = await this.processor.process(currentPageContent);
    // use the loader to store the content in the cache (instead of opening the reader)
    await this.loader.load(processorResponse, false, true);
    // turn page back
    await this.turnPage(
      direction === PageDirection.Next
        ? PageDirection.Previous
        : PageDirection.Next
    );
  };
}
