import assert from 'assert'

import {
  ContentProcessor,
  ContentProcessorResponse,
  assertJsonIsContentProcessorResponse as assertIsContentProcessorResponse,
} from '../ContentProcessor'

import { getUserLicense } from '../../common'
import { SERVER_API_URL } from '../../constants'

export class KindleCRProcessor extends ContentProcessor {
  async process(
    contentElements: HTMLElement[]
  ): Promise<ContentProcessorResponse> {
    assert(
      typeof contentElements[0] !== 'undefined',
      'No page image to process'
    )
    const pageImg = contentElements[0] as HTMLImageElement
    if (this.debug) console.log('Processing pageImg: ', pageImg)

    let pageImgHeight = pageImg.getBoundingClientRect().height
    let pageImgWidth = pageImg.getBoundingClientRect().width
    if (this.debug) console.log('pageImgHeight: ', pageImgHeight)
    if (this.debug) console.log('pageImgWidth: ', pageImgWidth)

    let canvas = document.createElement('canvas')
    let context = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    if (context == null) throw new Error('Unable to get canvas context')
    context.drawImage(
      pageImg as CanvasImageSource,
      0,
      0,
      pageImgWidth,
      pageImgHeight
    )

    try {
      // first turn canvas into blob
      let blob = await this._canvasToBlob(canvas)
      let file = new File([blob], `${pageImg.src ?? 'temp'}.png`, {
        type: 'image/png',
      })

      // construct form data to upload image and other data to server
      const formData = new FormData()
      formData.append('image', file)
      const licenseKey = await getUserLicense()
      formData.append('licenseKey', licenseKey)

      try {
        const response = await fetch(`${SERVER_API_URL}extract-from-image`, {
          method: 'POST',
          body: formData,
        })
        const jsonResponse = await response.json()
        if (response.status !== 200) {
          console.error(jsonResponse)
          throw Error(jsonResponse.error ?? JSON.stringify(jsonResponse))
        } else {
          // success
          if (this.debug) console.log(jsonResponse)
          assertIsContentProcessorResponse(jsonResponse)
          return {
            collection: jsonResponse.collection,
            id: jsonResponse.id,
            field: jsonResponse.field,
          } as ContentProcessorResponse
        }
      } catch (error) {
        console.error('Unable to upload page image for processing: ', error)
        throw error
      }
    } catch (error) {
      console.error('Unable to convert image canvas to form: ', error)
      throw error
    }
  }

  private _canvasToBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject('Unable to convert canvas to blob')
        }
      })
    })
  }
}
