import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTsModule(relativePath, stubs = {}) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  const localRequire = (id) => {
    if (id in stubs) return stubs[id];
    return require(id);
  };

  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: localRequire,
    process,
    URL,
    console,
  });

  return module.exports;
}

const upload = loadTsModule("lib/video/upload-session.ts");

const normalized = upload.normalizeCreatorUploadInput({
  creatorId: "creator_1",
  productId: " product_1 ",
  title: " Demo clip ",
  caption: "Super oferta #Tech #tech #Casa-Mare",
  hashtags: " #manual, viral demo ",
  filename: "../camera final.MOV",
  contentType: "video/quicktime",
  sizeBytes: 42_000,
  source: "mobile_capture",
});

assert.equal(normalized.filename, "camera final.MOV");
assert.equal(normalized.contentType, "video/quicktime");
assert.equal(normalized.title, "Demo clip");
assert.equal(JSON.stringify(normalized.hashtags), JSON.stringify(["tech", "casa-mare", "manual", "viral", "demo"]));
assert.equal(JSON.stringify(normalized.productRefs), JSON.stringify([{ product_id: "product_1", source: "creator_upload" }]));
assert.equal(normalized.metadata.source, "mobile_capture");

assert.throws(
  () =>
    upload.normalizeCreatorUploadInput({
      creatorId: "creator_1",
      filename: "still.png",
      contentType: "image/png",
      sizeBytes: 1,
    }),
  /contentType must be a video type/,
);

const payload = upload.buildProcessVideoJobPayload({
  jobId: "job_1",
  uploadId: "upload_1",
  videoId: "video_1",
  assetId: "asset_1",
  creatorId: "creator_1",
  productId: "product_1",
  bucket: "media",
  sourceKey: "videos/raw/upload_1/camera.mov",
  sourceUrl: "https://cdn.example.test/videos/raw/upload_1/camera.mov",
  contentType: "video/quicktime",
  byteSize: 42_000,
  metadata: { title: "Demo clip", hashtags: ["tech"] },
});

assert.equal(payload.job_type, "process_video");
assert.equal(payload.job_id, "job_1");
assert.equal(payload.video_id, "video_1");
assert.equal(payload.asset_id, "asset_1");
assert.equal(payload.source_key, "videos/raw/upload_1/camera.mov");
assert.equal(payload.object_key, "videos/raw/upload_1/camera.mov");
assert.equal(payload.output_prefix, "videos/hls/video_1");
assert.equal(payload.thumbnail_key, "videos/thumbnails/video_1.jpg");
assert.equal(payload.preview_key, "videos/previews/video_1.mp4");
assert.equal(payload.hls_master_key, "videos/hls/video_1/master.m3u8");
assert.equal(JSON.stringify(payload.metadata), JSON.stringify({ title: "Demo clip", hashtags: ["tech"] }));
