import { ContentLoader } from '../loaders/ContentLoader'
import { DOMContentParser } from '../parsers/DOMContentParser'
import { ContentProcessor } from '../processors/ContentProcessor'
import { SourceInteractor } from '../source_interactors/SourceInteractor'

export class ContentBuilder {
  parser: DOMContentParser
  processor: ContentProcessor
  loader: ContentLoader
  interactor?: SourceInteractor

  constructor(
    parser: DOMContentParser,
    processor: ContentProcessor,
    loader: ContentLoader,
    interactor?: SourceInteractor
  ) {
    this.parser = parser
    this.processor = processor
    this.loader = loader
    this.interactor = interactor
  }
  async build(): Promise<void> {
    const currentPageContent = this.parser.getCurrentPageContent()
    const processorResponse = await this.processor.process(currentPageContent)

    const metadata = this.parser.getMetadata()
    this.loader.setMetadata(metadata)

    await this.loader.load(processorResponse, true)

    // then, set up the page turn and preload listeners
    if (this.interactor) this.interactor.setup()
  }
}
