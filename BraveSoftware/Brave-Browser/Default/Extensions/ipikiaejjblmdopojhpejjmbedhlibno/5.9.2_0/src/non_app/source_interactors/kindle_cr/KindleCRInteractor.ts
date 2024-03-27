import { SourceInteractor } from '../SourceInteractor'
import { wait } from '../../common'
import { PageDirection } from '../PageTurn'
import assert from 'assert'
export class KindleCRInteractor extends SourceInteractor {
  _buildLoadingIndicatorElement(): HTMLElement {
    const loadingElement = document.createElement('div')
    loadingElement.setAttribute('id', 'swiftread-loading')
    loadingElement.style.cssText =
      'display: flex; height: 100%; justify-content: center; align-items: center;'
    const bookURL = chrome.runtime.getURL('images/swiftread-icon-48.png')
    const spinnerURL = chrome.runtime.getURL('images/spinner.svg')
    loadingElement.innerHTML = `
      <div style="border-radius: 5px; z-index: 999; background-color: rgba(235, 235, 235, 0.8); padding: 5px; display: flex; align-items: center;">
          <img style="height: 48px;" src="${bookURL}"/>
          <img style="height: 32px; padding: 0px 5px; filter: invert(76%) sepia(0%) saturate(0%) hue-rotate(182deg) brightness(91%) contrast(89%);" src="${spinnerURL}"/>
      </div>
      `
    return loadingElement
  }

  _getPageTurnButtonPrevious(): HTMLElement {
    let pageTurnArea = this.parser
      .getContentDocument()
      .getElementById('kindleReader_pageTurnAreaLeft')
    if (this.debug)
      console.log('initial page turn previous button:', pageTurnArea)

    if (!pageTurnArea) {
      // otherwise, get the right turn button from a "kr-fullpage-body" container
      // get left page turn area, which is the first chevron container
      pageTurnArea = this.parser
        .getContentDocument()
        .querySelector('.kr-chevron-container-left button')
      if (this.debug)
        console.log('backup page turn previous button:', pageTurnArea)
    }

    assert(pageTurnArea, 'Page turn element for previous page was not found')
    return pageTurnArea
  }

  _getPageTurnButtonNext(): HTMLElement {
    let pageTurnArea = this.parser
      .getContentDocument()
      .getElementById('kindleReader_pageTurnAreaRight')
    if (this.debug)
      if (this.debug)
        // console.log('content document:', this.parser.getContentDocument())
        console.log('initial page turn next button:', pageTurnArea)

    if (!pageTurnArea) {
      // otherwise, get the right turn button from a "kr-fullpage-body" container
      // get left page turn area, which is the first chevron container
      pageTurnArea = this.parser
        .getContentDocument()
        .querySelector('.kr-chevron-container-right button')
      if (this.debug)
        console.log('backup page turn previous button:', pageTurnArea)
    }

    assert(pageTurnArea, 'Page turn element for next page was not found')
    return pageTurnArea
  }

  async click(element: HTMLElement): Promise<void> {
    // Create and dispatch a mousedown event
    var mouseDownEvent = new MouseEvent('mousedown', {
      view: window,
      bubbles: true,
      cancelable: true,
    })
    element.dispatchEvent(mouseDownEvent)

    // Set a short delay before firing the mouseup event
    await wait(117)

    // Create and dispatch a mouseup event
    var mouseUpEvent = new MouseEvent('mouseup', {
      view: window,
      bubbles: true,
      cancelable: true,
    })
    element.dispatchEvent(mouseUpEvent)
  }

  async turnPage(direction: PageDirection): Promise<void> {
    const oldLocationString = this.parser.getLocationString()

    switch (direction) {
      case PageDirection.Next:
        this.click(this._getPageTurnButtonNext())
        break
      case PageDirection.Previous:
        this.click(this._getPageTurnButtonPrevious())
        break
      default:
        throw new Error('Invalid page direction.')
    }

    // wait until the location string changes or timeout is reached
    const maxTimeout = 5000
    const checkInterval = 250
    return new Promise((resolve, reject) => {
      let timeout = 0
      const interval = setInterval(() => {
        if (timeout >= maxTimeout) {
          clearInterval(interval)
          reject('Timeout reached while waiting for page to turn.')
        }
        const newLocationString = this.parser.getLocationString()
        if (newLocationString !== oldLocationString) {
          clearInterval(interval)
          resolve()
        }
        timeout += checkInterval
      }, checkInterval)
    })
  }
}
