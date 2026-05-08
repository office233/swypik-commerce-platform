const { execSync } = require('child_process');

const envs = {
  SHOPIFY_CLIENT_ID: "869fa8fec04ff9bc94033e028d8fd8ad",
  SHOPIFY_CLIENT_SECRET: "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",
  SHOPIFY_STORE: "uns3hp-cc.myshopify.com",
  SHOPIFY_STORE_HANDLE: "uns3hp-cc",
  OPENROUTER_API_KEY: "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",
  OPENROUTER_MODEL: "google/gemini-2.0-flash-001",
  DATABASE_URL: "postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require",
  DATABASE_SSL: "false",
  SHOPIFY_STOREFRONT_ACCESS_TOKEN: "e93f8b4ff945503d928d923253ea2232"
};

for (const [key, value] of Object.entries(envs)) {
  try {
    console.log(`Pushing ${key}...`);
    // Need to use powershell or bash. Since it's node on windows, use powershell echo.
    // However, it's safer to just write to a temp file and read it or just use simple cmd.
    execSync(`echo | set /p="${value}" | npx vercel env rm ${key} production -y`, { stdio: 'ignore' }).catch(() => {});
  } catch(e) {}
  
  try {
    // using cmd.exe: echo | set /p="VALUE" does not add a newline!
    // But since `echo value | npx vercel env add` works in pwsh... let's just use execSync with pwsh
    execSync(`powershell -Command "Write-Output '${value}' | npx vercel env add ${key} production"`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`Failed to push ${key}:`, err.message);
  }
}
console.log("Done!");
