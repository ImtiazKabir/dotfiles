import assert from 'assert'
import {
  SourceType,
  PAGE_TURN_SELECTOR,
  PAGE_TURN_LEFT_SELECTOR,
  PAGE_TURN_RIGHT_SELECTOR,
} from './util'

export abstract class SourceContentHandler {
  readerTabId: number
  sourceTabId: number
  type: SourceType

  constructor(readerTabId: number, sourceTabId: number, type: SourceType) {
    console.log('ContentHandler initializing with type ', type)
    if (!readerTabId) {
      throw new Error('readerTabId must be set')
    }
    if (!sourceTabId) {
      throw new Error('sourceTabId must be set')
    }
    this.readerTabId = readerTabId
    this.sourceTabId = sourceTabId
    this.type = type

    this.init()
  }

  init() {
    // first get the location string
    assert(this.sourceTabId, 'source tab id must be set')
    this.setLocationString()

    // then show the page turn buttons and set up listeners
    $(PAGE_TURN_SELECTOR).show()
    this.initListeners()
  }

  async focusSourceTab(): Promise<void> {
    const focusedTab = await chrome.tabs.update(this.sourceTabId, {
      active: true,
    })
  }

  initListeners(): void {
    // set up page turn listeners
    $(this.getPageTurnLeft()).on('click', async (event) => {
      await this.focusSourceTab()
      this.handlePageTurn(event, false)
    })
    $(this.getPageTurnRight()).on('click', async (event) => {
      await this.focusSourceTab()
      this.handlePageTurn(event, true)
    })

    // set up message listener to update location string from source
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // only accept messages from the source tab
      if (sender.tab?.id !== this.sourceTabId) {
        return
      }

      if (request.action === 'updateLocationString') {
        this.setLocationString()
      }
    })
  }

  private _getPageTurnElement(forward: boolean): HTMLElement {
    let pageTurnElement: HTMLElement | undefined = forward
      ? $(PAGE_TURN_RIGHT_SELECTOR).get(0)
      : $(PAGE_TURN_LEFT_SELECTOR).get(0)
    if (!pageTurnElement) {
      throw new Error(
        `page turn element not found for selector: ${
          forward ? PAGE_TURN_RIGHT_SELECTOR : PAGE_TURN_LEFT_SELECTOR
        }`
      )
    }
    return pageTurnElement
  }
  getPageTurnLeft(): HTMLElement {
    return this._getPageTurnElement(false)
  }
  getPageTurnRight(): HTMLElement {
    return this._getPageTurnElement(true)
  }

  protected abstract setLocationString(): void

  protected abstract handlePageTurn(
    event: JQuery.ClickEvent,
    forward: boolean
  ): void
}
