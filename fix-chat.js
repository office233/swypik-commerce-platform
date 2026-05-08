const fs = require('fs');
let content = fs.readFileSync('d:/Aicevrei/components/ChatInterface.tsx', 'utf8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  // Find lines with </section> followed by garbage
  if (lines[i].includes('</section>') && lines[i].includes('</section> py-3')) {
    // Cut everything after first </section>
    const idx = lines[i].indexOf('</section>');
    lines[i] = lines[i].substring(0, idx + '</section>'.length);
    console.log('Fixed line', i + 1);
  }
}

fs.writeFileSync('d:/Aicevrei/components/ChatInterface.tsx', lines.join('\n'));
const final = fs.readFileSync('d:/Aicevrei/components/ChatInterface.tsx', 'utf8');
const count = (final.match(/<\/section>/g) || []).length;
console.log('</section> count:', count, count === 1 ? '✅' : '⚠️');
