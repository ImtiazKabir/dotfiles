import { ContentLoader, ContentLoaderType } from "./ContentLoader";
export class TypedContentLoader extends ContentLoader {
  constructor(loaderType: ContentLoaderType, debug: boolean = false) {
    super(loaderType, debug);
  }
}
