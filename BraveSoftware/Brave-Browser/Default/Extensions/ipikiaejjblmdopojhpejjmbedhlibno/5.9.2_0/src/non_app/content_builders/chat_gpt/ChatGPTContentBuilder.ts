import { ChatGPTParser } from "../../parsers/chat_gpt/ChatGPTParser";
import { ContentBuilder } from "../ContentBuilder";
import { PassThroughProcessor } from "../../processors/PassThroughProcessor";
import { TypedContentLoader } from "../../loaders/TypedContentLoader";
import { ContentLoaderType } from "../../loaders/ContentLoader";

export class ChatGPTContentBuilder extends ContentBuilder {
  constructor(debug: boolean = false) {
    const parser = new ChatGPTParser(debug);
    const processor = new PassThroughProcessor(debug);
    const loader = new TypedContentLoader(ContentLoaderType.ChatGPT, debug);

    super(parser, processor, loader);
  }
}
