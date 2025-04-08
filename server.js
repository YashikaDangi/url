const express = require('express');
const puppeteer = require('puppeteer');
const app = express();

app.use(express.static('public'));

app.get('/extract', async (req, res) => {
  try {
    const { url } = req.query;
    
    // Launch a headless browser
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // Navigate to the URL and wait for redirects to complete
    await page.goto(url, { waitUntil: 'networkidle0' });
    
    // Get the final URL
    const targetUrl = page.url();
    
    await browser.close();
    
    res.json({ targetUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));