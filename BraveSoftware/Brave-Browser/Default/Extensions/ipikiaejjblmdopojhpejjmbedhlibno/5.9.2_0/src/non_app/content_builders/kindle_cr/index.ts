import { KindleCRParser } from '../../parsers/kindle_cr/KindleCRParser'
import { KindleCRProcessor } from '../../processors/kindle_cr/KindleCRProcessor'
import { TypedContentLoader } from '../../loaders/TypedContentLoader'
import { ContentBuilder } from '../ContentBuilder'
import { KindleCRInteractor } from '../../source_interactors/kindle_cr/KindleCRInteractor'
import { ContentLoaderType } from '../../loaders/ContentLoader'

// TODO: after page turn handling etc. is complete, abstract this out into a class that can be used by all content builders
async function run() {
  const parser = new KindleCRParser(false)
  const processor = new KindleCRProcessor()
  const loader = new TypedContentLoader(ContentLoaderType.KindleCloudReader)

  const interactor = new KindleCRInteractor(parser, processor, loader, false)

  interactor.showLoadingIndicator()
  const builder = new ContentBuilder(parser, processor, loader, interactor)
  await builder.build()
}

run()
