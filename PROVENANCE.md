# Provenance

- **Application code:** Original implementation for SpecFit, 2026, AI-assisted. MIT.
- **Design:** Original HTML/CSS layout and inline-letter wordmark; system fonts only.
- **Favicon:** Original SVG geometry in `public/favicon.svg`. MIT.
- **Demo content:** Generated locally by `src/app.js`: simple original geometric artwork and seeded pseudorandom noise. No photographs, personal data, external image downloads or image-generation service.
- **ZIP writer:** Original minimal ZIP32 STORE implementation using the standard ZIP record layout and CRC32 algorithm. No third-party runtime implementation copied.
- **Runtime dependencies:** None.
- **Development dependencies:** Playwright test runner, pinned by `package-lock.json`, Apache-2.0. Playwright-managed browsers carry their own upstream licenses. They are not shipped with the static app.
- **Need/context:** [Blender Artists thread](https://blenderartists.org/t/free-tool-to-reduce-a-folder-structure-of-images-to-a-target-filesize/1482025), read during implementation; [Photoshop Reddit thread](https://www.reddit.com/r/photoshop/comments/v9gnaz/), provided as context but inaccessible during implementation.
- **Related products:** ImgTweak, Pixsoma and IrfanView are prior/related tools, not affiliated with this project. SpecFit claims workflow convenience, not invention or superiority.

No user images were used during development. Synthetic fixture JPEGs in browser tests are generated at test time; EXIF segments are constructed for orientation validation.
