/**
 * GSSoC Leaderboard Contributor Extractor
 * 
 * Usage:
 *   node scripts/extract_gssoc.js [count]
 * 
 * Example:
 *   node scripts/extract_gssoc.js 500    (Extracts top 500 contributors)
 *   node scripts/extract_gssoc.js 1000   (Extracts top 1000 contributors)
 */

const fs = require('fs');
const path = require('path');

const targetCount = parseInt(process.argv[2] || '500', 10);
const startPage = parseInt(process.argv[3] || '1', 10);
const PAGE_SIZE = 100;
const totalPagesNeeded = Math.ceil(targetCount / PAGE_SIZE);

async function extract() {
  console.log(`\n🚀 Extracting ${targetCount} GitHub contributors from GSSoC Leaderboard (Starting from page ${startPage})...`);

  const allUsernames = [];
  const rows = [['Rank', 'Username', 'Name', 'GitHub URL', 'LinkedIn URL', 'College', 'Score']];

  let currentRank = (startPage - 1) * PAGE_SIZE + 1;

  for (let page = startPage; page < startPage + totalPagesNeeded; page++) {
    process.stdout.write(`Fetching page ${page}... `);
    try {
      const res = await fetch(`https://gssoc.girlscript.org/api/leaderboard?page=${page}&limit=${PAGE_SIZE}`);
      if (!res.ok) {
        console.log(`Failed (HTTP ${res.status})`);
        break;
      }
      const data = await res.json();
      const participants = data.participants || [];

      for (const p of participants) {
        if (allUsernames.length >= targetCount) break;

        const username = p.github_user || (p.github_url ? p.github_url.split('/').pop() : null);
        if (username && !allUsernames.includes(username)) {
          allUsernames.push(username);
          rows.push([
            String(currentRank++),
            username,
            `"${(p.full_name || '').replace(/"/g, '""')}"`,
            p.github_url || `https://github.com/${username}`,
            p.linkedin_url || '',
            `"${(p.college || '').replace(/"/g, '""')}"`,
            String(p.score || 0)
          ]);
        }
      }

      console.log(`Done. (Total extracted so far: ${allUsernames.length})`);

      if (allUsernames.length >= targetCount) break;

      // Small delay to be polite to the server
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.log(`Error: ${err.message}`);
      break;
    }
  }

  // 1. Save TXT file for Direct Paste
  const txtPath = path.resolve(process.cwd(), 'gssoc_usernames.txt');
  fs.writeFileSync(txtPath, allUsernames.join('\n'), 'utf8');

  // 2. Save CSV file for Upload
  const csvPath = path.resolve(process.cwd(), 'gssoc_contributors.csv');
  const csvContent = rows.map((r) => r.join(',')).join('\n');
  fs.writeFileSync(csvPath, csvContent, 'utf8');

  console.log(`\n✅ Successfully extracted ${allUsernames.length} GitHub contributors!`);
  console.log(`📁 Files created:`);
  console.log(`   1. TXT (Direct Paste):  ${txtPath}`);
  console.log(`   2. CSV (File Upload):   ${csvPath}`);
  console.log(`\n👉 You can now paste the contents of "gssoc_usernames.txt" into GitFlow Manager dashboard!\n`);
}

extract().catch(console.error);
