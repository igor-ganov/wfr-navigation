# @web-file-reader/navigation

Headless Lit paging controls for [web-file-reader](https://github.com/igor-ganov/web-file-reader).

`<wfr-viewer-nav>` renders accessible prev/next buttons that fade in on hover, tap or focus over a `target` element and auto-hide after `hideDelay` ms of inactivity. Left/Right arrow keys page while the target is active. It emits bubbling, composed `wfr-prev` / `wfr-next` events — the host owns the actual paging logic (see `@web-file-reader/core` paging helpers).

## Usage

```ts
import '@web-file-reader/navigation';

const nav = document.querySelector('wfr-viewer-nav');
nav.target = viewerElement;     // activity source (defaults to parent)
nav.canPrev = true;
nav.canNext = true;
nav.addEventListener('wfr-next', () => goToNextFile());
```

## Customize

- **Slots**: `prev`, `next` (button contents).
- **Parts**: `nav`, `prev`, `next`.
- **Custom properties**: `--wfr-nav-gap`, `--wfr-nav-fade`, `--wfr-nav-disabled-opacity`, `--wfr-focus-outline`.

Respects `prefers-reduced-motion` (no fade transition).

## License

MIT © Igor Ganov
