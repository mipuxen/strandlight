import '@fontsource/sora/300.css';
import '@fontsource/sora/400.css';
import '@fontsource/sora/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/cormorant/500.css';
import '@fontsource/cormorant/600.css';
import '@fontsource/manrope/300.css';
import '@fontsource/manrope/500.css';
import './ui/styles.css';
import { App } from './app';
import { initLocale } from './i18n/i18n';

// A signature for anyone who opens the developer tools.
console.log(
  '%cStrandlight%c\nDesigned & built by Khoshimov Shukhratbek "Bruce" — AI Agentic Software Engineer\nhttps://github.com/mipuxen/strandlight',
  'font: 600 22px Sora, sans-serif; color: #ff4fd8; text-shadow: 0 0 12px #ff4fd8;',
  'font: 12px Sora, sans-serif; color: #7cf7ff;',
);

async function boot(): Promise<void> {
  await initLocale();
  const host = document.getElementById('app');
  if (host) new App(host);
}

void boot();
