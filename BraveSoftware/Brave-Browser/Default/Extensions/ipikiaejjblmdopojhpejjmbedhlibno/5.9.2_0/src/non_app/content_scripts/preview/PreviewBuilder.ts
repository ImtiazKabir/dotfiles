import { getDomain, getUrl } from '../../common'
import { ContentPreview } from './ContentPreview'
import { PreviewDomainBlocklist } from './PreviewDomainBlocklist'
import { initializeBackgroundStorage } from '../../../background_storage_cache.js'

export interface ContentPreviewURLMatcher {
  [key: string]: ContentPreview
}

export class PreviewBuilder {
  debug: boolean = false
  matchers: ContentPreviewURLMatcher
  blocklist: PreviewDomainBlocklist

  constructor(
    blocklist: PreviewDomainBlocklist,
    matchers?: ContentPreviewURLMatcher,
    debug?: boolean
  ) {
    this.blocklist = blocklist
    this.matchers = matchers ?? {}
    this.debug = debug ?? false
  }

  async init() {
    // if window has already loaded
    if (document.readyState === 'complete') {
      if (this.debug) console.log('Document loaded, initializing preview...')
      this.initOnURL()
    } else {
      // When window loads
      if (this.debug) console.log('Adding document load listener...')
      window.addEventListener('load', (_) => {
        if (this.debug) console.log('Document loaded, initializing preview...')
        this.initOnURL()
      })
    }

    // When URL in browser changes
    if (this.debug) console.log('Adding URL change listener...')
    window.onpopstate = (_) => {
      if (this.debug) console.log('URL changed, initializing preview...')
      this.initOnURL()
    }
  }

  async initOnURL() {
    // check block list
    const domain = getDomain()
    if (this.debug) console.log(`Current domain: ${domain}`)
    if (this.blocklist.isBlocklistedDomain(domain)) {
      if (this.debug) console.log('Domain is blocklisted, not adding preview')
      return
    }

    // compare the domain to the matchers
    for (const [key, value] of Object.entries(this.matchers)) {
      if (domain === key) {
        // init on this url
        value.init()
      }
    }
  }
}
