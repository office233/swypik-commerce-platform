#!/usr/bin/env node
/**
 * Genereaza 8 clipuri demo verticale (720x1280, ~8s, H.264+AAC) pentru feed-ul de lansare Swypik.
 * Ruleaza local cu ffmpeg (verificat pe Windows). Fallback: containerul worker de pe VPS are ffmpeg;
 * acolo schimba FONT in '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'.
 *
 * Output: scripts/seed-clips/out/clip-XX-*.mp4
 * Rulare: node scripts/seed-clips/generate-clips.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "out");
mkdirSync(OUT, { recursive: true });

// Font: Windows. Pe Linux (worker VPS) foloseste DejaVuSans-Bold.
const FONT = process.platform === "win32"
  ? "C\\:/Windows/Fonts/arialbd.ttf"
  : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

const DUR = 8; // secunde
const ACCENT = "0xF5A623";
const WHITE = "0xF2F2F2";
const GREY = "0xB8B8B8";

// Palete de fundal (dark premium, familia #0D0D0D) — variatii subtile per clip
const CLIPS = [
  { slug: "casti-wireless-pro", title: "Casti Wireless Pro", tag: "Sunet pur. Zero fire.", price: "199 lei", c: ["0x0D0D0D", "0x1A1208", "0x2B1D06"] },
  { slug: "smartwatch-active", title: "Smartwatch Active", tag: "Ritmul tau, masurat.", price: "349 lei", c: ["0x0D0D0D", "0x101820", "0x1C2430"] },
  { slug: "lampa-ambientala-led", title: "Lampa Ambientala LED", tag: "Lumina care respira.", price: "89 lei", c: ["0x0D0D0D", "0x14101E", "0x241A38"] },
  { slug: "rucsac-urban-25l", title: "Rucsac Urban 25L", tag: "Orasul, organizat.", price: "159 lei", c: ["0x0D0D0D", "0x101810", "0x1B2A1B"] },
  { slug: "boxa-portabila-bass", title: "Boxa Portabila Bass+", tag: "Petrecerea vine cu tine.", price: "129 lei", c: ["0x0D0D0D", "0x1C0E12", "0x30161E"] },
  { slug: "suport-telefon-auto", title: "Suport Telefon Auto", tag: "Drumul, fara griji.", price: "49 lei", c: ["0x0D0D0D", "0x121212", "0x22201A"] },
  { slug: "set-cabluri-fast-charge", title: "Set Cabluri Fast-Charge", tag: "Incarcare in viteza.", price: "39 lei", c: ["0x0D0D0D", "0x181104", "0x2E2008"] },
  { slug: "organizator-birou-bambus", title: "Organizator Birou Bambus", tag: "Ordine naturala.", price: "79 lei", c: ["0x0D0D0D", "0x141207", "0x26200E"] },
];

// alpha pentru fade in/out al unui element text intre t0..t1 (fade de 0.6s)
const fadeAlpha = (t0, t1) =>
  `if(lt(t,${t0}),0,if(lt(t,${t0 + 0.6}),(t-${t0})/0.6,if(lt(t,${t1 - 0.6}),1,if(lt(t,${t1}),(${t1}-t)/0.6,0))))`;

// escapare text pentru drawtext (virgule, doua puncte, apostrofuri)
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\\\\\'").replace(/:/g, "\\:").replace(/,/g, "\\,");

function buildFilter(clip) {
  const [c0, c1, c2] = clip.c;
  const title = esc(clip.title);
  const tag = esc(clip.tag);
  const price = esc(clip.price);
  // Scene: 1) titlu 0.4-4.2s  2) tagline 3.6-6.6s  3) pret + brand 5.4-8s
  const drawParts = [
    // linie accent decorativa care "respira"
    `drawbox=x=60:y=ih/2-2:w=iw-120:h=3:color=${ACCENT}@0.35:t=fill`,
    // Scena 1: titlu mare, urca usor
    `drawtext=fontfile='${FONT}':text='${title}':fontsize=72:fontcolor=${WHITE}:borderw=0:x=(w-text_w)/2:y=(h/2-160)-12*min(t\\,3):alpha='${fadeAlpha(0.4, 4.2)}'`,
    `drawtext=fontfile='${FONT}':text='NOU PE SWYPIK':fontsize=30:fontcolor=${ACCENT}:x=(w-text_w)/2:y=h/2-260:alpha='${fadeAlpha(0.8, 4.0)}'`,
    // Scena 2: tagline
    `drawtext=fontfile='${FONT}':text='${tag}':fontsize=52:fontcolor=${GREY}:x=(w-text_w)/2:y=h/2+60:alpha='${fadeAlpha(3.6, 6.6)}'`,
    // Scena 3: pret + CTA
    `drawtext=fontfile='${FONT}':text='${price}':fontsize=96:fontcolor=${ACCENT}:x=(w-text_w)/2:y=h/2+180+8*cos(2*PI*t):alpha='${fadeAlpha(5.4, 7.9)}'`,
    `drawtext=fontfile='${FONT}':text='Comanda acum pe Swypik':fontsize=34:fontcolor=${WHITE}:x=(w-text_w)/2:y=h-220:alpha='${fadeAlpha(5.8, 7.9)}'`,
  ].join(",");

  return [
    // fundal gradient animat + miscare lenta (crop panoramat) + vigneta
    `gradients=s=800x1424:c0=${c0}:c1=${c1}:c2=${c2}:nb_colors=3:speed=0.03:d=${DUR}:r=30`,
    `crop=720:1280:x='40+30*sin(2*PI*t/${DUR})':y='72+50*cos(2*PI*t/${DUR * 2})'`,
    drawParts,
    `vignette=PI/4.5`,
    `fade=t=in:st=0:d=0.5,fade=t=out:st=${DUR - 0.5}:d=0.5`,
    `format=yuv420p`,
  ].join(",");
}

// audio ambient discret: doua sinusuri joase mixate, cu fade
const AUDIO = `aevalsrc='0.05*sin(2*PI*110*t)+0.04*sin(2*PI*165*t)':s=44100:d=${DUR},afade=t=in:st=0:d=1,afade=t=out:st=${DUR - 1.2}:d=1.2`;

const results = [];
CLIPS.forEach((clip, i) => {
  const file = `clip-${String(i + 1).padStart(2, "0")}-${clip.slug}.mp4`;
  const outPath = join(OUT, file);
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", buildFilter(clip),
    "-f", "lavfi", "-i", AUDIO,
    "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k",
    "-t", String(DUR), "-movflags", "+faststart",
    outPath,
  ];
  process.stdout.write(`Generez ${file} ... `);
  execFileSync("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
  const sizeMB = (statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`OK (${sizeMB} MB)`);
  results.push({ file, sizeMB });
});

console.log("\nRezumat:");
results.forEach((r) => console.log(`  ${r.file}  ${r.sizeMB} MB`));
if (!results.every((r) => existsSync(join(OUT, r.file)))) process.exit(1);
