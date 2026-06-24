import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
  
  await page.goto('http://localhost:5174/');
  
  console.log("Typing number...");
  await page.waitForSelector('#mobile-input');
  await page.type('#mobile-input', '9876543210');
  
  console.log("Clicking continue...");
  await page.click('#auth-continue-btn');
  
  console.log("Waiting 3 seconds...");
  await new Promise(r => setTimeout(r, 3000));
  
  await browser.close();
})();
