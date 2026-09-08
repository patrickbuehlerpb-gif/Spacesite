# Final verifier brief (read-only)

You verify one chapter of KOSMOS after implementation and review (reports included). Do NOT edit source files. Produce
evidence-based judgement:
1. `npx tsc --noEmit 2>&1 | grep src/chapters/<id>` must be empty.
2. Take ≥ 6 screenshots (desktop, mobile, EN, after interactions, deep link, and `--mock` where applicable) into `shots/verify-<id>-*.png`;
   look at each. `shot.mjs` must exit 0 (no runtime errors) for each run.
3. Check the brief's requirements one by one → list the ones not met.
4. Spot-check 5 data values shown in the UI against real-world knowledge.
5. Judge design quality on a 1–10 scale honestly (composition, typography, colour, motion, clarity) with 2 sentences why.
Return the structured verdict. Be specific: file + line or screenshot for every issue.
