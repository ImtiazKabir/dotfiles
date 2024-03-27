import assert from 'assert'

import { DOMContentParser } from '../DOMContentParser'
import { PageMetadata } from '../../background'

export class KindleCRParser extends DOMContentParser {
  _getPageImgsFromContent(contentElement: HTMLElement): HTMLElement[] {
    let imgs = contentElement.querySelectorAll('img')
    if (this.debug) console.log('Number of content Imgs: ', imgs.length)
    if (imgs.length > 0) {
      let imgClasses = Array.prototype.slice
        .call(imgs)
        .map((img) => img.className)
      if (this.debug) console.log('Content Img classes: ', imgClasses)
    }

    const pageImgs = contentElement.querySelectorAll("[class*='page-img']")
    if (this.debug) {
      console.log('Number of page Imgs: ', pageImgs.length)
      console.log('Page Imgs: ', pageImgs)
    }
    const pageImgElements: HTMLElement[] = Array.from(pageImgs).filter(
      (el): el is HTMLElement => el instanceof HTMLElement
    )
    return pageImgElements
  }

  getContentDocument(): Document {
    let contentDocument: Document
    // it could be an iframe (legacy kindle cloud reader)
    try {
      const contentElement = document.getElementById('KindleReaderIFrame')
      assert(
        contentElement !== null,
        'Unable to find Kindle Cloud Reader iframe'
      )
      if (this.debug === true) console.log('kindleIframe', contentElement)
      const contentIframe = contentElement as HTMLIFrameElement
      assert(
        contentIframe.contentWindow !== null,
        'Kindle Cloud Reader iframe content window is null'
      )
      contentDocument = contentIframe.contentWindow.document
    } catch (err) {
      if (this.debug) {
        console.warn('[legacy]', err)
        console.log('Content document is div')
      }

      contentDocument = document
    }

    return contentDocument
  }

  _getPageImgsFromIframe(): HTMLElement[] {
    let content = this.getContentDocument().getElementById(
      'kindleReader_content'
    )
    if (this.debug === true) {
      console.log('[legacy] Kindle reader content: ', content)
      console.log(
        '[legacy] Content is defined: ',
        typeof content !== 'undefined'
      )
    }
    if (content === null) {
      throw new Error('Content element in Kindle Cloud Reader iFrame is null')
    } else {
      const pageImgs = this._getPageImgsFromContent(content)
      return pageImgs
    }
  }
  getPages(): HTMLElement[] {
    let pageImgs: HTMLElement[] = []
    // try getting page imgs from an iframe document first
    try {
      if (this.debug === true)
        console.log('Trying to get page imgs from iframe')
      pageImgs = this._getPageImgsFromIframe()
    } catch (err) {
      if (this.debug === true) console.warn('[legacy]: ', err)
    }

    // if that doesn't work, try getting page imgs from document
    if (pageImgs.length === 0) {
      try {
        if (this.debug === true)
          console.log('Trying to get page imgs from body')
        pageImgs = this._getPageImgsFromContent(this.getContentDocument().body)
      } catch (err) {
        if (this.debug === true)
          console.warn('Error trying to get page imgs from body: ', err)
      }
    }

    // if still no page imgs, throw error and log it
    // TODO: log this error and rethink error logging (at top level): roll my own solution? with sentry?
    assert(pageImgs.length > 0, 'Unable to find any page imgs')

    // if we get here, we have page imgs
    return pageImgs
  }

  getCurrentlyVisiblePage(pages: HTMLElement[]): HTMLElement {
    const pageImgs = this.getPages()
    // Assume that the first page is the currently visible page
    const currentPage = pageImgs[0]
    if (this.debug === true)
      console.log('Currently visible page: ', currentPage)
    return currentPage
  }

  getCurrentPageContent(): HTMLElement[] {
    const currentPage = this.getCurrentPage()
    // get number of img elements in page img container
    const numImgs = currentPage.querySelectorAll('img').length

    let pageImg: HTMLElement
    // if currrent page img container has at least one img element, then use the first one
    if (numImgs > 0) {
      const img = currentPage.querySelector('img')
      // Technically, this should never happen because we already checked that there is at least one img element
      assert(
        img !== null,
        'Unable to find any img elements in current page (img container)'
      )
      pageImg = img
    }
    // otherwise, check if page img container is an img element itself
    else if (numImgs === 0 && currentPage.tagName === 'IMG') {
      pageImg = currentPage
    } else {
      throw new Error(
        'Unable to find any img elements in current page (img container)'
      )
    }

    if (this.debug) console.log('IMG of page: ', pageImg)
    // check if page img is an HTMLImageElement
    assert(
      pageImg instanceof HTMLImageElement,
      'IMG of page is not an HTMLImageElement and thus cannot be used'
    )

    if (this.debug) {
      if (pageImg instanceof HTMLImageElement)
        console.log('src of IMG of page:', pageImg.src)
    }
    return [pageImg]
  }

  getSelectedText(): void {
    throw new Error('Method not implemented.')
  }

  _getLocationString(): string {
    if (this.debug) console.log('getting location string...')

    const contentDocument = this.getContentDocument()
    let locationMessageElement: HTMLElement | null

    // try getting footer string a kindle iframe
    locationMessageElement = contentDocument.querySelector(
      '#kindleReader_footer_readerControls_middle #kindleReader_footer_message'
    )
    // otherwise, try getting footer string from a div
    if (!locationMessageElement)
      locationMessageElement = contentDocument.querySelector('.footer-title')
    // 1/17/24: Amazon moved footer string to a generic div child
    if (!locationMessageElement) {
      const parentDiv = document.getElementById('main-content')
      if (parentDiv) {
        // Find the child div that contains the location text
        // Generalized regex to match "[Word] X [Word] Y" in various languages
        // \p{L} matches any kind of letter from any language
        var regex = /\p{L}+\s+\d+\s+\p{L}+\s+\d+/u

        // Find the child div that matches the regex
        var childWithText = Array.from(
          parentDiv.getElementsByTagName('div')
        ).find((div) => regex.test(div.textContent ?? ''))

        if (childWithText) {
          locationMessageElement = childWithText
        } else {
          console.warn(
            '[generic div location string]: Unable to find child div with location string'
          )
        }
      } else {
        console.warn(
          '[generic div location string] Unable to find parent div for location string'
        )
      }
    }

    if (this.debug)
      console.log('locationMessageElement: ', locationMessageElement)

    let locationString = ''
    if (locationMessageElement) {
      locationString = locationMessageElement.innerText
    }
    if (this.debug) console.log('locationString: ', locationString)

    return locationString
  }

  getMetadata(): PageMetadata {
    const url = window.location.href
    const domain = window.location.hostname

    const document = this.getContentDocument()
    const titleElement = document.querySelector('.fixed-book-title')
    if (this.debug) console.log('titleElement: ', titleElement)
    const title = titleElement?.textContent ?? undefined
    if (this.debug) console.log('title: ', title)

    const metadata: PageMetadata = {
      url,
      domain,
      title,
    }
    return metadata
  }
}
