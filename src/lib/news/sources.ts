export type NewsSource = {
  sourceKey: string;
  sourceName: string;
  feedUrl: string;
  homepageUrl: string;
};

// Keep this list small, explicit, and overrideable.
// If a feed URL changes, update here (and add a test fixture if parsing differs).
export const NEWS_SOURCES: NewsSource[] = [
  {
    sourceKey: "boardroom",
    sourceName: "Boardroom",
    feedUrl: "https://boardroom.tv/feed/",
    homepageUrl: "https://boardroom.tv/"
  },
  {
    sourceKey: "front-office-sports",
    sourceName: "Front Office Sports",
    feedUrl: "https://frontofficesports.com/feed/",
    homepageUrl: "https://frontofficesports.com/"
  },
  {
    sourceKey: "sports-business-journal",
    sourceName: "Sports Business Journal",
    // FeedBurner mirror stays reachable when SBJ rotates their ArcXP paths.
    feedUrl: process.env.SBJ_RSS_URL ?? "https://feeds.feedburner.com/SportsBusinessJournal",
    homepageUrl: "https://www.sportsbusinessjournal.com/"
  },
  {
    sourceKey: "billboard",
    sourceName: "Billboard",
    feedUrl: "https://www.billboard.com/feed/",
    homepageUrl: "https://www.billboard.com/"
  },
  {
    sourceKey: "variety",
    sourceName: "Variety",
    feedUrl: "https://variety.com/feed/",
    homepageUrl: "https://variety.com/"
  },
  {
    sourceKey: "hypebeast",
    sourceName: "Hypebeast",
    feedUrl: "https://hypebeast.com/feed",
    homepageUrl: "https://hypebeast.com/"
  },
  {
    sourceKey: "puck",
    sourceName: "Puck (via RSSHub)",
    feedUrl: process.env.PUCK_RSS_URL ?? "https://puck.news/feed/",
    homepageUrl: "https://puck.news/"
  },
  {
    sourceKey: "artnet",
    sourceName: "Artnet",
    feedUrl: "https://news.artnet.com/feed",
    homepageUrl: "https://news.artnet.com/"
  },
  {
    sourceKey: "hypeart",
    sourceName: "Hypeart",
    feedUrl: "https://hypeart.com/feed",
    homepageUrl: "https://hypeart.com/"
  },
  {
    sourceKey: "highsnobiety",
    sourceName: "Highsnobiety",
    feedUrl: "https://www.highsnobiety.com/feed/",
    homepageUrl: "https://www.highsnobiety.com/"
  },
  {
    sourceKey: "axios-media",
    sourceName: "Axios",
    feedUrl:
      process.env.AXIOS_RSS_URL ?? "https://news.google.com/rss/search?q=site:axios.com&hl=en-US&gl=US&ceid=US:en",
    homepageUrl: "https://www.axios.com/"
  }
];
