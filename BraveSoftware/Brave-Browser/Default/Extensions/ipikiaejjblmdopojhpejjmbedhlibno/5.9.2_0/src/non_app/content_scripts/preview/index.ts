import { ChatGPTContentBuilder } from '../../content_builders/chat_gpt/ChatGPTContentBuilder'
import { ContentPreviewURLMatcher, PreviewBuilder } from './PreviewBuilder'
import { PreviewDomainBlocklist } from './PreviewDomainBlocklist'
import { ChatGPTPreview } from './chat_gpt/ChatGPTPreview'

const debug = false
if (debug) console.log('Preview content script loaded...')

const contentPreviewURLMatchers: ContentPreviewURLMatcher = {
  'chat.openai.com': new ChatGPTPreview(new ChatGPTContentBuilder(), {
    debug: debug,
  }),
}

const blocklist = new PreviewDomainBlocklist()
if (debug) console.log(`Blocklist retrieved: `, blocklist)

const previewBuilder = new PreviewBuilder(
  blocklist,
  contentPreviewURLMatchers,
  debug
)
if (debug) console.log(`Preview builder created`)
previewBuilder.init()
if (debug) console.log(`Preview builder initialized`)
