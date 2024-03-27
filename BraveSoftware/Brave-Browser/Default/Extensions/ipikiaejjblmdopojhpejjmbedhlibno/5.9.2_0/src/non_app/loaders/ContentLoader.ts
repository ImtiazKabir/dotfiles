import {
  ContentProcessor,
  ContentProcessorResponse,
  isContentProcessorResponse,
} from '../processors/ContentProcessor'
import { sendMessagePromise, getCurrentTab } from '../common'
import { PageMetadata } from '../background'

export enum ContentLoaderType {
  KindleCloudReader = 'kindle-cloud-reader',
  ChatGPT = 'chat-gpt',
}

export abstract class ContentLoader {
  debug: boolean
  loaderType: ContentLoaderType
  constructor(loaderType: ContentLoaderType, debug: boolean = false) {
    this.loaderType = loaderType
    this.debug = debug
  }

  async loadContentFromDb(
    processorResponse: ContentProcessorResponse,
    isFirstLoad: boolean = false,
    cacheOnly: boolean = false
  ) {
    // set variables for needed for left/right page turn
    // get set the source's domain for the reader
    let domain = window.location.href // set as full url
    // get the current source tab id for the reader
    let currentTab = await getCurrentTab()
    await sendMessagePromise({
      action: 'setVarsForPageTurn',
      currentDomain: domain,
      currentTabId: currentTab.id,
    })

    switch (cacheOnly) {
      case false:
        // tell background to watch for the document in collection
        // if not from page turn, open a new swiftread window
        // if from page turn, reload the existing swiftread window
        // TODO: add type checking to this message
        chrome.runtime.sendMessage(
          {
            action: 'openWithFirebaseDocument',
            collection: processorResponse.collection,
            id: processorResponse.id,
            field: processorResponse.field,
            source: this.loaderType,
            reload: !isFirstLoad,
            tabId: currentTab.id,
          },
          function (response) {
            // don't expect a response, could take a few seconds. background will open/reload the reader window
          }
        )
        break
      case true:
        // tell background to watch for the document in collection and cache the it
        chrome.runtime.sendMessage(
          {
            action: 'localStorageWithFirebaseDocument',
            collection: processorResponse.collection,
            id: processorResponse.id,
            field: processorResponse.field,
            source: this.loaderType,
            localStorageVarName: 'nextPageSelectedText',
            tabId: currentTab.id,
          },
          function (response) {
            // don't expect a response, could take a few seconds. there will be an event handler
          }
        )
    }
  }

  async loadContentFromString(content: string) {
    let keepRaw = false
    chrome.runtime.sendMessage(
      { action: 'extractor', html: content, keepRaw },
      function (response) {
        console.log('opening reader...')
        chrome.runtime.sendMessage(
          { action: 'openReader' },
          function (response) {}
        )
      }
    )
  }

  async load(
    processorResponse: ContentProcessorResponse | string,
    isFirstLoad: boolean = false,
    cacheOnly: boolean = false
  ): Promise<void> {
    if (isContentProcessorResponse(processorResponse)) {
      // Load the content from the db
      await this.loadContentFromDb(
        processorResponse as ContentProcessorResponse,
        isFirstLoad,
        cacheOnly
      )
    } else if (typeof processorResponse === 'string') {
      // Handle the string case
      if (this.debug)
        console.log('processorResponse is a string:', processorResponse)
      await this.loadContentFromString(processorResponse as string)
    } else {
      throw new Error('Invalid type for processorResponse')
    }

    // track event
    chrome.runtime.sendMessage(
      {
        action: 'pushEvent',
        eventCategory: 'read-format',
        eventAction: 'extract-text',
        eventLabel: this.loaderType,
      },
      function (response) {
        // console.log('pushEvent response:',response);
      }
    )
  }

  async setMetadata(metadata: PageMetadata) {
    if (this.debug) console.log('Setting metadata...', metadata)
    const response = await chrome.runtime.sendMessage({
      action: 'setMetadata',
      metadata,
    })
  }
}
