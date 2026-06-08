const UUID_PATTERN = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

function extractUuidPairsFromProse(text) {
  const results = [];

  // Pattern 4: Multi-line — Question UUID on one line, answer UUID in next ~300 chars
  console.log('=== Pattern 4 (multi-line) ===');
  const qHeaderPattern = /\*?\*?Question\s+([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g;
  let qm;
  while ((qm = qHeaderPattern.exec(text)) !== null) {
    const questionId = qm[1];
    if (results.some(r => r.questionId === questionId)) continue;
    
    const context = text.substring(qm.index, Math.min(qm.index + 300, text.length));
    // FIX: context already starts at qm.index, so use qm[0].length not qm.index + qm[0].length
    const afterQuestion = context.substring(qm[0].length);
    
    console.log('  Q:', questionId);
    console.log('  Context after Q (first 120 chars):', JSON.stringify(afterQuestion.substring(0, 120)));
    const answerUuids = afterQuestion.match(UUID_PATTERN);
    if (answerUuids && answerUuids.length > 0) {
      console.log('  Found answer UUIDs:', answerUuids);
      results.push({ questionId, answerId: answerUuids[0] });
    } else {
      console.log('  No answer UUID found');
    }
  }

  // Deduplicate
  const seen = new Set();
  return results.filter(r => { if (seen.has(r.questionId)) return false; seen.add(r.questionId); return true; });
}

const llmOutput = `Based on a careful review of Dr. Bransford's CV against the provided FMV evaluation criteria, here are the best-matching selections for each question:

**Question 85977830-e6b4-5303-a871-9827606b433d: Years in Practice**
- \`selectedAnswerId\`: \`198f38f2-e97e-58e5-8261-daf438cef33d\` (+20 years with excellent standing)

**Question 11111111-2222-3333-4444-555555555555: Research Output**
- \`selectedAnswerId\`: \`aaaa1111-bbbb-2222-cccc-333333333333\` (substantial contributions)`;

const results = extractUuidPairsFromProse(llmOutput);
console.log('\nFinal extracted pairs:', JSON.stringify(results, null, 2));

console.log('\nTest:');
console.log('  Q1 questionId matches?', results[0]?.questionId === '85977830-e6b4-5303-a871-9827606b433d' ? 'PASS' : 'FAIL');
console.log('  Q1 answerId matches?', results[0]?.answerId === '198f38f2-e97e-58e5-8261-daf438cef33d' ? 'PASS' : 'FAIL');
console.log('  Q2 questionId matches?', results[1]?.questionId === '11111111-2222-3333-4444-555555555555' ? 'PASS' : 'FAIL');
console.log('  Q2 answerId matches?', results[1]?.answerId === 'aaaa1111-bbbb-2222-cccc-333333333333' ? 'PASS' : 'FAIL');
