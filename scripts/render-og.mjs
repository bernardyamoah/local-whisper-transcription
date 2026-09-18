import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const [mark, studio] = await Promise.all([
  readFile("studio/static/mark.svg", "base64"),
  readFile("website/media/studio-transcript-v015.webp", "base64"),
]);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});

await page.setContent(`
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        html, body { width: 1200px; height: 630px; margin: 0; overflow: hidden; }
        body {
          position: relative;
          color: #25332b;
          background:
            radial-gradient(circle at 84% 18%, rgba(179, 217, 197, .72), transparent 34%),
            radial-gradient(circle at 55% 105%, rgba(239, 190, 164, .38), transparent 37%),
            #fafbf8;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        body::after {
          content: "";
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(37, 51, 43, .1) .55px, transparent .55px);
          background-size: 7px 7px;
          opacity: .14;
          pointer-events: none;
        }
        .copy {
          position: absolute;
          z-index: 2;
          top: 64px;
          left: 68px;
          width: 490px;
        }
        .wordmark {
          display: flex;
          align-items: center;
          gap: 13px;
          font-size: 26px;
          font-weight: 680;
          letter-spacing: -1px;
        }
        .wordmark img { width: 46px; height: 46px; }
        .wordmark span { color: #6e7b72; font-size: 17px; font-weight: 480; letter-spacing: -.2px; }
        h1 {
          margin: 58px 0 22px;
          font-size: 74px;
          font-weight: 620;
          line-height: .98;
          letter-spacing: -5.2px;
        }
        h1 span { color: #688e78; }
        p {
          width: 430px;
          margin: 0;
          color: #667269;
          font-size: 22px;
          line-height: 1.42;
          letter-spacing: -.45px;
        }
        .details {
          display: flex;
          gap: 9px;
          margin-top: 30px;
        }
        .details span {
          padding: 9px 13px;
          border: 1px solid rgba(55, 90, 70, .16);
          border-radius: 999px;
          background: rgba(255,255,255,.6);
          color: #496153;
          font-size: 13px;
          font-weight: 560;
        }
        .window {
          position: absolute;
          z-index: 1;
          top: 85px;
          left: 594px;
          width: 720px;
          height: 500px;
          overflow: hidden;
          border: 1px solid rgba(89, 119, 100, .22);
          border-radius: 22px;
          background: #f3f1e9;
          box-shadow: 0 34px 80px rgba(43, 67, 52, .22), 0 4px 14px rgba(43, 67, 52, .1);
          transform: rotate(-1.8deg);
        }
        .bar {
          height: 38px;
          display: flex;
          align-items: center;
          padding: 0 15px;
          gap: 7px;
          background: #eceee8;
          border-bottom: 1px solid #d8ddd5;
        }
        .bar i { width: 9px; height: 9px; border-radius: 50%; background: #c8cdc5; }
        .bar i:first-child { background: #e29b90; }
        .bar i:nth-child(2) { background: #dfc180; }
        .bar i:last-child { background: #9bbba1; }
        .window > img {
          width: 720px;
          height: auto;
          display: block;
        }
      </style>
    </head>
    <body>
      <section class="copy">
        <div class="wordmark">
          <img src="data:image/svg+xml;base64,${mark}" alt="" />
          whisper <span>Studio</span>
        </div>
        <h1>Every word.<br /><span>Worth keeping.</span></h1>
        <p>Turn audio and video into editable words. Entirely on your Mac.</p>
        <div class="details"><span>Local by design</span><span>Made for Apple silicon</span></div>
      </section>
      <section class="window">
        <div class="bar"><i></i><i></i><i></i></div>
        <img src="data:image/webp;base64,${studio}" alt="" />
      </section>
    </body>
  </html>
`);

await page.screenshot({
  path: "website/media/og-whisper-studio.png",
  type: "png",
});
await browser.close();
