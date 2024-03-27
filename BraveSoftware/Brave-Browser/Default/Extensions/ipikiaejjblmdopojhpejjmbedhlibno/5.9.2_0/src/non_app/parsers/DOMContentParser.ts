import { PageMetadata } from '../background'

export abstract class DOMContentParser {
  debug: boolean

  constructor(debug: boolean = false) {
    this.debug = debug
  }
  abstract getContentDocument(): Document
  protected abstract getPages(): HTMLElement[]
  protected abstract getCurrentlyVisiblePage(pages: HTMLElement[]): HTMLElement
  getCurrentPage(): HTMLElement {
    return this.getCurrentlyVisiblePage(this.getPages())
  }

  abstract getCurrentPageContent(): HTMLElement[] // array of elements that represent the content on the page
  abstract getSelectedText(): void

  protected abstract _getLocationString(): string
  getLocationString(): string {
    const locationString = this._getLocationString()
    // store location string in local storage
    chrome.runtime.sendMessage(
      { action: 'storeLocationString', locationString: locationString },
      (response) => {
        if (this.debug) console.log('Stored location string:', locationString)
      }
    )
    return locationString
  }

  abstract getMetadata(): PageMetadata
}
