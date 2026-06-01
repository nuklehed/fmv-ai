# Assessments are discrete evaluation events, not HCP record updates

An Assessment is a discrete evaluation event tied to an HCP master record — it is not an edit or update of another Assessment. Each Assessment has its own lifecycle and score. When an assessment expires or is rejected, the BU creates a new Assessment linked to the same HCP rather than modifying the old one. This keeps audit trails clean: every Assessment is a self-contained decision event with immutable data once finalized.

**Considered Options:**
- Update existing HCP record in place (simpler but loses historical evaluation context)
- Create new Assessment per evaluation (chosen — preserves full history and audit trail)

**Consequences:** The UI must show an HCP's assessment history as a list of discrete events, not a single evolving record. Renewals are explicit new submissions rather than "re-opening" old ones.
