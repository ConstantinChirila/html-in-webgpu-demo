# HTML inside WebGPU demo

A tiny demo for the article **“HTML Inside WebGPU Sounds Wrong. That Is Why It Is Interesting.”**

The yellow card is real DOM inside a `<canvas content="drawable">`. Chromium records a snapshot of that DOM. The demo copies the snapshot into a WebGPU texture with `GPUQueue.drawElementImageToTexture()`, then a small shader distorts it.

There is no framework and no build step.

## Requirements

As of September 2026, HTML in Canvas is still experimental.

Use **Chrome Canary** and enable both flags:

```text
chrome://flags/#canvas-draw-element
chrome://flags/#enable-experimental-web-platform-features
```

Relaunch Canary after changing them.

The current WICG explainer describes the feature as a living proposal, so API names may change:

https://github.com/WICG/html-in-canvas

## Run it

Clone the repo and serve the folder over localhost.

With Node:

```bash
npx serve .
```

Or with Python:

```bash
python3 -m http.server 5173
```

Then open the localhost URL in Chrome Canary.

For the Python command above:

```text
http://localhost:5173
```

Do not open `index.html` directly with a `file://` URL.

## What to try

Move the **Wobble** slider. This only changes a WebGPU shader uniform. The DOM card itself does not change.

Click **Change the DOM**. The text and background of the real `<article>` change, Chromium records a fresh snapshot, and WebGPU receives the new pixels.

Open DevTools and inspect the canvas. The `<article>` still exists as DOM even though its visible version is being rendered through WebGPU.

Try Find in Page for:

```text
Very Serious Panel
```

The experiment is specifically designed to retain DOM semantics and accessibility information rather than reducing the source content to a canvas-only UI.

## The deliberate limitation

The demo tells Chromium where the card's **undistorted** rectangle is with `updateElementGeometry()`.

That works for a normal transform. It cannot perfectly describe a shader that moves different pixels by different amounts. The wobble makes that limitation visible rather than hiding it.

For that reason, the interactive demo controls sit outside the distorted card.

## Files

```text
.
├── index.html
├── style.css
├── demo.js
└── README.md
```

## Reference

WICG HTML in Canvas:

https://github.com/WICG/html-in-canvas

The WICG repository also contains an official WebGPU jelly slider example that uses the same experimental DOM-to-texture API.
