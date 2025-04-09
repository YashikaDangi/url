// app/page.tsx
"use client";

import { useState } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [extractedUrl, setExtractedUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setExtractedUrl('');

    try {
      const encodedUrl = encodeURIComponent(url);
      const response = await fetch(`/api/extract?url=${encodedUrl}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to extract URL');
      }

      setExtractedUrl(data.extractedUrl);
    } catch (err: any) {
      setError(err.message || 'An error occurred while extracting the URL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-bold mb-6">URL Extractor</h1>
      <p className="mb-6 text-center max-w-md">
        Extract the final URL from Google News redirect links
      </p>
      
      <form onSubmit={handleSubmit} className="w-full max-w-lg">
        <div className="flex flex-col mb-4">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste Google News URL here"
            className="p-3 border border-gray-300 rounded mb-3"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-500 text-white p-3 rounded hover:bg-blue-600 disabled:bg-blue-300"
          >
            {loading ? 'Extracting...' : 'Extract URL'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-6 p-3 bg-red-100 border border-red-400 text-red-700 rounded max-w-lg w-full">
          {error}
        </div>
      )}

      {extractedUrl && (
        <div className="mt-6 p-4 bg-green-100 border border-green-400 rounded max-w-lg w-full break-words">
          <h2 className="font-bold mb-2">Extracted URL:</h2>
          <a 
            href={extractedUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline break-all"
          >
            {extractedUrl}
          </a>
        </div>
      )}
    </main>
  );
}