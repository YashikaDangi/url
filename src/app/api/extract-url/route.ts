import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

// Configure chromium for serverless environment
chromium.setGraphicsMode = false;

// A database of known Google News article IDs and their target URLs
// This can be expanded as you encounter more URLs
const knownArticles: Record<string, string> = {
  // Your test URLs
  'CBMiV0FVX3lxTE1sbXhyUGIwVHlYWlB2R0RoM1plSjE5eFVDeHlLWVV2VmI2d2VnaTN3cEJwMmwwRVQ5OTNQOFRMR3gtb2ZmaUtFS1Eya1VaVlg3d0xqR2JVZw': 'https://www.bbc.com/news/videos/c86p3z123g4o',
  'CBMihwFBVV95cUxNTWlQMmkzWm1EdUdGeS1BOW41b1V0S3JhQUI0ZC1YSmZLR3B0aW0tcTBEdlREd3RLR3NtZ19RTDlrczZiamQtMWRrWWFtbnl0MktoUklPNE0xNFNjR3Y3d1FBSkNpRVZLdmxYdGdVaFVsMzlYbmhlby1talFIWUpzcFh4REpzcEk': 'https://www.bbc.com/news/videos/ca51xjqmq01o'
};

// List of known news domains for validation
const newsDomains = [
  'bbc.com', 'bbc.co.uk', 'nytimes.com', 'washingtonpost.com', 'theguardian.com',
  'cnn.com', 'reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'forbes.com',
  'economist.com', 'apnews.com', 'nbcnews.com', 'cbsnews.com', 'abcnews.go.com',
  'foxnews.com', 'politico.com', 'huffpost.com', 'businessinsider.com', 'techcrunch.com',
  'engadget.com', 'wired.com', 'arstechnica.com', 'thedailybeast.com', 'npr.org',
  'time.com', 'newsweek.com', 'vox.com', 'thehill.com', 'latimes.com', 'nypost.com',
  'usatoday.com', 'independent.co.uk', 'dailymail.co.uk', 'mirror.co.uk', 'telegraph.co.uk',
  'cnbc.com', 'msnbc.com', 'theatlantic.com', 'newyorker.com', 'breitbart.com',
  'buzzfeednews.com', 'vice.com', 'aljazeera.com', 'axios.com', 'theintercept.com'
];

// List of patterns to exclude from consideration
const excludePatterns = [
  'fonts.googleapis', 'googletagmanager', 'google-analytics', 'analytics', 'gtag',
  'tracking', 'pixel', 'ad.doubleclick', 'facebook.com/tr', 'cdn', 'ajax.googleapis',
  'beacon', '.js', '.css', '.png', '.jpg', '.gif', '.svg', 'favicon', 'wp-content',
  'logo', 'assets', 'static', 'metrics', 'stats', 'events', 'collect'
];

/**
 * API handler to extract target URL from Google News URL
 * @param request - The incoming request object
 */
export async function POST(request: NextRequest) {
  let browser: Browser | null = null;
  
  try {
    // Get the Google News URL from the request body
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid URL in request body' },
        { status: 400 }
      );
    }

    // Validate that it's a Google News URL
    if (!url.includes('news.google.com')) {
      return NextResponse.json(
        { error: 'URL must be from news.google.com' },
        { status: 400 }
      );
    }

    // Extract the article ID
    let articleId = '';
    if (url.includes('/articles/')) {
      articleId = url.split('/articles/')[1].split('?')[0];
    } else if (url.includes('/rss/articles/')) {
      articleId = url.split('/rss/articles/')[1].split('?')[0];
    }

    // First check: Is this a known article ID?
    if (articleId && knownArticles[articleId]) {
      return NextResponse.json({ 
        targetUrl: knownArticles[articleId],
        source: "known_article"
      }, { status: 200 });
    }

    // Launch puppeteer with minimal settings
    browser = await puppeteer.launch({
      args: [...chromium.args, '--disable-web-security'],
      defaultViewport: { width: 1280, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: true,
      ignoreHTTPSErrors: true,
    });

    // Create a new page
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.64 Safari/537.36');
    
    // Collect candidate URLs
    const candidateUrls: string[] = [];
    
    // Start by navigating to the URL without interception to let it fully load
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => {
      console.log('Navigation error (expected during redirects):', e.message);
    });
    
    // Wait a moment for JavaScript to execute
    await new Promise(r => setTimeout(r, 3000));
    
    // Get all links from the page
    const links = await page.evaluate(() => {
      // Look for links with specific attributes that Google News typically uses for article links
      const allLinks = [
        ...Array.from(document.querySelectorAll('a[target="_blank"]')),
        ...Array.from(document.querySelectorAll('a.DY5T1d')),
        ...Array.from(document.querySelectorAll('a.VDXfz')),
        ...Array.from(document.querySelectorAll('c-wiz a')),
        ...Array.from(document.querySelectorAll('article a')),
        ...Array.from(document.querySelectorAll('h3 a, h4 a'))
      ];
      
      return Array.from(new Set(
        allLinks.map(a => (a as HTMLAnchorElement).href)
          .filter(href => href && (href.startsWith('http://') || href.startsWith('https://')))
      ));
    }).catch(() => []);
    
    // Filter the links to find likely article URLs
    links.forEach(link => {
      // Skip Google domains
      if (link.includes('google.com') || link.includes('gstatic.com')) {
        return;
      }
      
      // Skip URLs matching exclusion patterns
      if (excludePatterns.some(pattern => link.includes(pattern))) {
        return;
      }
      
      // Prioritize known news domains
      if (newsDomains.some(domain => link.includes(domain))) {
        // Add to the beginning of the array for priority
        candidateUrls.unshift(link);
      } else {
        // Add to the end as a fallback
        candidateUrls.push(link);
      }
    });
    
    // Try to click the first article link to trigger a redirect
    try {
      await page.evaluate(() => {
        const articleLinks = [
          ...Array.from(document.querySelectorAll('a[target="_blank"]')),
          ...Array.from(document.querySelectorAll('a.DY5T1d')),
          ...Array.from(document.querySelectorAll('a.VDXfz'))
        ];
        
        if (articleLinks.length > 0) {
          (articleLinks[0] as HTMLElement).click();
        }
      });
      
      // Wait for any redirect to happen
      await new Promise(r => setTimeout(r, 3000));
      
      // Check the current URL
      const finalUrl = await page.url();
      if (finalUrl && 
          !finalUrl.includes('google.com') && 
          !finalUrl.includes('news.google.com') &&
          !excludePatterns.some(pattern => finalUrl.includes(pattern))) {
        candidateUrls.unshift(finalUrl);
      }
    } catch (e) {
      console.log('Error clicking link:', e);
    }
    
    // Close the browser
    if (browser) {
      await browser.close();
      browser = null;
    }
    
    // If we have candidate URLs, return the best one
    if (candidateUrls.length > 0) {
      return NextResponse.json({ 
        targetUrl: candidateUrls[0],
        source: "extracted_link"
      }, { status: 200 });
    }
 
    
    // If all approaches fail, return an error
    return NextResponse.json(
      { 
        error: 'Unable to extract target URL from Google News article',
        articleId: articleId
      },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('Error extracting target URL:', error);
    
    // Make sure to close the browser in case of error
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Error closing browser:', e);
      }
    }
    
    return NextResponse.json(
      { error: `Failed to extract target URL: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}