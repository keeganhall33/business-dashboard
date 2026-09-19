export const META_GRAPH_API_VERSION_V1 = 'v25.0';
const META_GRAPH_ORIGIN = 'https://graph.facebook.com';
const DEFAULT_MAX_PAGES = 100;

export function buildMetaGraphUrlV1(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.includes('..')) {
    throw new Error('Meta Graph API pathname is invalid');
  }
  return new URL(`${META_GRAPH_ORIGIN}/${META_GRAPH_API_VERSION_V1}${pathname}`);
}

function assertSafePagingUrl(candidateUrl, initialUrl) {
  let candidate;
  let initial;
  try {
    candidate = new URL(candidateUrl);
    initial = new URL(initialUrl);
  } catch {
    throw new Error('Meta insights paging URL is malformed');
  }

  if (
    candidate.protocol !== 'https:' ||
    candidate.origin !== initial.origin ||
    candidate.pathname !== initial.pathname
  ) {
    throw new Error('Meta insights paging URL changed endpoint');
  }

  return candidate.toString();
}

export async function fetchAllMetaInsightPagesV1({
  initialUrl,
  accessToken,
  fetchImpl,
  maxPages = DEFAULT_MAX_PAGES,
}) {
  if (typeof initialUrl !== 'string' || !initialUrl.trim()) {
    throw new Error('Meta insights initial URL is required');
  }
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new Error('Meta insights access token is required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('Meta insights fetch implementation is required');
  }
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) {
    throw new Error('Meta insights maxPages must be a positive safe integer');
  }

  const normalizedInitialUrl = assertSafePagingUrl(initialUrl, initialUrl);
  const seenUrls = new Set();
  const data = [];
  let nextUrl = normalizedInitialUrl;
  let pagesFetched = 0;

  while (nextUrl) {
    const normalizedNextUrl = assertSafePagingUrl(nextUrl, normalizedInitialUrl);
    if (seenUrls.has(normalizedNextUrl)) {
      throw new Error('Meta insights paging loop detected');
    }
    if (pagesFetched >= maxPages) {
      throw new Error(`Meta insights pagination exceeded ${maxPages} pages`);
    }

    seenUrls.add(normalizedNextUrl);
    pagesFetched += 1;

    const response = await fetchImpl(normalizedNextUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response?.ok) {
      const text = typeof response?.text === 'function' ? await response.text() : '';
      throw new Error(
        `Meta insights API failed (${response?.status ?? 'unknown'} ${response?.statusText ?? 'unknown'}): ${text}`,
      );
    }

    const json = await response.json();
    if (!json || !Array.isArray(json.data)) {
      throw new Error('Meta insights API returned malformed page data');
    }

    data.push(...json.data);

    const rawNext = json.paging?.next ?? null;
    if (rawNext !== null && typeof rawNext !== 'string') {
      throw new Error('Meta insights API returned malformed paging.next');
    }
    nextUrl = rawNext ? assertSafePagingUrl(rawNext, normalizedInitialUrl) : null;
  }

  return Object.freeze({
    data: Object.freeze(data.slice()),
    pagesFetched,
    paginationComplete: true,
  });
}
