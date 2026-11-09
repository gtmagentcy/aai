/**
 * What to change when journeys stop at a step: a plain fix and a prompt for the owner's coding
 * agent. Used by the dashboard ("Copy as prompt") and by the dashboard's MCP server.
 */
export const FIXES = {
  reach: {
    title: "Agents don't find you",
    fix: "Allow the user-triggered agents in robots.txt (ChatGPT-User, Claude-User, Perplexity-User), keep a sitemap, and put your facts in the HTML, not behind JavaScript.",
    prompt: "Audit this site's robots.txt, sitemap and server rendering for AI agents. Allow ChatGPT-User, Claude-User, Perplexity-User, OAI-SearchBot and Claude-SearchBot; keep training crawlers as the owner chooses. Make sure the home, pricing and product pages render their main text without JavaScript. List each change before you make it.",
  },
  understand: {
    title: "Agents arrive but don't learn what you do",
    fix: "Publish /llms.txt with what you do, for whom, and the one job an agent can finish here; link /openapi.json and /.well-known/mcp.json from it.",
    prompt: "Write /llms.txt for this product: one-sentence summary, who it is for, the core job an agent can finish, and links to /agents.md, /openapi.json and the MCP card. Use only facts from the codebase and the site; ask me for anything missing.",
  },
  rules: {
    title: "Agents read about you but not the rules",
    fix: "Publish /agents.md: what agents may do, what they may not, what needs the person's yes, and how to reach a human. Link it from llms.txt.",
    prompt: "Write /agents.md for this product using the AAI template (https://github.com/NetanelBaruch/aai/tree/main/templates): permitted actions, not permitted, ask-the-person-first, the endpoints, and a human contact. Link it from /llms.txt.",
  },
  act: {
    title: "Agents read the rules and then stop",
    fix: "Give the core job a door an agent can use: a form that posts plain HTML, a documented POST endpoint, or an MCP tool. No CAPTCHA on the agent path; ask for the person's approval instead.",
    prompt: "Add an agent-usable path for the core job: a JSON POST endpoint described in /openapi.json (and, if there is an MCP server, a tool with the same inputs). It must accept `approvedByUser: true`, never need a CAPTCHA, and return a receipt. Instrument it with the AAI action tap (taps/mcp.js, apiTap) so calls are counted.",
  },
  first_value: {
    title: "Agents act but the person gets nothing before an account",
    fix: "Return a real result with no login: a quote, a sandbox key, a draft, a cart. Mark that tool or endpoint as first value in the action tap.",
    prompt: "Find the smallest real result this product can give with no account (a sandbox key, a quote, a preview, a draft). Expose it as an MCP tool or endpoint that needs no login, and mark it as first value in the AAI action tap (`firstValue: [toolName]`).",
  },
  account: {
    title: "The person got value but didn't sign up",
    fix: "Hand a claim link (signup URL with aai_cid) in the first-value result, so the account keeps what the agent made. Count the signup with signup_from_agent.",
    prompt: "In every first-value tool result, include a claim link built with claimUrl(signupUrl, cid). On signup, read `aai_cid` from the URL or body, attach what the agent made to the new account, and call track('signup_from_agent', { cid }).",
  },
  activated: {
    title: "Accounts from agents don't get used",
    fix: "Decide the one action that means 'activated', track it with the same cid, and make sure the claimed work is waiting in the account.",
    prompt: "Define the activation event for this product and call track('activated', { cid }) where it happens. Check that a claimed account opens on the work the agent created.",
  },
};
