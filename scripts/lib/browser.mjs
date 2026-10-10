// Headless Edge helper shared by the measurement and gate scripts.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
export const browserPath = () => CANDIDATES.find((p) => fs.existsSync(p));

export async function launch() {
  const executablePath = browserPath();
  if (!executablePath) throw new Error('no Edge or Chrome found');
  return puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
}
