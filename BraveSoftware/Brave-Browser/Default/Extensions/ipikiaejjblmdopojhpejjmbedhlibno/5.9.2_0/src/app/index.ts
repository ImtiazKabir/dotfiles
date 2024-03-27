// 1. must explictly import all the exports that we want to expose to vanilla javascript
import {
  testFunction,
  PDFContentHandler,
  EpubContentHandler,
  KindleCRContentHandler,
} from './content_handlers'

import { getUrlType, UrlType } from 'app/util/client-helpers'

import { isFeatureEnabled } from '../feature_flags'

// 2. then make them available in window so that vanilla javascript can access them
// @ts-ignore
window.testFunction = testFunction
// @ts-ignore
window.PDFContentHandler = PDFContentHandler
// @ts-ignore
window.EpubContentHandler = EpubContentHandler
// @ts-ignore
window.KindleCRContentHandler = KindleCRContentHandler
// @ts-ignore
window.getUrlType = getUrlType
// @ts-ignore
window.UrlType = UrlType
