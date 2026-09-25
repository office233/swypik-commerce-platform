/**
 * Loader global pentru `next/image` (next.config.mjs → images.loaderFile).
 *
 * Imaginile NU mai trec prin optimizatorul serverului (`/_next/image` ar citi
 * bytes-ii de pe CDN și i-ar re-servi din aplicație — trafic plătit pe VM):
 *   - imagini de pe CDN-ul de media, cu NEXT_PUBLIC_MEDIA_IMAGE_TRANSFORM=cloudflare
 *     → Cloudflare Image Transformations pe domeniul de media
 *       (`/cdn-cgi/image/width=…,quality=…,format=auto/<cheie>`);
 *   - orice alt URL absolut → încărcat direct de browser, neschimbat;
 *   - fișiere locale din /public → servite static (cache CDN), cu `w` doar ca
 *     indiciu pentru srcset.
 */
type LoaderArgs = { src: string; width: number; quality?: number };

const DEFAULT_QUALITY = 75;

function mediaBase(): string {
    return (process.env.NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
}

function transformMode(): string {
    return (process.env.NEXT_PUBLIC_MEDIA_IMAGE_TRANSFORM || "").trim().toLowerCase();
}

export default function mediaImageLoader({ src, width, quality }: LoaderArgs): string {
    if (!/^https?:\/\//i.test(src)) {
        return `${src}${src.includes("?") ? "&" : "?"}w=${width}`;
    }
    const base = mediaBase();
    if (base && transformMode() === "cloudflare" && src.startsWith(`${base}/`)) {
        const key = src.slice(base.length + 1);
        return `${base}/cdn-cgi/image/width=${width},quality=${quality || DEFAULT_QUALITY},format=auto/${key}`;
    }
    return src;
}
