export class HTMLSourceListener {
  debug: boolean = false;
  constructor(debug: boolean = false) {
    this.debug = debug;
    this.init();
  }

  private init() {
    window.addEventListener(
      "message",
      async (event) => {
        if (this.debug)
          console.log(
            `Frame content script got event: ${JSON.stringify(event)}`
          );

        switch (event.data.type) {
          case "GET_SOURCE":
            if (this.debug) console.log("------------------------");
            if (this.debug) console.log("got GET_SOURCE message");
            let source = document.documentElement.innerHTML;
            if (this.debug) console.log("source: ", source);

            // if iFrameSrc exists (is iframe), use iFrameSrc domain to reconstruct any relative paths in the iframe's content
            const iFrameSrc = event.data.iFrameSrc;
            // console.log("iFrameSrc: ", iFrameSrc);
            if (iFrameSrc) {
              // get hostname from iFrameSrc
              const iFrameSrcHostname = new URL(iFrameSrc).hostname;
              if (this.debug)
                console.log("iFrameSrcHostname: ", iFrameSrcHostname);

              const relativePathRegex = /(src|href)="\/(.*?)"/g;
              // replace all relative paths in fixedSource with absolute paths
              source = source.replace(
                relativePathRegex,
                `$1="https://${iFrameSrcHostname}/$2"`
              );

              if (this.debug) console.log("fixed source: ", source);
            }

            const frameKey = iFrameSrc ?? "root";

            // send source back to background script
            try {
              chrome.runtime.sendMessage({
                action: "gotPageSource",
                frameKey: frameKey,
                source: source,
              });
            } catch (e) {
              console.warn(
                "Error while sending frame source to SwiftRead, falling back to old extraction logic. Error: " +
                  e
              );
            }

            break;
          default:
            break;
        }
      },
      false
    );
  }
}
