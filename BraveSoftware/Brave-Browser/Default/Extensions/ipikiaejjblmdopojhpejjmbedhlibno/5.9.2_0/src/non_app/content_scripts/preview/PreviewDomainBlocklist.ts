interface BlockedDomain {
  domain: string;
  blockedUntil: Date | null; // null means blocked indefinitely
}

export class PreviewDomainBlocklist {
  private blocklist: Map<string, BlockedDomain>;

  constructor() {
    this.blocklist = new Map();
    this.loadBlocklist();
  }

  private loadBlocklist(): void {
    chrome.storage.sync.get("blocklist", (result) => {
      if (result.blocklist) {
        this.blocklist = new Map(
          result.blocklist.map((item: BlockedDomain) => [item.domain, item])
        );
      }
    });
  }

  private saveBlocklist(): void {
    chrome.storage.sync.set(
      { blocklist: Array.from(this.blocklist.values()) },
      () => {
        console.log("Blocklist saved");
      }
    );
  }

  addDomainToBlocklist(domain: string, blockTimeHours: number | null): void {
    let blockedUntil = null;
    if (blockTimeHours !== null) {
      blockedUntil = new Date();
      blockedUntil.setHours(blockedUntil.getHours() + blockTimeHours);
    }
    this.blocklist.set(domain, { domain, blockedUntil });
    this.saveBlocklist();
  }

  isBlocklistedDomain(domain: string): boolean {
    const blockedDomain = this.blocklist.get(domain);
    if (blockedDomain) {
      if (
        blockedDomain.blockedUntil !== null &&
        new Date() > blockedDomain.blockedUntil
      ) {
        this.blocklist.delete(domain);
        this.saveBlocklist();
        return false;
      }
      return true;
    }
    return false;
  }

  getBlocklist(): BlockedDomain[] {
    return Array.from(this.blocklist.values()).filter(
      (item) => item.blockedUntil === null || new Date() <= item.blockedUntil
    );
  }

  clearBlocklist(): void {
    this.blocklist.clear();
    this.saveBlocklist();
  }
}
