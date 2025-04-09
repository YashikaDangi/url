import { NextRequest, NextResponse } from 'next/server';
import { extractUrlWithPuppeteer } from '@/lib/extractUrlWithPuppeteer';

/**
 * API route handler for URL extraction - GET method
 * GET /api/extract?url=https://news.google.com/rss/articles/...
 */
export async function GET(request: NextRequest) {
  // Get the URL from query parameters
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      { error: 'Missing URL parameter' },
      { status: 400 }
    );
  }

  try {
    // Extract the target URL using Puppeteer
    const targetUrl = await extractUrlWithPuppeteer(url);

    // Return the result
    return NextResponse.json({
      original_url: url,
      target_url: targetUrl
    });
  } catch (error: unknown) {
    console.error('Error in API route:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

interface UrlRequestBody {
  url: string;
}

/**
 * API route handler for URL extraction - POST method
 */
export async function POST(request: NextRequest) {
  let url: string | null;

  // Check if URL is in query parameters
  const { searchParams } = new URL(request.url);
  url = searchParams.get('url');

  // If no URL in query params, try to get it from the request body
  if (!url) {
    try {
      const body = await request.json() as UrlRequestBody;
      url = body.url;
    } catch (e) {
      // If request body could not be parsed as JSON
      return NextResponse.json(
        { error: 'Invalid request body or missing URL parameter' },
        { status: 400 }
      );
    }
  }

  if (!url) {
    return NextResponse.json(
      { error: 'Missing URL in query parameters or request body' },
      { status: 400 }
    );
  }

  try {
    // Extract the target URL using Puppeteer
    const targetUrl = await extractUrlWithPuppeteer(url);

    // Return the result
    return NextResponse.json({
      original_url: url,
      target_url: targetUrl
    });
  } catch (error: unknown) {
    console.error('Error in API route:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// Add OPTIONS method handler for CORS preflight requests
export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}