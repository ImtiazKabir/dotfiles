import $ from 'jquery'
import tippy from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import '@fortawesome/fontawesome-free/css/all.min.css'

import { ContentBuilder } from '../../content_builders/ContentBuilder'
import { getDomain } from '../../common'
import { PreviewDomainBlocklist } from './PreviewDomainBlocklist'

export enum ContentPreviewType {
  ChatGPT = 'chat-gpt',
}

// TODO: eventually refactor to abide by SOLID better: https://chat.openai.com/share/b54801df-5875-4059-85b5-8e5ae59542c7
export abstract class ContentPreview {
  builder: ContentBuilder
  previewType: ContentPreviewType
  debug: boolean

  currentPageContent?: string
  contentCheckInterval?: ReturnType<typeof setInterval>

  constructor(
    builder: ContentBuilder,
    previewType: ContentPreviewType,
    options?: {
      debug?: boolean
    }
  ) {
    this.builder = builder
    this.previewType = previewType
    this.debug = options?.debug ?? false
  }

  async init() {
    await this.addPreviewButton()
    this.startContentCheck()
  }

  protected getReadingTimeMinutes(currentPage: HTMLElement): number {
    const textContent = currentPage.innerText // Get only text content, ignore HTML tags
    const words = textContent.split(/\s+/).length // Split by whitespace to get number of words
    const readingSpeed = 250 // Average reading speed in words per minute
    const readingTime = Math.ceil(words / readingSpeed)
    return readingTime
  }

  protected async getPreviewButtonText(): Promise<string> {
    const currentPage = this.builder.parser.getCurrentPage()
    const readingTimeMinutes = this.getReadingTimeMinutes(currentPage)
    return `${readingTimeMinutes} min read`
  }

  private getPreviewButton(): HTMLElement {
    const previewButton = document.createElement('div')
    previewButton.id = 'sr-preview-button'

    // Logo image
    const img = document.createElement('img')
    img.id = 'sr-preview-logo'
    img.src = chrome.runtime.getURL('images/swiftread-icon-48.png')
    previewButton.appendChild(img)

    // Create a spinner
    const spinner = document.createElement('img')
    spinner.id = 'sr-preview-spinner'
    spinner.src = chrome.runtime.getURL('images/spinner.svg')
    previewButton.appendChild(spinner)

    // Create a close button
    const closeButton = document.createElement('span')
    closeButton.id = 'sr-preview-close-button'
    closeButton.innerHTML = `<i class="fa-solid fa-xmark"></i>`
    // closeButton.innerHTML = `<img src="${chrome.runtime.getURL(
    //   "images/close.svg"
    // )}" />`;
    previewButton.appendChild(closeButton)

    // Create a container to hold the result and additional string
    const resultContainer = document.createElement('div')
    resultContainer.id = 'sr-preview-result-container'
    previewButton.appendChild(resultContainer)

    // Create a span to hold the result of the async task
    const resultSpan = document.createElement('span')
    resultSpan.id = 'sr-preview-result'
    resultContainer.appendChild(resultSpan)

    // Create a span to hold the fixed string
    const fixedSpan = document.createElement('span')
    fixedSpan.id = 'sr-preview-fixed'
    fixedSpan.innerText = 'to speed read'
    resultContainer.appendChild(fixedSpan)

    // Adding styles with CSS
    const css = `
    .tippy-template .flex {
      display: flex;
    }
    .tippy-template .flex-column {
      flex-direction: column;
    }
    .tippy-template .align-center {
      align-items: center;
    }
    .tippy-template .w-100 {
      width: 100%;
    }
    .tippy-template .my-2 {
      margin-top: 5px;
      margin-bottom: 5px;
    }
    .tippy-template p {
      margin-bottom: 10px;
    }
    .tippy-template .btn {
      border: 1px solid rgba(86,88,105,1);
      transition: all 0.1s ease-in-out;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }
    .tippy-template .btn:hover {
      background-color: #101512;
    }


    #sr-preview-button {
        position: relative;
        display: flex;
        flex-direction: row;
        gap: 5px;
        align-items: center;
        justify-content: center;
        background-color: #222C26;
        color: white;
        padding: 5px;
        border: 1px solid rgba(86,88,105,1);
        border-radius: 5px;
        cursor: pointer;
        font-family: sans-serif;
        transition: all 0.1s ease-in-out;
        transform: scale(1);
    }
    #sr-preview-button:hover {
        transform: scale(1.01);
        background-color: #101512;
    }
    #sr-preview-button:active {
        transform: scale(0.99);
    }
    
    #sr-preview-logo {
      width: 24px;
    }
    #sr-preview-spinner {
      width: 16px;
    }
    #sr-preview-result-container {
      display: none;
      flex-direction: row;
      gap: 5px;
      align-items: baseline;
    }
    #sr-preview-result {
      display: initial;
      font-size: 14px;
      font-weight: medium;
    }
    #sr-preview-fixed {
      font-size: 10px;
      color: #999;
      font-weight: bold;
    }

    #sr-preview-close-button {
        font-size: 10px;
        opacity: 0;
        display: inline;
        position: absolute;
        top: 0;
        right: 0;
        padding: 2px;
        cursor: pointer;
        transition: opacity 0.2s ease-in-out;
    }
    #sr-preview-close-button img {
      width: 8px;
    }
    #sr-preview-close-button i {
      width: 8px;
    }    
    #sr-preview-button:hover #sr-preview-close-button {
        opacity: 1;
    }
    `
    const head = document.head || document.getElementsByTagName('head')[0]
    const style = document.createElement('style')

    style.appendChild(document.createTextNode(css))
    head.appendChild(style)

    // Click listeners
    // Create template content for tippy
    const closePreviewContent = document.createElement('div')
    closePreviewContent.classList.add('tippy-template')
    closePreviewContent.innerHTML = `
    
    <p>Hide button from all pages on ${getDomain()}?</p>
    <div class="flex align-center flex-column">
      <button data-type="snooze" class="btn w-100 my-2">Snooze 1 Day</button>
      <button data-type="permanently" class="btn w-100 my-2">Permanently (on this site)</button>
    </div>
`
    document.body.appendChild(closePreviewContent)

    // Attach click event listeners to buttons in the template content
    const closePreviewButtons = closePreviewContent.querySelectorAll('.btn')
    closePreviewButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        const target = event.target as HTMLElement
        const blocklist = new PreviewDomainBlocklist()
        const domain = getDomain()
        const type = target.dataset.type
        if (type === 'snooze') {
          blocklist.addDomainToBlocklist(domain, 24)
        } else if (type === 'permanently') {
          blocklist.addDomainToBlocklist(domain, null)
        }
        if (this.debug)
          console.log('Current blocklist: ', blocklist.getBlocklist())
        this.destroy()
      })
    })

    // Initialize tippy instance
    const closePreviewTippy = tippy(closeButton, {
      content: closePreviewContent,
      interactive: true, // Keeps the tippy open when user hovers over or clicks on it
      hideOnClick: true, // Hides the tippy when the user clicks outside of it
      trigger: 'manual', // You'll manually control when the tippy shows or hides
      animation: 'fade',
    })

    // Add click event listener to the close button
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation() // prevent triggering click event of parent elements
      if (this.debug) console.log('Close button clicked')

      // Show the tippy when the close button is clicked
      closePreviewTippy.show()
    })

    // Add click event listener to the preview button itself
    previewButton.addEventListener('click', (event) => {
      this.onPreviewButtonClick(event)
    })

    return previewButton
  }

  protected applyStylesToPreviewButton(
    previewButton: HTMLElement,
    elementToAppendTo: HTMLElement
  ) {
    if (this.debug)
      console.log('Default applying absolute positioning to preview button')
    // Give preview button absolute positioning so that it appears on top of the element
    // it's appended to.
    previewButton.style.position = 'absolute'
    previewButton.style.zIndex = '1000'
    // By default, position the preview button in the bottom right hand corner with some padding
    // from the edge of the element it's appended to.
    previewButton.style.bottom = '10px'
    previewButton.style.right = '10px'
  }

  protected abstract elementToAppendTo(): HTMLElement | undefined
  protected async getElementToAppendTo(): Promise<HTMLElement> {
    if (this.debug) console.log('Getting element to append to...')
    const currentPageExists = await this.waitForContentLoad(1)

    // If content exists, return the element to append to
    if (currentPageExists) {
      const parent = this.elementToAppendTo()
      if (parent) return parent
    }

    if (this.debug) console.log('Returning body as fallback')
    return document.body
  }

  protected async waitForContentLoad(seconds: number): Promise<boolean> {
    if (this.debug) console.log('Waiting a bit for current page to load...')
    const retries = seconds * 2
    for (let i = 0; i < retries; i++) {
      try {
        this.builder.parser.getCurrentPage()
        if (this.debug) console.log('Current page exists')
        return true
      } catch (error) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    if (this.debug) console.log("Current page doesn't exist yet")
    return false
  }

  private async addPreviewButton() {
    if (this.debug) console.log('Adding preview button...')
    // First, prepare the preview button and get the element to append it to
    const elementToAppendTo = await this.getElementToAppendTo()
    if (this.debug) {
      console.log('elementToAppendTo', elementToAppendTo)
    }

    const previewButton = this.getPreviewButton()
    if (this.debug) {
      console.log('previewButton', previewButton)
    }
    this.applyStylesToPreviewButton(previewButton, elementToAppendTo)

    // If the preview button is already there, don't add it again.
    if (elementToAppendTo.contains(previewButton)) {
      return
    }

    // Add the preview button to the document
    elementToAppendTo.appendChild(previewButton)

    // Start the task to get the preview button text
    const previewButtonText = await this.getPreviewButtonText()
    // When the task completes, fade out the spinner and fade in the result
    $('#sr-preview-spinner').fadeOut(200, function () {
      $('#sr-preview-result').text(previewButtonText)
      $('#sr-preview-result-container').fadeIn(200, function () {
        $(this).css('display', 'flex')
      })
    })

    // Store the current page content
    try {
      const currentPage = this.builder.parser.getCurrentPage()
      this.currentPageContent = currentPage.innerText
    } catch (error) {
      // If no current page is found yet
      if (this.debug) console.warn(error)
      this.currentPageContent = ''
    }
  }

  private startContentCheck() {
    if (this.debug) console.log('Starting content check...')
    this.contentCheckInterval = setInterval(async () => {
      let newPageContent: string
      try {
        const currentPage = this.builder.parser.getCurrentPage()
        newPageContent = currentPage.innerText
      } catch (error) {
        // If the current page is not found yet
        if (this.debug) console.warn(error)
        newPageContent = ''
      }

      if (newPageContent !== this.currentPageContent) {
        this.currentPageContent = newPageContent
        if (this.debug) console.log('Page content changed')

        // Check if the preview button is still on the document
        // If not, add it again
        if (!document.contains(document.getElementById('sr-preview-button'))) {
          if (this.debug)
            console.log('Preview button no longer on document, adding new one')
          await this.addPreviewButton()
          // Check if the element to append stil lhas the preview button as a child
          // If not, add it again
        } else if (
          !this.elementToAppendTo()?.contains(
            document.getElementById('sr-preview-button')
          )
        ) {
          if (this.debug)
            console.log(
              'Preview button no longer a child of element to append to, adding new one'
            )
          this.removePreviewButton()
          await this.addPreviewButton()
        } else {
          // Otherwise, preview button is still on the document and the element to append to
          console.log('Refreshing preview button text')
          // TODO: abstract following out into a PreviewButton class
          const previewButtonText = await this.getPreviewButtonText()
          $('#sr-preview-result').animate({ opacity: 0 }, 200, function () {
            $(this).text(previewButtonText).animate({ opacity: 1 }, 200)
          })
        }
      }
    }, 1000) // Check every second
  }

  private async onPreviewButtonClick(event: MouseEvent): Promise<void> {
    const targetElement = event.target as HTMLElement

    // Check if the close button is clicked
    if (
      targetElement.id === 'sr-preview-close-button' ||
      targetElement.parentElement?.id === 'sr-preview-close-button'
    ) {
      // If so, do nothing or do some other action
      return
    }

    this.builder.build()
  }

  private removePreviewButton() {
    const previewButton = document.getElementById('sr-preview-button')
    if (previewButton) {
      previewButton.remove()
    }
  }

  private stopContentCheck() {
    if (this.contentCheckInterval) {
      clearInterval(this.contentCheckInterval)
      this.contentCheckInterval = undefined
    }
  }

  // Add a method to stop the interval when needed (for example when the component is destroyed)
  destroy() {
    this.stopContentCheck()
    this.removePreviewButton()
  }
}
