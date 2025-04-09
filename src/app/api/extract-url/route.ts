import { NextRequest, NextResponse } from 'next/server';
import puppeteer, { Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

// Configure chromium for serverless environment
chromium.setGraphicsMode = false;



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
 * Extract target URL using puppeteer
 */
async function extractTargetUrl(url: string) {
  let browser: Browser | null = null;
  
  try {
    // Validate that it's a Google News URL
    if (!url.includes('news.google.com')) {
      return {
        error: 'URL must be from news.google.com',
        status: 400
      };
    }

    // Extract the article ID
    let articleId = '';
    if (url.includes('/articles/')) {
      articleId = url.split('/articles/')[1].split('?')[0];
    } else if (url.includes('/rss/articles/')) {
      articleId = url.split('/rss/articles/')[1].split('?')[0];
    }


    console.log("Launching puppeteer...");
    
    // Launch puppeteer with minimal settings
    browser = await puppeteer.launch({
      args: [...chromium.args, '--disable-web-security', '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: true,
      ignoreHTTPSErrors: true,
    });

    console.log("Puppeteer launched successfully");
    
    // Create a new page
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.64 Safari/537.36');
    
    // Collect candidate URLs
    const candidateUrls: string[] = [];
    
    console.log(`Navigating to URL: ${url}`);
    
    // Start by navigating to the URL without interception to let it fully load
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => {
      console.log('Navigation error (expected during redirects):', e.message);
    });
    
    console.log("Page loaded, waiting for JavaScript execution...");
    
    // Wait a moment for JavaScript to execute
    await new Promise(r => setTimeout(r, 3000));
    
    console.log("Extracting links from page...");
    
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
    
    console.log(`Found ${links.length} links on the page`);
    
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
    
    console.log(`Identified ${candidateUrls.length} candidate URLs`);
    
    // Try to click the first article link to trigger a redirect
    try {
      console.log("Attempting to click on article link...");
      
      await page.evaluate(() => {
        const articleLinks = [
          ...Array.from(document.querySelectorAll('a[target="_blank"]')),
          ...Array.from(document.querySelectorAll('a.DY5T1d')),
          ...Array.from(document.querySelectorAll('a.VDXfz'))
        ];
        
        if (articleLinks.length > 0) {
          console.log("Found article link to click");
          (articleLinks[0] as HTMLElement).click();
        } else {
          console.log("No clickable article links found");
        }
      });
      
      // Wait for any redirect to happen
      console.log("Waiting for potential redirect...");
      await new Promise(r => setTimeout(r, 3000));
      
      // Check the current URL
      const finalUrl = await page.url();
      console.log(`Current page URL after click: ${finalUrl}`);
      
      if (finalUrl && 
          !finalUrl.includes('google.com') && 
          !finalUrl.includes('news.google.com') &&
          !excludePatterns.some(pattern => finalUrl.includes(pattern))) {
        console.log(`Adding final URL to candidates: ${finalUrl}`);
        candidateUrls.unshift(finalUrl);
      }
    } catch (e) {
      console.log('Error clicking link:', e);
    }
    
    // Close the browser
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
      browser = null;
      console.log("Browser closed successfully");
    }
    
    // If we have candidate URLs, return the best one
    if (candidateUrls.length > 0) {
      console.log(`Returning best candidate URL: ${candidateUrls[0]}`);
      return { 
        targetUrl: candidateUrls[0],
        source: "extracted_link",
        status: 200
      };
    }
    
    // If all approaches fail, return an error
    return {
      error: 'Unable to extract target URL from Google News article',
      articleId: articleId,
      status: 404
    };
  } catch (error: any) {
    console.error('Error extracting target URL:', error);
    
    // Make sure to close the browser in case of error
    if (browser) {
      try {
        console.log("Closing browser after error...");
        await browser.close();
        console.log("Browser closed successfully after error");
      } catch (e) {
        console.error('Error closing browser:', e);
      }
    }
    
    return {
      error: `Failed to extract target URL: ${error.message || 'Unknown error'}`,
      status: 500
    };
  }
}

/**
 * API handler for GET requests
 */
export async function GET(request: NextRequest) {
  try {
    // Get the URL from the query parameters
    const url = request.nextUrl.searchParams.get('url');
    
    if (!url) {
      return NextResponse.json(
        { error: 'Missing URL in query parameters' },
        { status: 400 }
      );
    }
    
    console.log(`Processing GET request for URL: ${url}`);
    
    const result = await extractTargetUrl(url);
    
    return NextResponse.json(
      result.error ? { error: result.error, articleId: result.articleId } : { extractedUrl: result.targetUrl, source: result.source },
      { status: result.status }
    );
  } catch (error: any) {
    console.error('Error in GET handler:', error);
    return NextResponse.json(
      { error: `Error processing request: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

/**
 * API handler for POST requests
 */
export async function POST(request: NextRequest) {
  try {
    // Get the URL from the request body
    const body = await request.json();
    const url = body.url;
    
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid URL in request body' },
        { status: 400 }
      );
    }
    
    console.log(`Processing POST request for URL: ${url}`);
    
    const result = await extractTargetUrl(url);
    
    return NextResponse.json(
      result.error ? { error: result.error, articleId: result.articleId } : { extractedUrl: result.targetUrl, source: result.source },
      { status: result.status }
    );
  } catch (error: any) {
    console.error('Error in POST handler:', error);
    return NextResponse.json(
      { error: `Error processing request: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}