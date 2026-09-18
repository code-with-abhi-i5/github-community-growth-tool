/**
 * GSSoC Complete Multi-Sheet Excel Exporter
 * 
 * Exports:
 * 1. Sheet "Mentors" - 100% of Mentors (~200)
 * 2. Sheet "Project Admins" - 100% of Project Admins (~438)
 * 3. Sheet "Ambassadors" - 100% of Ambassadors (~3,799)
 * 4. Sheet "Top Contributors" - High active contributors (e.g. 5,000)
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('../backend/node_modules/xlsx');

const CONCURRENCY = 6;
const DELAY_BETWEEN_BATCHES_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(role, page, limit = 100, retries = 3) {
  const url = `https://gssoc.girlscript.org/api/leaderboard?role=${role}&page=${page}&limit=${limit}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        if (attempt === retries) return { participants: [], total: 0 };
        await sleep(400 * attempt);
        continue;
      }
      const data = await res.json();
      return data;
    } catch (err) {
      if (attempt === retries) {
        process.stdout.write(`[p${page} err] `);
        return { participants: [], total: 0 };
      }
      await sleep(400 * attempt);
    }
  }
  return { participants: [], total: 0 };
}

async function fetchRoleAll(roleName, roleQuery, maxPages = 100) {
  console.log(`\n📥 Fetching [${roleName}]...`);
  const firstData = await fetchPage(roleQuery, 1, 100);
  const total = firstData.total || 0;
  console.log(`   Total reported by GSSoC: ${total}`);

  let allParticipants = [...(firstData.participants || [])];
  const totalPages = Math.min(Math.ceil(total / 100), maxPages);

  console.log(`   Total pages to fetch: ${totalPages}`);

  for (let p = 2; p <= totalPages; p += CONCURRENCY) {
    const batchPages = [];
    for (let i = 0; i < CONCURRENCY && p + i <= totalPages; i++) {
      batchPages.push(p + i);
    }

    process.stdout.write(`   Fetching pages ${batchPages.join(', ')} / ${totalPages}... `);
    const batchResults = await Promise.all(batchPages.map(page => fetchPage(roleQuery, page, 100)));
    
    let added = 0;
    for (const res of batchResults) {
      if (res.participants && res.participants.length > 0) {
        allParticipants.push(...res.participants);
        added += res.participants.length;
      }
    }
    console.log(`Done (+${added}, Total: ${allParticipants.length})`);
    await sleep(DELAY_BETWEEN_BATCHES_MS);
  }

  return formatRows(allParticipants);
}

function formatRows(participants) {
  return participants.map((p, idx) => ({
    'Rank': p.rank || (idx + 1),
    'Full Name': p.full_name || '',
    'GitHub Username': p.github_user || (p.github_url ? p.github_url.split('/').filter(Boolean).pop() : ''),
    'GitHub URL': p.github_url || '',
    'LinkedIn URL': p.linkedin_url || '',
    'College / Institute': p.college || '',
    'City': p.city || '',
    'Role': p.your_role || (p.roles ? p.roles.join(', ') : ''),
    'Score': p.displayScore || p.score || 0,
    'Tech Stack': Array.isArray(p.tech_stack) ? p.tech_stack.join(', ') : (p.tech_stack || ''),
    'Tracks': Array.isArray(p.tracks) ? p.tracks.join(', ') : (p.tracks || ''),
  }));
}

async function main() {
  const t0 = Date.now();
  console.log('====================================================');
  console.log('🚀 GSSoC Comprehensive Multi-Sheet Excel Exporter');
  console.log('====================================================');

  const maxContributorPages = parseInt(process.argv[2] || '500', 10); // Fetch all contributors (up to 50,000)

  // 1. Mentors (~200 records, ~2-3 pages)
  const mentors = await fetchRoleAll('Mentors', 'mentor', 5);

  // 2. Project Admins (~438 records, ~5 pages)
  const projectAdmins = await fetchRoleAll('Project Admins', 'project_admin', 10);

  // 3. Ambassadors (~3,799 records, ~39 pages)
  const ambassadors = await fetchRoleAll('Ambassadors', 'ambassador', 45);

  // 4. Contributors (ALL contributors in GSSoC)
  console.log(`\n📌 Contributors: Fetching ALL contributors (up to ${maxContributorPages * 100})...`);
  const contributors = await fetchRoleAll('Contributors', 'contributor', maxContributorPages);

  console.log('\n📊 Summary of collected records:');
  console.log(`   - Mentors:        ${mentors.length}`);
  console.log(`   - Project Admins: ${projectAdmins.length}`);
  console.log(`   - Ambassadors:    ${ambassadors.length}`);
  console.log(`   - Contributors:   ${contributors.length}`);
  console.log(`   - TOTAL:          ${mentors.length + projectAdmins.length + ambassadors.length + contributors.length}`);

  console.log('\n📝 Building Multi-Sheet Excel Workbook...');
  const wb = xlsx.utils.book_new();

  // Add sheets
  const wsMentors = xlsx.utils.json_to_sheet(mentors);
  xlsx.utils.book_append_sheet(wb, wsMentors, 'Mentors');

  const wsAdmins = xlsx.utils.json_to_sheet(projectAdmins);
  xlsx.utils.book_append_sheet(wb, wsAdmins, 'Project Admins');

  const wsAmbassadors = xlsx.utils.json_to_sheet(ambassadors);
  xlsx.utils.book_append_sheet(wb, wsAmbassadors, 'Ambassadors');

  const wsContributors = xlsx.utils.json_to_sheet(contributors);
  xlsx.utils.book_append_sheet(wb, wsContributors, 'Contributors');

  const outputPath = path.resolve(process.cwd(), 'GSSoC_All_Data_Complete.xlsx');
  try {
    xlsx.writeFile(wb, outputPath);
  } catch (err) {
    if (err.code === 'EBUSY') {
      const fallbackPath = path.resolve(process.cwd(), `GSSoC_All_Data_${Date.now()}.xlsx`);
      console.log(`⚠️ Original file is open/locked in another program. Saving to: ${fallbackPath}`);
      xlsx.writeFile(wb, fallbackPath);
    } else {
      throw err;
    }
  }

  const durationSec = Math.round((Date.now() - t0) / 1000);
  console.log(`\n🎉 SUCCESS! Excel workbook saved at:`);
  console.log(`📁 ${outputPath}`);
  console.log(`⏱️ Completed in ${durationSec} seconds.\n`);
}

main().catch(console.error);
