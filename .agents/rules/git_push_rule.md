# Git Push and Website Deployment Approval Rule

Always ask for explicit user approval before executing `git push` or making live updates to GitHub and Vercel deployments.

## Directives
1. When code, styling, or database changes are ready, show the summary and changes to the user first.
2. Explicitly ask: "Would you like me to commit and push these changes to GitHub / update the live website now?"
3. Execute `git push` ONLY after receiving explicit user approval.
