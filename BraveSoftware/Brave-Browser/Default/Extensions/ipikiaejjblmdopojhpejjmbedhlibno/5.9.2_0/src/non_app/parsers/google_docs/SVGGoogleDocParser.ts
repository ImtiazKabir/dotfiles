import $ from 'jquery'
import { DOMContentParser } from '../DOMContentParser'
import { PageMetadata } from '../../background'

// TODO: add documentation strings for auto-docs
export class SVGGoogleDocParser extends DOMContentParser {
  $pagelessInstructionPopup = this._createPagelessInstructionPopup()

  currentPageMarker?: { matches: (x: any) => boolean } // TODO: what exactly does currentPageMarker do? does it need to be generalized?
  currentPageNumber: number = 1 // TODO: remove this? because we don't need to keep track of page number

  constructor(debug: boolean = false) {
    super(debug)

    const svgItems = $('.kix-canvas-tile-content > svg')
    if (this.debug) console.log('Number of svg items', svgItems.length)
    if (svgItems.length == 0) {
      throw new Error(
        'Unable to initialize SVG Google Doc parser: no svg items found'
      )
    }
  }

  protected _getLocationString(): string {
    console.warn('getLocationString not implemented for SVGGoogleDocParser')
    return ''
  }

  private _createPagelessInstructionPopup() {
    const $anchor = $('#docs-file-menu')
    const anchorOffset = $anchor.offset()
    const anchorDimension = {
      width: $anchor.outerWidth(),
      height: $anchor.outerHeight(),
    }
    if (anchorOffset && anchorDimension.width && anchorDimension.height) {
      const $popup = $('<div>')
        .appendTo(document.body)
        .css({
          position: 'absolute',
          left: anchorOffset.left + anchorDimension.width / 2 - 300,
          top: anchorOffset.top + anchorDimension.height,
          width: 600,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 999000,
          fontSize: 'larger',
        })
      $('<div>').appendTo($popup).css({
        width: 0,
        height: 0,
        borderLeft: '.5em solid transparent',
        borderRight: '.5em solid transparent',
        borderBottom: '.5em solid #333',
      })
      $('<div>')
        .appendTo($popup)
        .html(
          "SwiftRead doesn't work in 'Pageless' mode. Please go to Page Setup and change to 'Pages' mode and try again."
        )
        .css({
          marginLeft:
            10 -
            Math.min(0, anchorOffset.left + anchorDimension.width / 2 - 300),
          backgroundColor: '#333',
          color: '#fff',
          padding: '1em',
          borderRadius: '.5em',
        })
      return $popup.hide()
    } else {
      throw new Error('Could not create pageless instruction popup')
    }
  }

  getContentDocument(): Document {
    return document
  }

  getCurrentlyVisiblePage(pages: HTMLElement[]) {
    const currentWindowHeight = $(window).height()
    if (currentWindowHeight) {
      const halfHeight = currentWindowHeight / 2
      for (var i = pages.length - 1; i >= 0; i--)
        if (pages[i].getBoundingClientRect().top < halfHeight) return pages[i]
    }
    throw new Error("Can't get the currently visible page")
  }

  getPages(): HTMLElement[] {
    if (!$('.kix-page-paginated').length) {
      this.$pagelessInstructionPopup.show()
      $(document.body).one('click', () => this.$pagelessInstructionPopup.hide())
      throw new Error("Cannot use SwiftRead on Google Docs in 'Pageless' mode")
    }
    return $('.kix-page-paginated')
      .get()
      .map((page) => ({ page: page, top: page.getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top)
      .map((item) => item.page)
  }

  getCurrentPageContent(): HTMLElement[] {
    const currentPage = this.getCurrentPage()
    return $('svg > g', currentPage).get()
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

  // TODO: fix this implementation to get mouse selected text
  getSelectedText() {
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right &&
      a.right > b.left &&
      a.top < b.bottom &&
      a.bottom > b.top
    const page = this.getCurrentlyVisiblePage(this.getPages())
    const selectionRects = $('.kix-canvas-tile-selection > svg > rect', page)
      .get()
      .map((el) => el.getBoundingClientRect())
    // TODO: do we need to de-dupe?
    return (
      $('svg > g[role=paragraph] > rect', page)
        .get()
        .map((el) => ({ el: el, rect: el.getBoundingClientRect() }))
        .filter((item) =>
          selectionRects.some((rect) => overlaps(item.rect, rect))
        )
        .map((item) => item.el.getAttribute('aria-label'))
        // .filter(makeDeduper())
        .join(' ')
    )
  }

  // TODO: keep these functions as reference
  // private _markPage(page: HTMLElement) {
  //   const top = page.style.top;
  //   return {
  //     matches: (x: HTMLElement) => x.style.top == top,
  //   };
  // }

  // private _outOfBounds(index: number, arr: HTMLElement[]) {
  //   return index < 0 || index >= arr.length;
  // }

  // getCurrentIndex() {
  //   this.currentPageMarker = this._markPage(
  //     this.getCurrentlyVisiblePage(this.getPages())
  //   );
  //   const pages = this.getPages();
  //   return pages.findIndex(this.currentPageMarker.matches);
  // }

  // async getPageContent(
  //   nextPageNumber: number,
  //   quietly: boolean
  // ): Promise<Element[][]> {
  //   var pages = this.getPages();
  //   var head = 0,
  //     tail = pages.length - 1;

  //   // find index of current page and next page
  //   if (!this.currentPageMarker) {
  //     throw new Error("Current page marker not set");
  //   }
  //   const currentIndex = pages.findIndex(this.currentPageMarker.matches);
  //   if (this.debug) console.log("current index", currentIndex);
  //   if (currentIndex == -1) throw new Error("Current page not found");
  //   var nextIndex = currentIndex + (nextPageNumber - this.currentPageNumber);

  //   // if the next page is not loaded and is an earlier page
  //   if (nextIndex < head) {
  //     pages[head].scrollIntoView();
  //     await waitMillis(500);
  //     nextIndex -= head;
  //     const headMarker = this._markPage(pages[head]);
  //     pages = this.getPages();
  //     nextIndex += pages.findIndex(headMarker.matches);
  //     if (this._outOfBounds(nextIndex, pages))
  //       throw new Error("Next page index of bounds");
  //   }

  //   // if the next page is not loaded and is a later page
  //   if (nextIndex > tail) {
  //     pages[tail].scrollIntoView(false);
  //     await waitMillis(500);
  //     nextIndex -= tail;
  //     const tailMarker = this._markPage(pages[tail]);
  //     pages = this.getPages();
  //     nextIndex += pages.findIndex(tailMarker.matches);
  //     if (this._outOfBounds(nextIndex, pages))
  //       throw new Error("Next page index of bounds");
  //   }

  //   // TODO: break up this function in to function to scroll to next page, function to get content on current page
  //   // set next page as current
  //   const currentPage = pages[nextIndex];
  //   this.currentPageMarker = this._markPage(currentPage);
  //   this.currentPageNumber = nextPageNumber;

  //   // scroll into view and return text
  //   if (!quietly) currentPage.scrollIntoView();

  //   // TODO: do we need to de-dupe? old code had .filter(this._makeDeduper())
  //   return $("svg > g", currentPage)
  //     .get()
  //     .map((para) => {
  //       return $(para).children("rect").get() as Element[];
  //     });
  // }
}
