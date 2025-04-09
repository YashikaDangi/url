import { NextRequest, NextResponse } from 'next/server';

// Middleware to enable CORS for API routes
export function middleware(request: NextRequest) {
  // Only apply to API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Create a new response
    const response = NextResponse.next();

    // Add the CORS headers
    response.headers.append('Access-Control-Allow-Credentials', 'true');
    response.headers.append('Access-Control-Allow-Origin', '*'); // Configure this to be more restrictive in production
    response.headers.append('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    response.headers.append(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    return response;
  }
}

// Configure the matcher to only apply to API routes
export const config = {
  matcher: '/api/:path*',
};