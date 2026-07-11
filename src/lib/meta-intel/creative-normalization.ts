import crypto from "node:crypto";
import type { NormalizedCreative } from "./types.ts";

const CDN_HOST_PATTERNS = [
  /\.fbcdn\.net$/i,
  /\.fna\.fbcdn\.net$/i,
  /\.cdninstagram\.com$/i,
  /\.cdn\.fbsbx\.com$/i,
  /\.scontent[^.]*\.cdninstagram\.com$/i
];

type MetaJson = Record<string, unknown>;

type SanitizedUrl = {
  raw: string | null;
  normalized: string | null;
  domain: string | null;
  path: string | null;
  ephemeral: boolean;
};

export function normalizeCreative(rawInput: MetaJson): NormalizedCreative {
  const raw = rawInput ?? {};

  const creativeId = String(raw["id"] ?? "").trim();
  if (!creativeId) {
    throw new Error("Creative id missing");
  }

  const storySpec = asRecord(raw["object_story_spec"]);
  const linkData = storySpec ? asRecord(storySpec["link_data"]) : null;
  const videoData = storySpec ? asRecord(storySpec["video_data"]) : null;
  const templateUrlSpec = asRecord(raw["template_url_spec"]);
  const assetFeedSpec = asRecord(raw["asset_feed_spec"]);

  const primaryText = coalesce(
    asString(raw["body"]),
    asString(linkData?.["message"])
  );
  const headline = coalesce(asString(raw["title"]), asString(linkData?.["name"]));
  const description = coalesce(asString(raw["description"]), asString(linkData?.["description"]));
  const callToActionType = coalesce(
    asString(raw["call_to_action_type"]),
    asString(asRecord(linkData?.["call_to_action"])?.["type"]),
    asString(templateUrlSpec?.["call_to_action_type"])
  );

  const destinationCandidate = coalesce(
    asString(linkData?.["link"]),
    asString(raw["template_url"]),
    asString(raw["object_url"]),
    asString(raw["link_url"])
  );
  const destination = sanitizeUrl(destinationCandidate);

  const thumbnail = sanitizeAssetUrl(asString(raw["thumbnail_url"]) ?? asString(raw["image_url"]));
  const imageAsset = sanitizeAssetUrl(
    asString(raw["image_url"]) ?? asString(linkData?.["picture"])
  );
  const videoAsset = sanitizeAssetUrl(asString(videoData?.["video_url"]));

  const carouselCards = collectCarouselCards(linkData, templateUrlSpec);
  const dynamicMetadata = summarizeDynamicMetadata(assetFeedSpec);

  const format = determineFormat({
    hasVideo: Boolean(videoAsset.normalized || raw["video_id"]),
    carouselCards,
    objectType: asString(raw["object_type"]),
    imageHash: asString(raw["image_hash"]),
    imageUrl: asString(raw["image_url"]),
    adFormats: Array.isArray(assetFeedSpec?.["ad_formats"]) ? (assetFeedSpec?.["ad_formats"] as string[]) : null
  });
  const isCarousel = format === "carousel";
  const isCatalog = Boolean(raw["product_set_id"] || templateUrlSpec?.["product_set_id"]);
  const isDynamic = Boolean(raw["dynamic_ad_voice"] || assetFeedSpec);
  const assetUrlEphemeral = Boolean(thumbnail.ephemeral || imageAsset.ephemeral || videoAsset.ephemeral);

  const normalizedContent = {
    primaryText: primaryText ?? null,
    headline: headline ?? null,
    description: description ?? null,
    callToActionType: callToActionType ?? null,
    destinationDomain: destination.domain,
    destinationPath: destination.path,
    imageHash: asString(raw["image_hash"]),
    videoId: asString(raw["video_id"]) ?? asString(videoData?.["video_id"]),
    carouselCards,
    dynamicMetadata,
    instagramActorId: asString(raw["instagram_actor_id"]),
    facebookPageId: asString(storySpec?.["page_id"]),
    format,
    templateUrl: destination.normalized,
    isCatalog,
    isDynamic
  } as const;

  const contentHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(normalizedContent))
    .digest("hex");

  const warnings: string[] = [];
  if (!destination.normalized) warnings.push("Creative missing destination URL");
  if (!primaryText && !headline) warnings.push("Creative missing primary text/headline");

  return {
    creativeId,
    creativeName: asString(raw["name"]),
    objectStoryId: asString(raw["object_story_id"]),
    effectiveObjectStoryId: asString(raw["effective_object_story_id"]),
    format,
    callToActionType: callToActionType ?? null,
    destinationDomain: destination.domain,
    destinationPath: destination.path,
    imageHash: asString(raw["image_hash"]),
    videoId: asString(raw["video_id"]) ?? asString(videoData?.["video_id"]),
    thumbnailUrl: thumbnail.normalized,
    imageUrl: imageAsset.normalized,
    facebookPageId: asString(storySpec?.["page_id"]),
    instagramActorId: asString(raw["instagram_actor_id"]),
    isCarousel,
    isDynamic,
    isCatalog,
    assetUrlEphemeral,
    normalizedContent,
    contentHash,
    metadata: {
      primaryText: primaryText ?? null,
      headline: headline ?? null,
      description: description ?? null,
      templateUrl: destination.normalized,
      carouselCards,
      dynamicMetadata,
      thumbnailEphemeral: thumbnail.ephemeral,
      imageEphemeral: imageAsset.ephemeral,
      videoEphemeral: videoAsset.ephemeral,
      warnings
    },
    warnings
  };
}

function coalesce<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}

function sanitizeUrl(raw: string | null | undefined): SanitizedUrl {
  if (!raw || typeof raw !== "string") {
    return { raw: raw ?? null, normalized: null, domain: null, path: null, ephemeral: false };
  }
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    const normalized = `${url.protocol}//${url.host}${url.pathname || "/"}`;
    return {
      raw: trimmed,
      normalized,
      domain: url.hostname,
      path: url.pathname || "/",
      ephemeral: isEphemeralHost(url.hostname)
    };
  } catch {
    return { raw: trimmed, normalized: null, domain: null, path: null, ephemeral: false };
  }
}

function sanitizeAssetUrl(raw: string | null | undefined): SanitizedUrl {
  if (!raw) return { raw: raw ?? null, normalized: null, domain: null, path: null, ephemeral: false };
  const sanitized = sanitizeUrl(raw);
  return sanitized;
}

function isEphemeralHost(hostname: string | null): boolean {
  if (!hostname) return false;
  return CDN_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function collectCarouselCards(
  linkData: MetaJson | null,
  templateUrlSpec: MetaJson | null
): Array<Record<string, unknown>> | null {
  const attachments = asArray(linkData?.["child_attachments"] ?? templateUrlSpec?.["child_attachments"]);
  if (!attachments.length) return null;
  const cards: Array<Record<string, unknown>> = [];
  for (const entry of attachments) {
    const card = asRecord(entry);
    if (!card) continue;
    const linkSanitized = sanitizeUrl(asString(card["link"]));
    const imageSanitized = sanitizeAssetUrl(asString(card["picture"]) ?? asString(card["image_url"]));
    cards.push({
      title: asString(card["name"]),
      description: asString(card["description"]),
      destinationDomain: linkSanitized.domain,
      destinationPath: linkSanitized.path,
      imageUrl: imageSanitized.normalized,
      imageEphemeral: imageSanitized.ephemeral
    });
  }
  return cards.length ? cards : null;
}

function determineFormat(input: {
  hasVideo: boolean;
  carouselCards: Array<Record<string, unknown>> | null;
  objectType: string | null;
  imageHash: string | null;
  imageUrl: string | null;
  adFormats: string[] | null;
}): string | null {
  if (input.carouselCards && input.carouselCards.length > 0) return "carousel";
  if (input.adFormats && input.adFormats.includes("CAROUSEL")) return "carousel";
  if (input.hasVideo) return "video";
  if (input.objectType) return input.objectType.toLowerCase();
  if (input.imageHash || input.imageUrl) return "image";
  return null;
}

function summarizeDynamicMetadata(spec: MetaJson | null): Record<string, unknown> | null {
  if (!spec) return null;
  const images = asArray(spec["images"]).map((img) => {
    const record = asRecord(img);
    if (!record) return null;
    return {
      hash: asString(record["hash"]),
      url: sanitizeAssetUrl(asString(record["url"])).normalized
    };
  }).filter(Boolean) as Array<Record<string, unknown>>;

  const videos = asArray(spec["videos"]).map((vid) => {
    const record = asRecord(vid);
    if (!record) return null;
    return {
      id: asString(record["video_id"]),
      url: sanitizeAssetUrl(asString(record["url"])).normalized
    };
  }).filter(Boolean) as Array<Record<string, unknown>>;

  return {
    adFormats: spec["ad_formats"] ?? null,
    bodies: spec["bodies"] ?? null,
    callToActionTypes: spec["call_to_action_types"] ?? null,
    descriptions: spec["descriptions"] ?? null,
    images: images.length ? images : null,
    videos: videos.length ? videos : null,
    productSetIds: spec["product_set_ids"] ?? null
  };
}

function asRecord(value: unknown): MetaJson | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as MetaJson;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}
