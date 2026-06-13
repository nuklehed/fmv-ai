/**
 * Seed script: FMV HCP Tiers Criteria Set
 * 
 * Creates a complete criteria set with 10 questions and 51 answers
 * based on the fmv_hcp_tiers.xlsx data.
 * 
 * Run: npx tsx prisma/seeds/02-criteria-sets.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tenantId = 'tenant-001'

  // Check if criteria set already exists
  const existingCriteriaSet = await prisma.criteriaSet.findFirst({
    where: { name: 'FMV HCP Tiers' }
  })

  if (existingCriteriaSet) {
    console.log('⚠️  Criteria set "FMV HCP Tiers" already exists. Skipping.')
    return
  }

  // Create the criteria set
  const cs = await prisma.criteriaSet.create({
    data: {
      id: 'cs-fmv-tiers',
      name: 'FMV HCP Tiers',
      description: 'FMV HCP evaluation criteria set covering professional experience, roles, publications, and industry engagement',
      tenantId,
      isActive: true,
      systemPrompt: `You are an expert evaluator for FMV assessments of healthcare professionals. Review the provided CV carefully and select the best matching answer for each question based on the HCP's documented experience and credentials.`
    }
  })

  console.log(`✅ Created criteria set: "${cs.name}" (id: ${cs.id})`)

  // Create all questions
  const questions = [
    { id: '85977830-e6b4-5303-a871-9827606b433d', text: 'Years in Practice', order: 1 },
    { id: 'fd586457-dee9-5764-b257-92a4769b5d8a', text: 'Specialties', order: 2 },
    { id: '9f6d5116-fb30-5483-8f19-96387882188f', text: 'Professional Roles (Academic and Clinical)', order: 3 },
    { id: '3e365e20-0e10-5e7f-b786-f54c65570c04', text: 'Publications', order: 4 },
    { id: '7793206c-be5f-5d52-a889-6934107cb0b1', text: 'Journals', order: 5 },
    { id: 'af4f739a-2464-557b-84b7-4d30e75ac9da', text: 'Clinical Trials', order: 6 },
    { id: 'aa25b1e3-60dd-5d19-83d6-b1986cf42faa', text: 'Grant', order: 7 },
    { id: '20f5ef55-50cd-57bb-a15d-7d629576744e', text: 'Industry Speaking and Advisory Roles', order: 8 },
    { id: '96610f17-4dc7-5b46-ac94-18c88a598c43', text: 'Advisory Roles & Committees', order: 9 },
    { id: 'a0d586b5-d502-5bec-bd00-e81d52bdc867', text: 'Associations & Societies', order: 10 }
  ]

  await prisma.question.createMany({
    data: questions.map(q => ({
      ...q,
      criteriaSetId: cs.id
    }))
  })

  console.log(`✅ Created ${questions.length} questions`)

  // Create all answers
  const answers = [
    // Q1: Years in Practice
    { id: '198f38f2-e97e-58e5-8261-daf438cef33d', questionId: '85977830-e6b4-5303-a871-9827606b433d', text: '+20 years with at least 7 years being specific to relevant therapeutic area', score: 4, order: 1 },
    { id: 'af4a1426-d033-5262-8dd7-a689ff665e92', questionId: '85977830-e6b4-5303-a871-9827606b433d', text: '15-20 years with at least 7 years being specific to relevant therapeutic area', score: 3, order: 2 },
    { id: '86c7d411-4c41-5772-912a-f781dea2debc', questionId: '85977830-e6b4-5303-a871-9827606b433d', text: '10-15 years with at least 5 years being specific to relevant therapeutic area', score: 2, order: 3 },
    { id: 'd9ee23bc-09b2-5460-bbea-18f844ccd97f', questionId: '85977830-e6b4-5303-a871-9827606b433d', text: '5-10 years', score: 1, order: 4 },
    { id: 'dcc766b4-4f91-587e-bb7d-926510892b35', questionId: '85977830-e6b4-5303-a871-9827606b433d', text: 'Less than 5 years', score: 0, order: 5 },

    // Q2: Specialties
    { id: '41b04d17-ba82-5f35-97cd-4384146b4946', questionId: 'fd586457-dee9-5764-b257-92a4769b5d8a', text: 'Multiple Board Certifications or Licensures', score: 4, order: 1 },
    { id: '1bd623c2-9b10-5e83-95e9-b383c097df78', questionId: 'fd586457-dee9-5764-b257-92a4769b5d8a', text: 'Licensed or Board Certified in Specialty', score: 3, order: 2 },
    { id: '50ac2798-1a07-5dde-ae3a-a128b14b6f58', questionId: 'fd586457-dee9-5764-b257-92a4769b5d8a', text: 'Non-Licensed and Non-Board Certified in Specialty', score: 1, order: 3 },

    // Q3: Professional Roles (Academic and Clinical)
    { id: '6c97de1e-16e9-585e-a101-53aa26e1b793', questionId: '9f6d5116-fb30-5483-8f19-96387882188f', text: 'Department chair at a nationally leading organization: teaching hospital, research institutions, academic center, specialty care facility, or medical center', score: 4, order: 1 },
    { id: 'ae45bc80-46b0-5e1b-94f3-49ed681063b5', questionId: '9f6d5116-fb30-5483-8f19-96387882188f', text: 'Department chair at medical school or university', score: 3, order: 2 },
    { id: '2206bb68-66d0-50a8-93d5-4d216853fb50', questionId: '9f6d5116-fb30-5483-8f19-96387882188f', text: 'Partner in large (more than 4 partners) medical practice with area of focus including relevant therapeutic areas', score: 3, order: 3 },
    { id: 'e26dd581-60c9-5658-8494-53d56d5a390d', questionId: '9f6d5116-fb30-5483-8f19-96387882188f', text: 'Department chair/head at a teaching hospital, academic center, specialty care facility, or medical center (organizations not considered nationally leading)', score: 3, order: 4 },
    { id: '91815970-b74f-5193-9318-a4b9a2cb40eb', questionId: '9f6d5116-fb30-5483-8f19-96387882188f', text: 'Full, associate or assistant professor medical school or university', score: 3, order: 5 },
    { id: 'd9a1094a-cdf1-5f4a-b4cc-631feabc686c', questionId: '9f6d5116-fb30-5483-8f19-96387882188f', text: 'Full-time staff physician at nationally leading organization, teaching hospital, research institutions, academic center, specialty care facility, or medical center', score: 3, order: 6 },
    { id: '9b7be459-4b3f-52e3-a4b4-fd95c4cb171e', questionId: '9f6d5116-fb30-5483-8f19-96387882188f', text: 'Department head or lead at large regional hospital or regionally leading research institute', score: 2, order: 7 },
    { id: '408336b0-d75a-5fab-a0a3-eacbd5fe72c9', questionId: '9f6d5116-fb30-5483-8f19-96387882188f', text: 'Partner in small (4 or less partners) or solo medical practice with area of focus including relevant therapeutic areas', score: 2, order: 8 },
    { id: '448aa110-0451-5672-b3d9-d0882068666f', questionId: '9f6d5116-fb30-5483-8f19-96387882188f', text: 'Full-time staff physician at teaching hospital, academic center, specialty care facility, or medical center (org is not considered nationally leading)', score: 2, order: 9 },
    { id: '7800a0ad-ed88-539f-b7b4-ddd4b6730034', questionId: '9f6d5116-fb30-5483-8f19-96387882188f', text: 'Full-time staff physician at a hospital or research institute', score: 1, order: 10 },
    { id: 'e0c872f6-8994-5dd3-9ace-e4b0b9dfb7eb', questionId: '9f6d5116-fb30-5483-8f19-96387882188f', text: 'Member of HCP practice with area of focus including relevant therapeutic areas', score: 1, order: 11 },
    { id: 'cf7207e3-6c37-592c-8776-fc1ba851217e', questionId: '9f6d5116-fb30-5483-8f19-96387882188f', text: 'Senior lecturer/adunct professor at medical school or university', score: 1, order: 12 },

    // Q4: Publications
    { id: 'b0c50d8a-2956-57d2-8b8c-8bf41b52183d', questionId: '3e365e20-0e10-5e7f-b786-f54c65570c04', text: '10 or more published articles in the past 7 years in leading/top medical journals', score: 4, order: 1 },
    { id: '04581a4e-8841-59c4-92d7-0d6176c9d421', questionId: '3e365e20-0e10-5e7f-b786-f54c65570c04', text: '5-9 published articles in leading journal, at least one published the past 7 years', score: 3, order: 2 },
    { id: 'f45263a1-85ae-5ecd-985f-c485577ea298', questionId: '3e365e20-0e10-5e7f-b786-f54c65570c04', text: '1-4 articles published in leading journal, at least one published the past 7 years', score: 2, order: 3 },
    { id: 'c6da2d2c-a823-521d-8ccb-493325a63282', questionId: '3e365e20-0e10-5e7f-b786-f54c65570c04', text: 'Author/coauthor of textbook for relevant therapeutic areas', score: 2, order: 4 },
    { id: '907d8c28-1512-523c-96a2-8ed2c3c7d3ed', questionId: '3e365e20-0e10-5e7f-b786-f54c65570c04', text: 'Author for a chapter(s) in textbook for relevant therapeutic areas', score: 1, order: 5 },

    // Q5: Journals
    { id: '0233c0b4-b6ae-51fd-a156-2f697442047c', questionId: '7793206c-be5f-5d52-a889-6934107cb0b1', text: 'Editor of leading national medical journal in the past 7 years', score: 4, order: 1 },
    { id: '701f91a3-8468-5acf-8dc3-a4cfce957cfd', questionId: '7793206c-be5f-5d52-a889-6934107cb0b1', text: 'Deputy editor or editorial board member of a leading journal in the past 7 years', score: 4, order: 2 },
    { id: 'ed3f2ac4-bb53-5591-a626-0793aeeed6c2', questionId: '7793206c-be5f-5d52-a889-6934107cb0b1', text: 'Associate editor of a leading journal or Steering Committee member for 5 or more multi-centered clinical trials (at least 2 in the past 7 years)', score: 3, order: 3 },

    // Q6: Clinical Trials
    { id: '114144f0-2957-597b-8f8b-a414c9b0b051', questionId: 'af4f739a-2464-557b-84b7-4d30e75ac9da', text: 'Coordinating Principal Investigator or Institutional Review Board for clinical trials', score: 3, order: 1 },
    { id: '20fa0fba-dc1c-5e6d-aed8-c06fa13706f1', questionId: 'af4f739a-2464-557b-84b7-4d30e75ac9da', text: 'Member Data Safety Monitoring Board or Institutional Review Board for clinical trials (at least 2 in the past 7 years)', score: 3, order: 2 },
    { id: '33db111d-b218-5c2f-8859-746172f2e873', questionId: 'af4f739a-2464-557b-84b7-4d30e75ac9da', text: 'Site level Principal Investigator of 1-4 multi-centered clinical trials (at least 2 in the past 7 years)', score: 2, order: 3 },
    { id: '1eacb144-5a62-5832-961b-4077834e7697', questionId: 'af4f739a-2464-557b-84b7-4d30e75ac9da', text: 'Sub-level Investigator for at least 5 clinical trials (at least 1 in the past 7 years)', score: 1, order: 4 },
    { id: '5e9fff2a-b6b0-5d2b-972e-1b2f60ecd23e', questionId: 'af4f739a-2464-557b-84b7-4d30e75ac9da', text: 'Sub-level Investigator for at least 2-4 clinical trials (at least 1 in the past 7 years)', score: 1, order: 5 },

    // Q7: Grant
    { id: '3913beca-e172-5977-a467-9bf03780e786', questionId: 'aa25b1e3-60dd-5d19-83d6-b1986cf42faa', text: 'Recipient of at least 1 NIH or other government research grants over career', score: 3, order: 1 },
    { id: '611750c7-0464-531b-a2e5-cabc29ebd0e4', questionId: 'aa25b1e3-60dd-5d19-83d6-b1986cf42faa', text: 'Recipient of 5-9 NIH or other government research grants over career', score: 1, order: 2 },

    // Q8: Industry Speaking and Advisory Roles
    { id: '2608ca5e-4936-56e1-ad65-f715fe93e3ba', questionId: '20f5ef55-50cd-57bb-a15d-7d629576744e', text: 'Spoke or chaired sessions at international or national conferences at least 5 times in the past 7 years (non-promotional speaking only)', score: 3, order: 1 },
    { id: '4195a9d9-cabb-5139-8e69-780c56f054e6', questionId: '20f5ef55-50cd-57bb-a15d-7d629576744e', text: 'Spoke or chaired sessions at international or national conferences 1-4 times in the past 7 years (non-promotional speaking only)', score: 1, order: 2 },
    { id: '8ef46de2-44c2-5206-83b2-6a6184ea9926', questionId: '20f5ef55-50cd-57bb-a15d-7d629576744e', text: 'Spoke at least 5 times in the past 7 years at local/regional CME events or other peer-attended events (may include poster sessions at such events, non-promotional speaking only and excluding grand rounds at own institution)', score: 1, order: 3 },
    { id: '4a3eae96-aa76-558a-9caa-b79a3ee7853a', questionId: '20f5ef55-50cd-57bb-a15d-7d629576744e', text: 'Invited lecturer at academic instructions at least 5 times in last 7 years', score: 3, order: 4 },

    // Q9: Advisory Roles & Committees
    { id: 'd78c31cb-bf7f-5a39-a799-f67c9352139a', questionId: '96610f17-4dc7-5b46-ac94-18c88a598c43', text: 'FDA adviser or adviser to other national or international treatment guidelines and/or regulatory issues in the past 7 years', score: 3, order: 1 },
    { id: 'bb08bc07-f3d1-5e64-96f6-db17146fd36d', questionId: '96610f17-4dc7-5b46-ac94-18c88a598c43', text: 'Committee Chair determining national treatment guidelines known hospital or health plan in the past 7 years', score: 2, order: 2 },
    { id: '9dd4fd3e-a9a2-5e71-8e5d-4fd8a6791f42', questionId: '96610f17-4dc7-5b46-ac94-18c88a598c43', text: 'Member of P&T Committee at a large internationally known hospital or health plan in the past 7 years', score: 2, order: 3 },
    { id: '1d18df20-4b88-5a80-845b-9800d1db793f', questionId: '96610f17-4dc7-5b46-ac94-18c88a598c43', text: 'Chair member of state or local medical advisory board in the past 7 years', score: 1, order: 4 },
    { id: 'b608b00f-5387-5782-9e17-b4cb017af08b', questionId: '96610f17-4dc7-5b46-ac94-18c88a598c43', text: 'Member of committee determining national or regional treatment guidelines and/or regulatory issues in the past 7 years', score: 1, order: 5 },
    { id: 'dc61793b-aec8-58f9-8413-36b184dd66d0', questionId: '96610f17-4dc7-5b46-ac94-18c88a598c43', text: 'Member of P&T Committee at a regional hospital or health plan in the past 7 years', score: 1, order: 6 },

    // Q10: Associations & Societies
    { id: 'c063aa10-0c82-5532-be6b-88846f9a4d40', questionId: 'a0d586b5-d502-5bec-bd00-e81d52bdc867', text: 'Leadership role of international or national medical associations or patient society in the past 7 years', score: 3, order: 1 },
    { id: '843f5345-dd86-5173-b50f-e1abc76030d9', questionId: 'a0d586b5-d502-5bec-bd00-e81d52bdc867', text: 'President / Chair or Medical Director of international or national medical association or patient society in the past 7 years', score: 2, order: 2 },
    { id: '6b0d866d-7b8d-5fa7-a1e4-39b8d3f931bf', questionId: 'a0d586b5-d502-5bec-bd00-e81d52bdc867', text: 'Management role in regional association or a regional chapter of a national association or patient society in the past 7 years', score: 2, order: 3 },
    { id: 'a304fd91-2ba0-5413-bf5c-e97aa394d5b6', questionId: 'a0d586b5-d502-5bec-bd00-e81d52bdc867', text: 'Recipient of an award from national medical associations recognizing high achievement of early career individuals', score: 2, order: 4 },
    { id: 'f29f6295-b85f-5c33-804c-4596366d2924', questionId: 'a0d586b5-d502-5bec-bd00-e81d52bdc867', text: 'President, Chair or Medical Director of regional medical society, parent society or a regional chapter of a national association in the past 7 years', score: 1, order: 5 },
    { id: '5fbbac6f-8031-5117-8b3a-4530facfc27f', questionId: 'a0d586b5-d502-5bec-bd00-e81d52bdc867', text: 'Society member for relevant therapeutic area medical association or patient society', score: 1, order: 6 }
  ]

  await prisma.answer.createMany({
    data: answers
  })

  console.log(`✅ Created ${answers.length} answers`)

  // Verify the created data
  const questionCount = await prisma.question.count({ where: { criteriaSetId: cs.id } })
  const answerCount = await prisma.answer.count({
    where: { question: { criteriaSetId: cs.id } }
  })

  console.log(`\n📋 Criteria Set Summary:`)
  console.log(`   Name: ${cs.name}`)
  console.log(`   Questions: ${questionCount}`)
  console.log(`   Answers: ${answerCount}`)
  console.log(`   Max Score: 35`)
  console.log(`\n✅ FMV HCP Tiers criteria set seeded successfully!`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => await prisma.$disconnect())
