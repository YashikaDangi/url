/**
 * Utility function to extract the target URL from a Google News redirect URL
 * @param {string} googleUrl - The Google News URL to extract from
 * @returns {Promise<string>} - The target URL
 */
export async function extractUrl(googleUrl: string): Promise<string> {
  if (!googleUrl) {
    throw new Error('URL is required');
  }

  // Validate that this is a Google News URL
  if (!googleUrl.includes('news.google.com')) {
    throw new Error('Only Google News URLs are supported');
  }

  try {
    // Make a HEAD request to get the redirect URL without following it
    const response = await fetch(googleUrl, {
      method: 'HEAD',
      redirect: 'manual', // Don't follow redirects automatically
    });

    // Get the Location header which contains the target URL
    const targetUrl = response.headers.get('location');

    if (!targetUrl) {
      throw new Error('No redirect URL found');
    }

    return targetUrl;
  } catch (error: unknown) {
    console.error('Error extracting URL:', error);
    
    if (error instanceof Error) {
      throw new Error(`Failed to extract URL: ${error.message}`);
    } else {
      throw new Error('Failed to extract URL: Unknown error');
    }
  }
}