import assert from 'assert'
import { DOMContentParser } from '../DOMContentParser'
import { PageMetadata } from '../../background'

export class ChatGPTParser extends DOMContentParser {
  getContentDocument(): Document {
    return document
  }

  protected getPages(): HTMLElement[] {
    const contentDocument = this.getContentDocument()
    if (this.debug) console.log('Content document: ', contentDocument)
    const pages = contentDocument.body.querySelectorAll(
      '.markdown.prose.w-full'
    )
    const pageElements: HTMLElement[] = Array.from(pages).map(
      (el) => el as HTMLElement
    )
    assert(pageElements.length > 0, 'No pages were found')
    if (this.debug) console.log('Pages: ', pageElements)
    return pageElements
  }

  protected getCurrentlyVisiblePage(pages: HTMLElement[]): HTMLElement {
    const contentDocument = this.getContentDocument()
    const contentRect = contentDocument.body.getBoundingClientRect()

    // for each page, calculate the visible value of that page that is within the content document bounds
    const visibleValues = pages.map((page) => {
      // Bounding rectangle of the page
      let pageRect = page.getBoundingClientRect()

      // Calculate the visible height
      let visibleHeight =
        Math.min(contentRect.bottom, pageRect.bottom) -
        Math.max(contentRect.top, pageRect.top)

      // If the element is in the viewport (visible)
      // Return the *percentage* of the element that is visible
      if (visibleHeight > 0) {
        return (visibleHeight / pageRect.height) * 100
      } else {
        // If not visible, return 0
        return 0
      }
    })

    if (this.debug) console.log('Visible values: ', visibleValues)

    // return the page with the highest visible value
    const maxVisibleValue = Math.max(...visibleValues)
    if (this.debug) console.log('Max visible value: ', maxVisibleValue)
    const maxVisibleValueIndex = visibleValues.indexOf(maxVisibleValue)
    if (this.debug)
      console.log('Max visible value index: ', maxVisibleValueIndex)
    const maxVisiblePage = pages[maxVisibleValueIndex]
    assert(maxVisiblePage, 'Max visible page was not found')
    if (this.debug) console.log('Max visible page: ', maxVisiblePage)
    return maxVisiblePage
  }

  getCurrentPageContent(): HTMLElement[] {
    const currentPage = this.getCurrentPage()
    const contentCollection = currentPage.children
    const contentElements: HTMLElement[] = Array.from(contentCollection).map(
      (el) => el as HTMLElement
    )
    if (this.debug) console.log('Content elements: ', contentElements)
    return contentElements
  }

  getMetadata(): PageMetadata {
    const url = window.location.href
    const domain = window.location.hostname
    const title = document.title

    const metadata: PageMetadata = {
      url,
      domain,
      title,
    }
    return metadata
  }

  getSelectedText(): void {
    throw new Error('Method not implemented.')
  }

  protected _getLocationString(): string {
    if (this.debug) console.log('getting location string...')
    const pages = this.getPages()
    const currentPage = this.getCurrentPage()
    // get index of current page
    const currentPageIndex = pages.indexOf(currentPage)
    const currentPageNumber = currentPageIndex + 1
    if (this.debug)
      console.log(
        `Current page number: ${currentPageNumber} of ${pages.length}`
      )
    return `GPT response ${currentPageNumber} of ${pages.length}`
  }
}
