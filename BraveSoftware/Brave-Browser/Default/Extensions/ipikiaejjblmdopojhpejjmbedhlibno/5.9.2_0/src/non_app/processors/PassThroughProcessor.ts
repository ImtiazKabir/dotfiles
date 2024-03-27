import { ContentProcessor } from "./ContentProcessor";

export class PassThroughProcessor extends ContentProcessor {
  async process(contentElements: HTMLElement[]): Promise<string> {
    // construct HTML string from contentElements
    let htmlString = "";
    for (const element of contentElements) {
      htmlString += element.outerHTML;
    }
    return htmlString;
  }
}
