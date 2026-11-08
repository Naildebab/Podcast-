export const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:podcast="https://podcastindex.org/namespace/1.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Test English Show</title>
    <link>https://example.com/show</link>
    <description>A show for &amp; about testing.</description>
    <language>en</language>
    <itunes:author>Test Host</itunes:author>
    <itunes:image href="https://example.com/cover.jpg" />
    <item>
      <title>Episode One &amp; Friends</title>
      <description><![CDATA[<p>Hello <b>world</b> &amp; friends.</p>]]></description>
      <guid isPermaLink="false">ep-1</guid>
      <pubDate>Tue, 01 Oct 2024 10:00:00 GMT</pubDate>
      <enclosure url="https://example.com/audio/one.mp3" type="audio/mpeg" length="12345" />
      <itunes:duration>12:34</itunes:duration>
      <podcast:transcript url="https://example.com/one.vtt" type="text/vtt" />
    </item>
    <item>
      <title>Episode Two</title>
      <description>Second episode</description>
      <guid>ep-2</guid>
      <pubDate>Wed, 02 Oct 2024 10:00:00 GMT</pubDate>
      <enclosure url="https://example.com/audio/two.mp3" type="audio/mpeg" />
      <itunes:duration>1:02:03</itunes:duration>
    </item>
  </channel>
</rss>`;

export const SAMPLE_RSS_WITH_THIRD = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Test English Show</title>
    <link>https://example.com/show</link>
    <description>A show for &amp; about testing.</description>
    <language>en</language>
    <itunes:author>Test Host</itunes:author>
    <itunes:image href="https://example.com/cover.jpg" />
    <item>
      <title>Episode One &amp; Friends</title>
      <description><![CDATA[<p>Hello <b>world</b> &amp; friends.</p>]]></description>
      <guid isPermaLink="false">ep-1</guid>
      <pubDate>Tue, 01 Oct 2024 10:00:00 GMT</pubDate>
      <enclosure url="https://example.com/audio/one.mp3" type="audio/mpeg" />
      <itunes:duration>12:34</itunes:duration>
      <podcast:transcript url="https://example.com/one.vtt" type="text/vtt" />
    </item>
    <item>
      <title>Episode Two</title>
      <description>Second episode</description>
      <guid>ep-2</guid>
      <pubDate>Wed, 02 Oct 2024 10:00:00 GMT</pubDate>
      <enclosure url="https://example.com/audio/two.mp3" type="audio/mpeg" />
      <itunes:duration>1:02:03</itunes:duration>
    </item>
    <item>
      <title>Episode Three</title>
      <description>Third episode</description>
      <guid>ep-3</guid>
      <pubDate>Thu, 03 Oct 2024 10:00:00 GMT</pubDate>
      <enclosure url="https://example.com/audio/three.mp3" type="audio/mpeg" />
      <itunes:duration>42</itunes:duration>
    </item>
  </channel>
</rss>`;

export const SAMPLE_ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <title>Atom Audio Show</title>
  <subtitle>Audio, but in Atom.</subtitle>
  <author><name>Atom Host</name></author>
  <link rel="alternate" href="https://example.com/atom" />
  <logo>https://example.com/atom-cover.jpg</logo>
  <entry>
    <id>atom-ep-1</id>
    <title>Atom Episode</title>
    <summary>An entry with an enclosure.</summary>
    <published>2024-10-05T10:00:00Z</published>
    <link rel="enclosure" type="audio/mpeg" href="https://example.com/audio/atom.mp3" />
    <itunes:duration>05:10</itunes:duration>
  </entry>
</feed>`;

export const SAMPLE_SITE = `<!doctype html>
<html>
  <head>
    <title>A podcast website</title>
    <link rel="stylesheet" href="/style.css" />
    <link rel="alternate" type="application/atom+xml" href="/atom.xml" />
    <link rel="alternate" type="application/rss+xml" title="Podcast feed" href="/feed.xml" />
    <link rel="alternate" type="application/rss+xml" title="Comments" href="https://example.com/comments/feed" />
  </head>
  <body><h1>Listen here</h1></body>
</html>`;
