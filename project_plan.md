# Role
Act as a Senior Frontend Engineer specializing in **Vue 3**, **TypeScript**, and modern UI/UX design.

# Tech Stack Constraints
1. **Framework**: Vue 3 (Latest Stable)
2. **Language**: TypeScript (Strict mode enabled)
3. **Syntax**: Use `<script setup>` syntax exclusively (no Options API).
4. **Build Tool**: Vite
5. **State Management**: Pinia (preferred over Vuex)
6. **Routing**: Vue Router 4+
7. **Styling**: Tailwind CSS
8. **UI Library** (Optional): PrimeVue

# Coding Standards
1. **Composition API**: Use `ref`, `reactive`, `computed`, and `watch` appropriately. Prefer `ref` for primitives and `reactive` for objects unless reactivity is lost during destructuring.
2. **Type Safety**: 
   - Define interfaces/types for all props, emits, and store states.
   - Use `<script setup lang="ts">`.
   - No `any` types; use `unknown` if necessary with proper narrowing.
3. **Component Design**:
   - Keep components small and single-responsibility.
   - Use slots for flexible content distribution.
   - Use `defineProps` and `defineEmits` with type inference.
4. **Performance**:
   - Use `v-memo` or `computed` for expensive calculations.
   - Lazy load routes using dynamic imports (`() => import(...)`).
5. **Clean Code**:
   - Follow Vue Style Guide (https://vuejs.org/style-guide/).
   - Use meaningful component names (PascalCase).
   - Add JSDoc comments for complex logic.

# App Description
You are building a fair market value (FMV) app. 
FMV: the rate of pay an individual will be paid for participating in an engagement with a company - also known as honoraria. These HCP arrangements are typically between a themself and a pharmaceutical company, but there are other scenarios where this application could be a good fit. 
We will use the pharmaceutical to HCP scenario in this endeavor.
HCP: A healthcare professional (HCP) is an individual licensed, registered, or certified to provide health care services, including the diagnosis, treatment, and prevention of illness.  This role encompasses a wide range of practitioners such as physicians, nurses, dentists, pharmacists, and allied health workers who deliver care based on formal training and evidence-based medicine. They may work independently or as part of a team in various settings, including hospitals, clinics, and private practices, with the goal of promoting health and improving patient outcomes.
USERS: This app will have three types of users: Business User (BU), Administrator (Admin), Superadmin (SA). 
HCPs are unique and can only be in the system once - in the United States they can be tracked with an NPI number, State License ID, or similar. HCPs are not users of the system.
BUs can view all HCPs in the system. BUs can request a new assessment for a new HCP not currently in the system. New assessments are then queued and processed by the AI. 
ASSESSMENT: a brief form and containing basic HCP information and CV (or similar) PDF document. The app should convert the PDF to text and store. The text data will be sent to the AI along with criteria to use for analysis. See definition of CRITERIA.
CRITERIA: These are questions and answers maintained by the Admin or SA. Each question will have 1 or more answers. Each answer has a score with zero being the least. The AI will choose the best answer only. It can only pick one best answer for each question. Again, that answer will have a relative number of points which increment as the answer improves. E.g., an HCP with 1-5 years of experience may be +1 point, but an HCP with 6-10 years of experience will be +2 points. The Admin or SA will create the criteria, multiple choice answers, and points allocated to each answer.
The AI will process the CV text against the criteria in the background and change the status of the HCP assessment record when it has completed. e.g., AI Analysis Completed. Each selection by the AI should contain its rationale for making that selection. This information should be stored by the system.
The Admin or SA can open the record, review the AI selections of the criteria answers, and make changes - select another answer. Both the AI's original selections and the Admin or SA's overrides should be saved for future reference and auditing. The final step for the assessment will be when the Admin or SA approves the assessment. An Approved assessment will have an Approved status. The approval is typically good for 2 years (standard) but this should be a configurable setting in the application's settings - only the SA can change applicaiton settings. The Admin or SA can also reject a request with a reason. The BU can the make adjustments and resubmit. When the Admin or SA approve an assessment. They can also assign a tier and hourly rate for the HCP.
TIER: Tiers are ranked from 1 to typically 3. Tiers should be maintainable by the SA in the Application Configuration Settings. Each tier will have a low and high value for each HCP specialty in the system. E.g., Cariology: Tier 1) $800-1000, Tier 2) $600-800, Tier 3) $400-600. Tier is based on the final total score of criteria answers once approved. The relationship of total score to tier should be configurable in the application settings. 
If the total avaliable criteria points are 50, for example, an Admin/SA may make a business decision that a score of 1-20 is Tier 3, 21-40 is Tier 2, and 41-50 is a Tier 1 score. A score of 0 would require rejection.
Each tier is a range of rates and the system configuration should define the default  percentile of the range the system should suggest when presenting the recommended rate. The SA/Admin can override the rate with a required rationale.
A BU will receive a notification when their HCP's assessment is approved or rejected. 
The app's home page will show all HCPs in the system, searchable, sortable, and paginated. 
Business users (BUs) can login into the system and request an HCP assessment.
While BUs will see the HCPs they submitted only. Admins/SAs will see all HCPs in the system. Each HCP will appear in a table (first name, last name, identifier, state, specialty, tier, rate, status, effective date, renewal date, and actions)