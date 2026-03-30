#!/usr/bin/env node

/**
 * HappyClaw MCP Server: call_llm
 *
 * Provides a `call_llm` tool that calls OpenAI-compatible LLM APIs.
 *
 * Configuration via environment variables:
 *   LLM_PROVIDERS — JSON string of provider configs, e.g.:
 *   [
 *     {"name":"deepseek","baseUrl":"https://api.deepseek.com/v1","apiKey":"sk-xxx","models":["deepseek-chat","deepseek-reasoner"]},
 *     {"name":"openai","baseUrl":"https://api.openai.com/v1","apiKey":"sk-xxx","models":["gpt-4o","gpt-4o-mini"]},
 *     {"name":"qwen","baseUrl":"https://dashscope.aliyuncs.com/compatible-mode/v1","apiKey":"sk-xxx","models":["qwen-max","qwen-plus"]}
 *   ]
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Parse provider configs from env
function loadProviders() {
  const raw = process.env.LLM_PROVIDERS;
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    console.error('Failed to parse LLM_PROVIDERS env var');
    return [];
  }
}

function getProviderForModel(providers, modelName) {
  // Try exact match first
  for (const p of providers) {
    if (p.models && p.models.includes(modelName)) return p;
  }
  // Try prefix match (e.g. "deepseek" matches provider named "deepseek")
  for (const p of providers) {
    if (modelName.toLowerCase().startsWith(p.name.toLowerCase())) return p;
  }
  return null;
}

async function callLlm(provider, model, messages, options = {}) {
  const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    stream: false,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '(empty response)';
}

// Create MCP Server
const server = new McpServer({
  name: 'call-llm',
  version: '1.0.0',
});

// Register the call_llm tool
server.tool(
  'call_llm',
  'Call an external LLM API (OpenAI-compatible). Use this to get responses from other AI models like GPT-4o, DeepSeek, Qwen, Gemini, etc.',
  {
    model: z.string().describe('Model name, e.g. "gpt-4o", "deepseek-chat", "qwen-max"'),
    prompt: z.string().describe('The user prompt/question to send to the model'),
    system_prompt: z
      .string()
      .optional()
      .describe('Optional system prompt to set the model behavior'),
    temperature: z
      .number()
      .min(0)
      .max(2)
      .optional()
      .describe('Sampling temperature (0-2, default 0.7)'),
    max_tokens: z
      .number()
      .optional()
      .describe('Maximum tokens in response (default 4096)'),
  },
  async ({ model, prompt, system_prompt, temperature, max_tokens }) => {
    const providers = loadProviders();

    if (providers.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: No LLM providers configured. Set the LLM_PROVIDERS environment variable in the MCP server config.',
          },
        ],
        isError: true,
      };
    }

    const provider = getProviderForModel(providers, model);
    if (!provider) {
      const available = providers
        .map((p) => `${p.name}: ${(p.models || []).join(', ')}`)
        .join('\n');
      return {
        content: [
          {
            type: 'text',
            text: `Error: No provider found for model "${model}". Available providers:\n${available}`,
          },
        ],
        isError: true,
      };
    }

    try {
      const messages = [];
      if (system_prompt) {
        messages.push({ role: 'system', content: system_prompt });
      }
      messages.push({ role: 'user', content: prompt });

      const result = await callLlm(provider, model, messages, {
        temperature,
        maxTokens: max_tokens,
      });

      return {
        content: [
          {
            type: 'text',
            text: `[${provider.name} / ${model}]\n\n${result}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Error calling ${provider.name}/${model}: ${err.message}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// Register list_llm_models tool
server.tool(
  'list_llm_models',
  'List all available LLM providers and models configured in the system.',
  {},
  async () => {
    const providers = loadProviders();
    if (providers.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No LLM providers configured. Set the LLM_PROVIDERS environment variable.',
          },
        ],
      };
    }

    const lines = providers.map(
      (p) =>
        `**${p.name}** (${p.baseUrl})\n  Models: ${(p.models || ['(auto-detect)']).join(', ')}`,
    );

    return {
      content: [
        {
          type: 'text',
          text: `Available LLM Providers:\n\n${lines.join('\n\n')}`,
        },
      ],
    };
  },
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
