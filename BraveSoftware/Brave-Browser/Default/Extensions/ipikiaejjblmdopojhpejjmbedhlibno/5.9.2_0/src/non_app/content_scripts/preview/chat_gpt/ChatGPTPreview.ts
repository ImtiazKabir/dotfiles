import { ContentBuilder } from "../../../content_builders/ContentBuilder";
import { ContentPreview, ContentPreviewType } from "../ContentPreview";

export class ChatGPTPreview extends ContentPreview {
  constructor(
    builder: ContentBuilder,
    options?: {
      debug?: boolean;
    }
  ) {
    super(builder, ContentPreviewType.ChatGPT, options);
  }
  protected async getPreviewButtonText(): Promise<string> {
    await this.waitForContentLoad(3); // TODO: move this out into parent class?

    try {
      const currentPage = this.builder.parser.getCurrentPage();
      const readingTime = this.getReadingTimeMinutes(currentPage);
      return `${readingTime} min`;
    } catch (error) {
      console.warn(error);
      return "Open a chat first";
    }
  }

  protected applyStylesToPreviewButton(
    previewButton: HTMLElement,
    elementToAppendTo: HTMLElement
  ): void {
    // if previewButton is in elementToAppendTo, don't do anything
    if (elementToAppendTo !== document.body) {
      if (this.debug) console.log("Not applying any styles to preview button");
      previewButton.style.position = "static";
      return;
    } else {
      // otherwise add styles assuming elementToAppend to is document body
      if (this.debug) console.log("Applying body styles to preview button");
      // Give preview button absolute positioning so that it appears on top of the element
      // it's appended to.
      previewButton.style.position = "absolute";
      previewButton.style.zIndex = "1000";
      // By default, position the preview button in the bottom right hand corner with some padding
      // from the edge of the element it's appended to.
      previewButton.style.bottom = "10px";
      previewButton.style.right = "10px";
    }
  }

  protected elementToAppendTo(): HTMLElement | undefined {
    // If has current page / is in a chat, append to parent of "Regenerate Response" button
    const buttons = document.querySelectorAll("button");
    if (this.debug) console.log("buttons: ", buttons);

    const button = Array.from(buttons).find((button) =>
      button.innerText.trim().toLowerCase().includes("regenerate")
    );

    if (this.debug) console.log("Regenerate response button: ", button);

    // get nearest ancestor with display: flex
    let ancestor: HTMLElement | null | undefined = button?.parentElement;
    while (ancestor) {
      const displayStyle = getComputedStyle(ancestor).display;
      if (displayStyle === "flex") {
        break;
      }
      ancestor = ancestor.parentElement;
    }

    if (typeof ancestor === "undefined" || ancestor === null) {
      return undefined;
    } else {
      // add a flex gap to the ancestor to make sure the preview button is spaced out from everything else
      ancestor.style.gap = "10px";
      return ancestor;
    }
  }
}
