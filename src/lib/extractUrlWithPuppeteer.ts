import puppeteer from 'puppeteer';

/**
 * Extract the target URL from a Google News redirect URL using Puppeteer
 * @param {string} googleUrl - The Google News URL to extract from
 * @returns {Promise<string>} - The target URL
 */
export async function extractUrlWithPuppeteer(googleUrl: string): Promise<string> {
  if (!googleUrl) {
    throw new Error('URL is required');
  }

  // Validate that this is a Google News URL
  if (!googleUrl.includes('news.google.com')) {
    throw new Error('Only Google News URLs are supported');
  }

  let browser;
  try {
    // Launch a headless browser - using true instead of 'new' for better TypeScript compatibility
    browser = await puppeteer.launch({
      headless: true, // Use boolean value instead of 'new'
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    // Open a new page
    const page = await browser.newPage();
    
    // Enable request interception to catch all redirects
    await page.setRequestInterception(true);
    
    let targetUrl = '';
    
    // Listen for requests to catch the actual news site URL
    page.on('request', (request) => {
      const url = request.url();
      // If this request is going to a non-Google domain, it's likely our target
      if (!url.includes('google.com') && !url.includes('gstatic.com') && !url.includes('about:blank')) {
        targetUrl = url;
      }
      request.continue();
    });

    // Navigate to the Google News URL and wait for all redirects to complete
    await page.goto(googleUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // If we didn't catch the URL through request interception, get the final URL
    if (!targetUrl) {
      // Try to find links on the page that point to external sites
      targetUrl = await page.evaluate(() => {
        // Look for the first link that leads outside Google
        const links = Array.from(document.querySelectorAll('a[href]'));
        for (const link of links) {
          const href = link.getAttribute('href');
          if (href && !href.includes('google.com') && href.startsWith('http')) {
            return href;
          }
        }
        return window.location.href; // Fallback to the current URL
      });
    }

    return targetUrl;
  } catch (error: unknown) {
    console.error('Error extracting URL with Puppeteer:', error);
    
    if (error instanceof Error) {
      throw new Error(`Failed to extract URL: ${error.message}`);
    } else {
      throw new Error('Failed to extract URL: Unknown error');
    }
  } finally {
    // Make sure to close the browser
    if (browser) {
      await browser.close();
    }
  }
}