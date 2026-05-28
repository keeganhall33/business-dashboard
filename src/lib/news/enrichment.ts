import crypto from "node:crypto";
import type { ScoredItem } from "@/lib/news/scoring";

export type Enrichment = {
  whyNow: string;
  collabConcept: string;
  contactName: string | null;
  contactEmail: string | null;
  contactEmailSource: "extracted" | "inferred" | "inferred_person";
};

function hashSeed(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function pick<T>(arr: T[], seedHex: string, offset = 0): T {
  const slice = seedHex.slice(offset, offset + 8);
  const n = Number.parseInt(slice, 16);
  return arr[n % arr.length];
}

function stripHtml(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractEmail(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? null;
}

function inferredPressEmailFromHost(hostname: string) {
  const host = hostname.replace(/^www\./, "");
  // Most publishers route media inquiries to press@.
  // When it feels too generic, we still prefer press@ over random personal guesses.
  return `press@${host}`;
}

function inferSourceSpecificEmail(url: string): string | null {
  const host = new URL(url).hostname.replace(/^www\./, "");

  const mapped: Record<string, string> = {
    "boardroom.tv": "partnerships@boardroom.tv",
    "frontofficesports.com": "info@frontofficesports.com",
    "variety.com": "tips@variety.com",
    "billboard.com": "tips@billboard.com",
    "hypebeast.com": "info@hypebeast.com",
    "hypeart.com": "info@hypeart.com",
    "highsnobiety.com": "info@highsnobiety.com",
    "axios.com": "tips@axios.com",
    "sportsbusinessjournal.com": "help@sportsbusinessjournal.com",
    "news.artnet.com": "info@artnet.com",
    "artnet.com": "info@artnet.com",
    "puck.news": "tips@puck.news"
  };

  return mapped[host] ?? mapped[host.replace(/^news\./, "")] ?? null;
}

type NameParts = { full: string; first: string; last: string };

const PERSON_STOPWORDS = new Set([
  "Limited",
  "Edition",
  "Collection",
  "Capsule",
  "Collab",
  "Collaboration",
  "Drop",
  "Series",
  "Built",
  "Take",
  "Talk",
  "Launch",
  "Launches",
  "Arrives",
  "Reunite",
  "Reunites",
  "Experience",
  "Watch",
  "Tour",
  "Festival",
  "Records",
  "Edition",
  "Drive"
]);

const BRAND_DOMAIN_OVERRIDES: Record<string, string> = {
  "filling pieces": "fillingpieces.com",
  "just eat": "just-eat.com",
  "denza": "denza.com",
  "chopard": "chopard.com",
  "ann demeulemeester": "anndemeulemeester.com",
  "h. lorenzo": "hlorenzo.com",
  "j.crew": "jcrew.com",
  "timex": "timex.com",
  "hypebeast": "hypebeast.com",
  "hypeart": "hypeart.com",
  "byd": "byd.com",
  "devialet": "devialet.com",
  "hypedrive": "hypebeast.com",
  "taikoo li": "swireproperties.com",
  "just-eat": "just-eat.com",
  "fillingpieces": "fillingpieces.com"
};

function normalizeToken(token: string) {
  return token.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function extractPersonNames(text: string): NameParts[] {
  const matches = text.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)+)\b/g);
  if (!matches) return [];
  const seen = new Set<string>();
  const names: NameParts[] = [];
  for (const full of matches) {
    if (!full) continue;
    const parts = full.trim().split(/\s+/);
    if (parts.length < 2) continue;
    if (parts.some((part) => PERSON_STOPWORDS.has(part))) continue;
    const first = parts[0];
    const last = parts[parts.length - 1];
    const key = full.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push({ full, first, last });
  }
  return names;
}

function inferBrandDomain(item: ScoredItem, names: NameParts[]): string | null {
  const text = `${item.title} ${stripHtml(item.summary ?? "")}`.toLowerCase();
  for (const [needle, domain] of Object.entries(BRAND_DOMAIN_OVERRIDES)) {
    if (text.includes(needle)) return domain;
  }

  try {
    const summaryDomains = stripHtml(item.summary ?? "").match(/\b([a-z0-9-]+\.[a-z0-9.-]+)\b/gi);
    if (summaryDomains) {
      const articleHost = new URL(item.url).hostname.replace(/^www\./, "");
      const domain = summaryDomains.find((d) => !d.includes(articleHost));
      if (domain) return domain.toLowerCase();
    }
  } catch {
    // ignore
  }

  try {
    const url = new URL(item.url);
    const slug = url.pathname.split("/").filter(Boolean).pop() ?? "";
    const tokens = slug.split("-").filter(Boolean);
    if (tokens.length) {
      const nameTokens = new Set(
        names.flatMap((name) => name.full.toLowerCase().split(/\s+/).map((part) => part.replace(/[^a-z0-9]/g, "")))
      );
      const filtered = tokens.filter((token) => !nameTokens.has(token.toLowerCase()));
      if (filtered.length) {
        const candidate = filtered.slice(-2).join("");
        if (candidate) {
          return `${candidate.replace(/[^a-z0-9]/g, "")}.com`;
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

function inferPersonContact(item: ScoredItem, names: NameParts[], domain: string | null) {
  if (!domain) return null;
  for (const name of names) {
    const first = normalizeToken(name.first);
    const last = normalizeToken(name.last);
    if (!first || !last) continue;
    const email = `${first}.${last}@${domain}`;
    return { contactName: name.full, contactEmail: email }; // first viable name
  }
  return null;
}

function classifyVertical(item: { title: string; summary?: string | null }) {
  const text = `${item.title}\n${item.summary ?? ""}`.toLowerCase();
  if (/(nba|wnba|nfl|mlb|nhl|athlete|player|team|league|sports)/.test(text)) return "sports";
  if (/(album|tour|festival|single|label|music)/.test(text)) return "music";
  if (/(film|tv|series|documentary|streaming|hollywood)/.test(text)) return "film_tv";
  if (/(fashion|sneaker|streetwear|luxury|runway)/.test(text)) return "fashion";
  if (/(art|gallery|auction|collector|museum)/.test(text)) return "art";
  if (/(ai|tech|platform|app|streaming)/.test(text)) return "tech";
  return "business";
}

function buildWhyNow(item: ScoredItem, seed: string): string {
  const frames = [
    "This is a momentum moment: the story is already drawing attention, so a partnership announcement can ride the existing wave instead of trying to create one.",
    "The timing is favorable because the headline signals an active deal/launch cycle—brands and talent are making decisions right now.",
    "This is actionable now because it sits at the intersection of audience + distribution; a collab can convert interest into measurable sign-ups, merch, or ticket demand.",
    "The story indicates a fresh narrative shift. That’s when partners get outsized credit for being ‘early’, even if execution is fast-follow."
  ];

  const recencyNote = item.publishedAt
    ? (() => {
        const hours = Math.round((Date.now() - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60));
        if (!Number.isFinite(hours)) return null;
        if (hours <= 6) return "It broke within hours, which is ideal for fast outreach.";
        if (hours <= 24) return "It’s fresh (last 24 hours), which keeps inbox response rates higher.";
        return null;
      })()
    : null;

  const base = pick(frames, seed, 0);
  return recencyNote ? `${base} ${recencyNote}` : base;
}

function buildCollabConcept(item: ScoredItem, seed: string): string {
  const vertical = classifyVertical(item);

  function artDriven(frame: string) {
    return (
      frame +
      " Core execution: center Keegan Hall’s fine-art portraiture/illustrations as the hero asset (limited prints, live creation, or digital drop) so the partner leads with art-first storytelling."
    );
  }

  const sportsFrames = [
    artDriven("Launch a ‘locker room to gallery’ moment: create bespoke portraits of the featured athletes/executives, unveil them at a sponsor-backed salon, and bundle prints with an experiential offer."),
    artDriven("Produce a traveling ‘game stories’ exhibit: large-scale drawings capturing the headline moments, with merch/auction routes benefiting the featured brand or team."),
    artDriven("Design a limited art print + collectible ticket pack tied to the partnership, with QR unlocks for behind-the-scenes footage and meetups.")
  ];

  const musicFrames = [
    artDriven("Stage a listening + live-illustration session: Keegan paints the featured artist or deal narrative in real time while fans enjoy an intimate set."),
    artDriven("Release a vinyl/print bundle where the sleeve art is a Hall original, bundled with a brand-sponsored story about the collaboration."),
    artDriven("Create a ‘studio residency’ drop: Keegan documents the artist’s key collaborators, with each portrait paired to exclusive content unlocks.")
  ];

  const filmTvFrames = [
    artDriven("Build a premiere wall of Hall originals depicting key characters/scenes, then auction limited prints to fund the next activation."),
    artDriven("Offer a collector’s edition poster illustrated by Keegan, bundled with premium screening access and partner hospitality."),
    artDriven("Create a live storyboard activation: Keegan sketches pivotal scenes during a partner-hosted panel, then fans buy numbered prints.")
  ];

  const fashionFrames = [
    artDriven("Design a capsule featuring Keegan’s hand-drawn portraiture as all-over prints or embroidery patches, tied to a premium launch event."),
    artDriven("Host a gallery-meets-runway experience where each look is paired with an original illustration of the collaborator, sold as NFTs/prints."),
    artDriven("Create custom packaging/labels illustrated by Keegan for a limited drop, with purchasers getting signed mini-prints.")
  ];

  const artFrames = [
    artDriven("Co-curate a pop-up gallery with Keegan’s works inspired by the story, with brand integration woven into the narrative plaques."),
    artDriven("Offer a limited edition of Keegan prints + AR experience that places the art into the buyer’s space, sponsored by the featured partner."),
    artDriven("Design a philanthropic print drop where Keegan’s art honors the subjects and drives donations to a cause aligned with the headline.")
  ];

  const businessFrames = [
    artDriven("Deliver a ‘deal dossier’ kit: Hall portraits of the key executives/team plus a partner-branded strategy note for VIP gifting."),
    artDriven("Create a boardroom installation: sequential pieces depicting the origin-to-announcement journey, unveiled at a press briefing."),
    artDriven("Bundle a limited print series with a private fireside chat where Keegan reveals the making-of the art alongside the partner’s leaders.")
  ];

  const framesByVertical: Record<string, string[]> = {
    sports: sportsFrames,
    music: musicFrames,
    film_tv: filmTvFrames,
    fashion: fashionFrames,
    art: artFrames,
    tech: businessFrames,
    business: businessFrames
  };

  const frame = pick(framesByVertical[vertical] ?? businessFrames, seed, 8);
  const hook = pick(
    [
      "Key angle: make Keegan’s art the hero asset at every touchpoint (print, merch, stage visuals).",
      "Key angle: pair each art release with a clear conversion moment (preorder, RSVP, charitable auction).",
      "Key angle: capture behind-the-scenes footage of Keegan creating the piece to fuel content + press.",
      "Key angle: let buyers customize elements of the art (hand-signed inscriptions, colorways) to increase demand."
    ],
    seed,
    16
  );

  return `${frame} ${hook}`;
}

export function enrichItem(item: ScoredItem): Enrichment {
  const seed = hashSeed(`${item.url}|${item.title}`);
  const plainSummary = stripHtml(item.summary ?? "");
  const names = extractPersonNames(`${item.title} ${plainSummary}`);
  const brandDomain = inferBrandDomain(item, names);

  const extracted = extractEmail(item.summary);
  if (extracted) {
    return {
      whyNow: buildWhyNow(item, seed),
      collabConcept: buildCollabConcept(item, seed),
      contactName: names[0]?.full ?? null,
      contactEmail: extracted,
      contactEmailSource: "extracted"
    };
  }

  const personContact = inferPersonContact(item, names, brandDomain);
  if (personContact) {
    return {
      whyNow: buildWhyNow(item, seed),
      collabConcept: buildCollabConcept(item, seed),
      contactName: personContact.contactName,
      contactEmail: personContact.contactEmail,
      contactEmailSource: "inferred_person"
    };
  }

  const sourceSpecific = inferSourceSpecificEmail(item.url);
  const inferred = sourceSpecific ?? inferredPressEmailFromHost(new URL(item.url).hostname);

  return {
    whyNow: buildWhyNow(item, seed),
    collabConcept: buildCollabConcept(item, seed),
    contactName: null,
    contactEmail: inferred,
    contactEmailSource: "inferred"
  };
}
