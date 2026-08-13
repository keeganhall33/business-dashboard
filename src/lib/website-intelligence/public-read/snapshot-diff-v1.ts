import type { WebsiteSnapshotV1 } from "./contracts";
import { fingerprintPageForDiff } from "./html-extract";

export type WebsiteSnapshotDiffV1 = {
  addedPages: string[];
  removedPages: string[];
  changedPages: string[];
  changedPageCount: number;
};

function byUrl(snapshot: WebsiteSnapshotV1) {
  const m = new Map<string, string>();
  for (const p of snapshot.pages) {
    m.set(
      p.url,
      fingerprintPageForDiff({
        url: p.url,
        finalUrl: p.finalUrl,
        status: p.status,
        title: p.title,
        metaDescription: p.metaDescription,
        canonicalUrl: p.canonicalUrl,
        h1: p.h1,
        internalLinks: p.internalLinks,
        imageRefs: p.imageRefs,
        brokenInternalLinks: p.brokenInternalLinks
      })
    );
  }
  return m;
}

export function diffWebsiteSnapshotV1(prev: WebsiteSnapshotV1, next: WebsiteSnapshotV1): WebsiteSnapshotDiffV1 {
  const a = byUrl(prev);
  const b = byUrl(next);

  const addedPages: string[] = [];
  const removedPages: string[] = [];
  const changedPages: string[] = [];

  for (const url of Array.from(new Set([...a.keys(), ...b.keys()])).sort()) {
    const fa = a.get(url);
    const fb = b.get(url);
    if (!fa && fb) addedPages.push(url);
    else if (fa && !fb) removedPages.push(url);
    else if (fa && fb && fa !== fb) changedPages.push(url);
  }

  return { addedPages, removedPages, changedPages, changedPageCount: changedPages.length };
}

