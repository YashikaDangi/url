import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

// List of known news domains for prioritization (not hard-coded matching)
const newsDomains = [
  'bbc.com', 'bbc.co.uk', 'nytimes.com', 'washingtonpost.com', 'theguardian.com',
  'cnn.com', 'reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'forbes.com',
  'economist.com', 'apnews.com', 'nbcnews.com', 'cbsnews.com', 'abcnews.go.com',
  'foxnews.com', 'politico.com', 'huffpost.com', 'businessinsider.com', 'techcrunch.com'
];

// List of patterns to exclude from consideration
const excludePatterns = [
  'fonts.googleapis', 'googletagmanager', 'google-analytics', 'analytics', 'gtag',
  'tracking', 'pixel', 'ad.doubleclick', 'facebook.com/tr', 'cdn', 'ajax.googleapis',
  'beacon', '.js', '.css', '.png', '.jpg', '.gif', '.svg', 'favicon', 'wp-content',
  'logo', 'assets', 'static', 'metrics', 'stats', 'events', 'collect'
];

/**
 * API handler for POST requests
 */
export async function POST(request: NextRequest) {
  let browser = null;
  
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
    
    console.log(`Processing request for URL: ${url}`);
    
    // Validate that it's a Google News URL
    if (!url.includes('news.google.com')) {
      return NextResponse.json(
        { error: 'URL must be from news.google.com' },
        { status: 400 }
      );
    }

    // Configure chromium for serverless environment
    chromium.setGraphicsMode = false;
    
    // Get executable path with proper await and cache folder specification
    const executablePath = await chromium.executablePath("/tmp");
    console.log(`Chromium executable path: ${executablePath}`);
    
    // Setup Puppeteer with properly awaited executable path
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    console.log("Browser launched successfully");
    
    // Create a new page
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
    
    // Record all redirects
    const redirectUrls: string[] = [];
    page.on('request', request => {
      const url = request.url();
      if (!url.includes('google.com') && !excludePatterns.some(pattern => url.includes(pattern))) {
        redirectUrls.push(url);
      }
    });
    
    // Collect candidate URLs
    const candidateUrls: any[] = [];
    
    console.log(`Navigating to URL: ${url}`);
    
    // Navigate with proper options
    await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    }).catch(e => {
      console.log('Navigation handled (expected for redirects):', e.message);
    });
    
    console.log("Page loaded, waiting for JavaScript execution");
    
    // Wait for redirects to happen
    await new Promise(r => setTimeout(r, 5000));
    
    // Get all links from the page
    const links = await page.evaluate(() => {
      // Look for links with specific attributes that Google News typically uses
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
    }).catch(e => {
      console.log("Error in page evaluation:", e);
      return [];
    });
    
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
    
    // Also get the current page URL (in case of automatic redirect)
    const currentUrl = await page.url();
    if (currentUrl && 
        !currentUrl.includes('google.com') && 
        !currentUrl.includes('news.google.com') &&
        !excludePatterns.some(pattern => currentUrl.includes(pattern))) {
      console.log(`Adding current URL to candidates: ${currentUrl}`);
      candidateUrls.unshift(currentUrl);
    }
    
    // Add any captured redirect URLs
    redirectUrls.forEach(redirectUrl => {
      if (!candidateUrls.includes(redirectUrl)) {
        candidateUrls.push(redirectUrl);
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
      console.log("Waiting for potential redirect after click");
      await new Promise(r => setTimeout(r, 3000));
      
      // Check the current URL again
      const finalUrl = await page.url();
      console.log(`Current page URL after click: ${finalUrl}`);
      
      if (finalUrl && 
          !finalUrl.includes('google.com') && 
          !finalUrl.includes('news.google.com') &&
          !excludePatterns.some(pattern => finalUrl.includes(pattern)) &&
          !candidateUrls.includes(finalUrl)) {
        candidateUrls.unshift(finalUrl);
      }
    } catch (e) {
      console.log('Error clicking link:', e);
    }
    
    // Close the browser
    if (browser) {
      console.log("Closing browser");
      await browser.close();
      browser = null;
      console.log("Browser closed successfully");
    }
    
    console.log(`Found ${candidateUrls.length} candidate URLs`);
    
    // If we have candidate URLs, return the best one
    if (candidateUrls.length > 0) {
      console.log(`Returning best candidate URL: ${candidateUrls[0]}`);
      return NextResponse.json({ 
        extractedUrl: candidateUrls[0]
      }, { status: 200 });
    }
    
    // If all approaches fail, return an error
    return NextResponse.json(
      { error: 'Unable to extract target URL from Google News article' },
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
    
    // Call the POST handler with the same URL
    const mockRequest = {
      json: () => Promise.resolve({ url })
    } as NextRequest;
    
    return POST(mockRequest);
  } catch (error: any) {
    return NextResponse.json(
      { error: `Error processing GET request: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}