#!/usr/bin/env node
/**
 * vercel-mcp-write
 *
 * MCP server local com tools de ESCRITA para Vercel.
 * Complementa o MCP oficial (https://mcp.vercel.com), que é read-only.
 *
 * Setup:
 *   1. cd vercel-mcp-write && npm install
 *   2. Gere um Personal Access Token em https://vercel.com/account/tokens
 *      (escopo "Full Account" ou pelo menos "Read+Write" no time específico)
 *   3. Adicione em ~/.vercel-mcp-write.env (NUNCA commitar):
 *        VERCEL_TOKEN=v1...
 *        VERCEL_TEAM_ID=team_WjomvXOsJobFLd8fcd68mNIf
 *   4. Adicione ao seu mcp.json do Cowork (caminho exato abaixo):
 *        {
 *          "mcpServers": {
 *            "vercel-write": {
 *              "command": "node",
 *              "args": ["C:\\Users\\andre\\Downloads\\claude\\Instal-supa\\supabase\\vercel-mcp-write\\server.mjs"],
 *              "env": {
 *                "VERCEL_TOKEN": "v1...",
 *                "VERCEL_TEAM_ID": "team_WjomvXOsJobFLd8fcd68mNIf"
 *              }
 *            }
 *          }
 *        }
 *
 * Tools expostas:
 *   - redeploy_deployment        (rebuild/redeploy um deployment existente)
 *   - promote_deployment         (promove um deploy a production = rollback rápido)
 *   - create_env_var             (cria env var num projeto)
 *   - update_env_var             (atualiza valor de env existente)
 *   - delete_env_var             (apaga env var)
 *   - list_env_vars              (lista envs de um projeto — útil para conferir o que está lá)
 *   - delete_deployment          (apaga um deployment específico — útil para limpar tentativas erradas)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Vercel } from "@vercel/sdk";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const TOKEN = process.env.VERCEL_TOKEN;
const TEAM_ID = process.env.VERCEL_TEAM_ID;

if (!TOKEN) {
  console.error("ERROR: VERCEL_TOKEN env var is required");
  process.exit(1);
}

const vercel = new Vercel({ bearerToken: TOKEN });

// Direct REST API fallback — some SDK methods return undefined or don't exist
async function vercelFetch(path, options = {}) {
  const url = new URL(`https://api.vercel.com${path}`);
  if (TEAM_ID && !url.searchParams.has("teamId")) {
    url.searchParams.set("teamId", TEAM_ID);
  }
  const resp = await fetch(url.toString(), {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await resp.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!resp.ok) {
    throw new Error(
      `Vercel API ${options.method || "GET"} ${path} → ${resp.status} ${resp.statusText}: ${JSON.stringify(body)}`,
    );
  }
  return { status: resp.status, ...body };
}

// ─────────────────────────────────────────────────────────────
// Definição das tools
// ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "redeploy_deployment",
    description:
      "Rebuild and redeploy an existing Vercel deployment by ID or URL. " +
      "Useful when you want to retry a failed build or force a fresh build from the same commit.",
    inputSchema: {
      type: "object",
      required: ["deploymentId"],
      properties: {
        deploymentId: {
          type: "string",
          description: "Deployment ID (dpl_...) or hostname",
        },
        target: {
          type: "string",
          enum: ["production", "staging"],
          description: "Deployment target. Defaults to keeping the original.",
        },
      },
    },
  },
  {
    name: "promote_deployment",
    description:
      "Promote a specific deployment to the project's production alias. " +
      "Use for emergency rollback when production breaks: find the last-known-good deployment and promote it.",
    inputSchema: {
      type: "object",
      required: ["projectId", "deploymentId"],
      properties: {
        projectId: { type: "string", description: "Project ID (prj_...)" },
        deploymentId: { type: "string", description: "Deployment ID (dpl_...)" },
      },
    },
  },
  {
    name: "create_env_var",
    description:
      "Create a new environment variable in a Vercel project. " +
      "Specify which environments (production/preview/development) it applies to.",
    inputSchema: {
      type: "object",
      required: ["projectId", "key", "value", "target"],
      properties: {
        projectId: { type: "string", description: "Project ID (prj_...)" },
        key: { type: "string", description: "Variable name, e.g. CS_INTEGRATION_TOKEN" },
        value: { type: "string", description: "Variable value (will be encrypted at rest)" },
        target: {
          type: "array",
          items: { type: "string", enum: ["production", "preview", "development"] },
          description: "Environments this variable applies to",
        },
        type: {
          type: "string",
          enum: ["plain", "encrypted", "sensitive"],
          description: "Storage type. Defaults to 'encrypted'.",
        },
      },
    },
  },
  {
    name: "update_env_var",
    description: "Update an existing environment variable's value.",
    inputSchema: {
      type: "object",
      required: ["projectId", "envId", "value"],
      properties: {
        projectId: { type: "string" },
        envId: { type: "string", description: "Env var ID (env_...) — get from list_env_vars" },
        value: { type: "string" },
        target: {
          type: "array",
          items: { type: "string", enum: ["production", "preview", "development"] },
        },
      },
    },
  },
  {
    name: "delete_env_var",
    description: "Delete an environment variable from a project.",
    inputSchema: {
      type: "object",
      required: ["projectId", "envId"],
      properties: {
        projectId: { type: "string" },
        envId: { type: "string" },
      },
    },
  },
  {
    name: "list_env_vars",
    description:
      "List all environment variables in a project. Returns names, IDs, and target environments — does NOT return decrypted values for encrypted vars.",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: {
        projectId: { type: "string" },
        decrypt: {
          type: "boolean",
          description: "Whether to return decrypted values (requires elevated token scope).",
        },
      },
    },
  },
  {
    name: "delete_deployment",
    description: "Delete a specific deployment. Cannot delete the current production deployment.",
    inputSchema: {
      type: "object",
      required: ["deploymentId"],
      properties: {
        deploymentId: { type: "string" },
      },
    },
  },
  {
    name: "list_tokens",
    description:
      "List all Vercel Personal Access Tokens of the authenticated user. " +
      "Useful to find a token ID for revocation. Values are never returned.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "revoke_token",
    description:
      "Revoke a Vercel Personal Access Token by its ID (auth_xxx). Use list_tokens first to discover the ID. " +
      "Once revoked, any process using that token loses access immediately.",
    inputSchema: {
      type: "object",
      required: ["tokenId"],
      properties: {
        tokenId: { type: "string", description: "Token ID (auth_...) from list_tokens" },
      },
    },
  },
  {
    name: "git_commit_push",
    description:
      "Runs `git add <files> && git commit -m <message> && git push origin <branch>` in a local working directory. " +
      "Requires git to be installed and the working directory to be a valid git repo with a configured remote and credentials. " +
      "Returns stdout/stderr of each step. Use this to trigger a deploy when the auto-deploy from GitHub is configured.",
    inputSchema: {
      type: "object",
      required: ["workdir", "files", "message"],
      properties: {
        workdir: {
          type: "string",
          description: "Absolute path to the git working directory (e.g. C:\\Users\\andre\\Downloads\\claude\\Instal-supa\\supabase)",
        },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Files to stage (relative to workdir). Use ['.'] to stage everything (dangerous).",
        },
        message: { type: "string", description: "Commit message" },
        branch: {
          type: "string",
          description: "Branch to push. Defaults to 'main'.",
        },
        allowEmpty: {
          type: "boolean",
          description: "If true, runs `git commit --allow-empty` to force a commit even with no changes.",
        },
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────
// Implementação
// ─────────────────────────────────────────────────────────────

async function callTool(name, args) {
  const teamId = TEAM_ID; // sempre passar o team

  switch (name) {
    case "redeploy_deployment": {
      // POST /v13/deployments com deploymentId → rebuild do mesmo SHA
      const result = await vercelFetch(`/v13/deployments`, {
        method: "POST",
        body: JSON.stringify({
          name: "redeploy",
          deploymentId: args.deploymentId,
          target: args.target || "production",
        }),
      });
      return result;
    }

    case "promote_deployment": {
      // POST /v10/projects/{projectId}/promote/{deploymentId} — retorna 201 sem body
      const result = await vercelFetch(
        `/v10/projects/${args.projectId}/promote/${args.deploymentId}`,
        { method: "POST" },
      );
      return { promoted: true, deploymentId: args.deploymentId, ...result };
    }

    case "create_env_var": {
      const result = await vercel.projects.createProjectEnv({
        teamId,
        idOrName: args.projectId,
        requestBody: {
          key: args.key,
          value: args.value,
          type: args.type || "encrypted",
          target: args.target,
        },
      });
      return result;
    }

    case "update_env_var": {
      const result = await vercel.projects.editProjectEnv({
        teamId,
        idOrName: args.projectId,
        id: args.envId,
        requestBody: {
          value: args.value,
          target: args.target,
        },
      });
      return result;
    }

    case "delete_env_var": {
      const result = await vercel.projects.removeProjectEnv({
        teamId,
        idOrName: args.projectId,
        id: args.envId,
      });
      return result;
    }

    case "list_env_vars": {
      const result = await vercel.projects.filterProjectEnvs({
        teamId,
        idOrName: args.projectId,
        decrypt: args.decrypt ? "true" : undefined,
      });
      return result;
    }

    case "delete_deployment": {
      const result = await vercel.deployments.deleteDeployment({
        teamId,
        id: args.deploymentId,
      });
      return result;
    }

    case "list_tokens": {
      const url = "https://api.vercel.com/v5/user/tokens";
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const body = await resp.json();
      if (!resp.ok) {
        throw new Error(`Vercel API GET /v5/user/tokens -> ${resp.status}: ${JSON.stringify(body)}`);
      }
      return body;
    }

    case "revoke_token": {
      const url = `https://api.vercel.com/v3/user/tokens/${encodeURIComponent(args.tokenId)}`;
      const resp = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const text = await resp.text();
      let body;
      try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
      if (!resp.ok) {
        throw new Error(`Vercel API DELETE /v3/user/tokens/${args.tokenId} -> ${resp.status}: ${JSON.stringify(body)}`);
      }
      return { revoked: true, tokenId: args.tokenId, ...body };
    }

    case "git_commit_push": {
      const workdir = args.workdir;
      if (!workdir || !existsSync(workdir)) {
        throw new Error(`workdir nao existe ou nao foi fornecido: ${workdir}`);
      }
      if (!existsSync(`${workdir}/.git`)) {
        throw new Error(`workdir nao e um repositorio git: ${workdir}/.git nao existe`);
      }
      const files = Array.isArray(args.files) ? args.files : [];
      if (files.length === 0) {
        throw new Error("files vazio. Para stage tudo, passe ['.'] explicitamente.");
      }
      const message = args.message || "chore: commit via git_commit_push";
      const branch = args.branch || "main";

      const steps = [];
      const runGit = (gitArgs) => {
        try {
          const stdout = execFileSync("git", ["-C", workdir, ...gitArgs], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 60000,
          });
          steps.push({ cmd: `git ${gitArgs.join(" ")}`, ok: true, stdout: stdout.trim() });
          return stdout;
        } catch (err) {
          steps.push({
            cmd: `git ${gitArgs.join(" ")}`,
            ok: false,
            stdout: (err.stdout?.toString() || "").trim(),
            stderr: (err.stderr?.toString() || err.message).trim(),
            exitCode: err.status,
          });
          throw err;
        }
      };

      try {
        runGit(["status", "--short"]);
        runGit(["add", "--", ...files]);
        const commitArgs = ["commit", "-m", message];
        if (args.allowEmpty) commitArgs.splice(1, 0, "--allow-empty");
        runGit(commitArgs);
        runGit(["push", "origin", branch]);
        return {
          ok: true,
          branch,
          steps,
          summary: `Commit and push to origin/${branch} completed.`,
        };
      } catch (err) {
        return {
          ok: false,
          error: err.message,
          steps,
          hint: "Verifique credenciais git (Git Credential Manager no Windows ja deve cobrir) e se ha alteracoes para commitar.",
        };
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------
// MCP server boilerplate
// ---------------------------------------------------------------

const server = new Server(
  { name: "vercel-mcp-write", version: "0.2.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await callTool(name, args || {});
    const text =
      result === undefined || result === null
        ? `${name} completed (no response body)`
        : JSON.stringify(result, null, 2);
    return {
      content: [{ type: "text", text }],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `ERROR calling ${name}: ${err.message}\n${err.stack || ""}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("vercel-mcp-write ready on stdio");
