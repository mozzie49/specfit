# SpecFit

**Meet the byte limit without quietly breaking the pixel requirements.**

SpecFit is a small, original, browser-only JPEG batch exporter. Set a maximum file size, minimum width/height, optional maximum output width, and quality floor. It gives each image a clear result, a before/after composition preview, and exact output bytes and dimensions. Download passing images in one ZIP with an audit report.

This is a convenience-focused open-source experiment, not a new compression algorithm. Existing tools such as ImgTweak, Pixsoma and IrfanView cover related needs. SpecFit narrows the workflow to an explicit byte-and-pixel contract and makes failures visible.

## Try locally

Requires Node.js 22 or newer for the development commands. The app itself uses only browser APIs and local static files.

```sh
npm run dev
# Open http://127.0.0.1:4173
```

No dependency installation is needed to serve or build. Click **Try 3 synthetic examples**, then **Check & export**. With the default rules, the smooth image should pass, the noise image should fail the byte limit, and the 480 × 320 image cannot meet the 800 × 600 minimum. Encoded byte counts vary by browser. The dimension failure is deterministic.

```sh
npm test          # Node unit, property-sweep, ZIP and static-contract tests
npm run build    # Copies the static app into dist/
npm run check    # Tests + build
npm ci
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
```

The included GitHub Actions workflow runs the checks and browser tests. There is no deployment workflow. To host it yourself, serve the contents of `dist/` from any static host. No backend, server secret, model, database, telemetry, CDN, web fonts, or remote runtime dependency is used. Opening `index.html` directly as a `file:` URL is not supported because the app uses ES modules.

## The contract

1. **JPEG only.** Header inspection supports ordinary 8-bit baseline, extended sequential and progressive JPEGs. Unsupported or damaged files are skipped, including non-JPEG bytes disguised with a `.jpg` extension.
2. **Orientation first.** EXIF orientations 1–8, including mirrored orientations, are applied before width/height checks. APP1 metadata is removed from the decode input so the app can apply orientation exactly once. Original ICC information remains available to the browser at decode time.
3. **No upscaling.** Output width is the smaller of the oriented source width and the optional maximum output width. Leave it blank to keep original dimensions. Height is rounded to the nearest whole pixel while preserving aspect ratio to within that rounding. Either minimum failing is a visible failure.
4. **No silent shrinking.** Dimensions are fixed before the quality search. The app does not repeatedly reduce dimensions until a file fits. If a specification is unsatisfiable at those dimensions under the tested encoder settings, adjust the requirements deliberately.
5. **Explicit units.** `1 kB = 1,000 bytes`; `1 KiB = 1,024 bytes`. The cap is rounded down to a whole byte. A result passes only when its exact encoded byte count is less than or equal to the cap.
6. **Highest tested quality.** Test quality 1.00, 0.95, 0.90, and so on down to the exact floor, returning the first fit. This descending grid does not assume monotonic file sizes. It does not search every possible quality, compare encoders, optimize perceived quality, or claim a global optimum. A quality value is a browser encoder input, not a guaranteed perceptual percentage.
7. **Honest failures.** A too-small source is impossible under the no-upscaling rule. A byte-size failure means none of the tested settings fit, not that no possible JPEG could fit. “Skipped” also distinguishes format/resource/browser failures from specification failures.
8. **Safe exports.** ZIP includes only passing JPEGs and `report.json`. Names have path separators, unsafe characters and Windows device-name hazards removed; duplicates are disambiguated case-insensitively. Every source, failure reason, tested quality/size and passing output is recorded in the report. A report-only download is available when nothing passes.

The JSON report contains original filenames, which can themselves contain personal information. Review it before sharing.

## Privacy, quality and limitations

Images never leave the tab through application code. A strict `connect-src 'none'` Content Security Policy blocks network connections from the app, and no persistence API is used. Your browser still requests the static app from whichever host you use; that host's normal request logging is outside SpecFit's control. Browser extensions are also outside its control.

Canvas re-encoding does **not copy original EXIF/GPS, IPTC, XMP, or embedded color profiles** into exports. Orientation is baked into the pixels. Browsers may insert their own encoder metadata. Color rendering/conversion differs by browser, and re-encoding a JPEG loses information even at quality 1.00. Never replace archival originals with these exports. Scaled previews are for composition, not a full-resolution quality inspection.

Resource guards:

| Guard | Limit |
| --- | ---: |
| Files | 20 |
| Each source | 20 MiB |
| Source batch | 80 MiB |
| Each decoded image | 16 megapixels; 16,384 pixels per side |
| Total source pixels | 48 megapixels |
| Retained passing output | 32 MiB |
| Each before/after preview | At most 640 pixels per side and 1 MiB |

Headers and batch pixel totals are inspected before pixel decoding. Files are processed sequentially; transient canvases and image bitmaps are released, and object URLs are revoked on clear/new jobs. ZIP uses the STORE method because JPEG is already compressed. It copies bounded outputs into memory; it is not a streaming archive. Guards reduce allocation risk but cannot guarantee a browser's peak memory consumption. Large batches can still exhaust memory on constrained devices; use fewer or smaller files.

Cancel takes effect after an in-progress browser decode/encode finishes; those browser operations are not directly interruptible. A new batch is blocked until the current job drains. Repeated submit, clear, cancel and subsequent-job flows are covered by browser tests. Reports from a cancelled batch retain completed outputs and mark remaining files cancelled.

Target current Chrome, Edge, Firefox and Safari with Canvas JPEG, `createImageBitmap`, Blob downloads, ES modules and `<dialog>` support. Mobile browsers may save downloads differently. No directory recursion, HEIC/PNG/WebP conversion, animation, crop, EXIF editor, AI enhancement or large-batch worker farm is included.

## Validation status

- The included Node tests cover byte units, bounds, integer dimensions, no upscaling, minimum constraints, quality grid, cancellation checks, EXIF parsing/transforms, metadata stripping, hostile headers, safe names, ZIP integrity and local-only static code.
- The Playwright suite covers Chromium, Firefox and WebKit, including actual JPEG encodes, all eight EXIF pixel orientations, downloads/ZIP contents, failure cases, cancellation and repeated jobs, Chinese/mobile layout, and absence of external requests.
- The initial implementation environment allowed unit/build checks but blocked local browser execution and localhost browsing. Browser tests were authored for CI but were not executed there. Do not interpret the presence of those tests as a recorded browser pass. Run them before publishing or relying on this experiment.

## Why this exists

A [Blender Artists discussion](https://blenderartists.org/t/free-tool-to-reduce-a-folder-structure-of-images-to-a-target-filesize/1482025) describes a concrete webshop requirement: at least 2000 × 2000 pixels and no more than 300 kB per JPEG, across many images. The same thread also points to IrfanView as an existing solution. This project addresses the smaller-batch, browser-local version of that workflow.

An additional [Photoshop discussion](https://www.reddit.com/r/photoshop/comments/v9gnaz/) was supplied as related demand context; its content was not accessible during implementation and no specific claim here relies on it. These discussions are problem evidence, not endorsements, requirements from their authors, or a claim of unserved market demand.

## License and provenance

MIT. See [LICENSE](./LICENSE) and [PROVENANCE.md](./PROVENANCE.md). Application code, styling, the favicon and procedural demo art were created for this experiment. No competitor source code, design assets, sample photography, models, or screenshots were copied.
