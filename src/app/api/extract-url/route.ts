import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';

// List of known news domains for prioritization
const newsDomains = [
  'bbc.com', 'bbc.co.uk', 'nytimes.com', 'washingtonpost.com', 'theguardian.com',
  'cnn.com', 'reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'forbes.com'
  // Add more as needed
];

// List of patterns to exclude from consideration
const excludePatterns = [
  'fonts.googleapis', 'googletagmanager', 'google-analytics', 'analytics', 'gtag',
  'tracking', 'pixel', 'ad.doubleclick', 'facebook.com/tr', 'cdn', 'ajax.googleapis'
  // Add more as needed
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

    // Connect to browserless.io
    // Replace YOUR_API_KEY with your actual browserless API key
    const browserWSEndpoint = `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_API_KEY}`;
    
    // Connect to the browserless WebSocket endpoint
    browser = await puppeteer.connect({
      browserWSEndpoint,
      defaultViewport: { width: 1280, height: 800 }
    });
    
    console.log("Connected to browserless.io");
    
    // Create a new page
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
    
    // Collect candidate URLs
    const candidateUrls: string[] = [];
    const redirectUrls: string[] = [];
    
    // Track redirects
    page.on('request', request => {
      const requestUrl = request.url();
      if (!requestUrl.includes('google.com') && 
          !excludePatterns.some(pattern => requestUrl.includes(pattern))) {
        if (!redirectUrls.includes(requestUrl)) {
          redirectUrls.push(requestUrl);
        }
      }
    });
    
    // Navigate to the URL
    console.log(`Navigating to URL: ${url}`);
    try {
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 25000  // Browserless has higher timeout limits
      });
    } catch (e) {
      const error = e as Error;
      console.log('Navigation timeout or error (expected for redirects):', error.message);
    }
    
    // Wait a bit for JavaScript to execute and redirects to happen
    await page.waitForTimeout(3000);
    
    // Check if we were redirected to a news site
    const currentUrl = await page.url();
    console.log(`Current page URL: ${currentUrl}`);
    
    if (currentUrl && 
        !currentUrl.includes('google.com') && 
        !currentUrl.includes('news.google.com') &&
        !excludePatterns.some(pattern => currentUrl.includes(pattern))) {
      console.log(`Found direct redirect to: ${currentUrl}`);
      candidateUrls.unshift(currentUrl);
    }
    
    // If we've already found a good redirect, we can skip the DOM search
    if (candidateUrls.length === 0) {
      console.log("Looking for links in the page");
      
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
        const error = e as Error;
        console.log("Error extracting links:", error);
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
    }
    
    // Add any captured redirect URLs
    redirectUrls.forEach(redirectUrl => {
      if (!candidateUrls.includes(redirectUrl)) {
        candidateUrls.push(redirectUrl);
      }
    });
    
    // Close the browser connection
    if (browser) {
      console.log("Disconnecting from browserless");
      await browser.disconnect();
      browser = null;
      console.log("Browser disconnected successfully");
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
        await browser.disconnect();
      } catch (e) {
        console.error('Error disconnecting browser:', e);
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