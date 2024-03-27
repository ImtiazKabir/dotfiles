import { DOMContentParser } from "../../parsers/DOMContentParser";
import { SVGGoogleDocParser } from "../../parsers/google_docs/SVGGoogleDocParser";

async function run() {
  let parser: DOMContentParser | undefined;
  try {
    parser = new SVGGoogleDocParser(true);
  } catch (e) {
    console.error(e);
    // TODO: try legacy parser
  }

  if (typeof parser !== "undefined") {
    const content = parser.getCurrentPageContent();
    console.log(content);
  }
}

run();
