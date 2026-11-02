const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError
} = require('@modelcontextprotocol/sdk/types.js');
const analyticsService = require('../services/analytics.service');

/**
 * Creates and configures the MCP Server instance with defined analytics tools
 */
const createMcpServer = () => {
  const server = new Server(
    {
      name: 'saas-analytics-mcp-server',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // 1. Tool Definitions
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'get_active_subscribers',
          description:
            'Retrieve the current number of active platform subscribers. Leverages Redis caching for performance.',
          inputSchema: {
            type: 'object',
            properties: {
              forceRefresh: {
                type: 'boolean',
                description: 'Optional flag to bypass cache and query the database directly.'
              }
            }
          }
        },
        {
          name: 'get_total_revenue',
          description:
            'Retrieve total revenue from successful payments only, broken down by currency. Excludes pending, failed, or refunded transactions and never mixes different currencies into one misleading total.',
          inputSchema: {
            type: 'object',
            properties: {
              currency: {
                type: 'string',
                description: 'Optional 3-letter currency code (e.g. "usd", "eur") to filter revenue.'
              },
              forceRefresh: {
                type: 'boolean',
                description: 'Optional flag to bypass cache and query the database directly.'
              }
            }
          }
        }
      ]
    };
  });

  // 2. Tool Execution Handlers
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    switch (name) {
      case 'get_active_subscribers': {
        const forceRefresh = Boolean(args?.forceRefresh);
        const data = await analyticsService.getActiveSubscribers({ forceRefresh });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  activeSubscribers: data.activeSubscribers,
                  fromCache: data.fromCache,
                  cachedAt: data.cachedAt
                },
                null,
                2
              )
            }
          ]
        };
      }

      case 'get_total_revenue': {
        const forceRefresh = Boolean(args?.forceRefresh);
        const currency = args?.currency ? String(args.currency).trim().toLowerCase() : null;

        const data = await analyticsService.getTotalRevenue({
          currency,
          forceRefresh
        });

        const responsePayload = {
          summary: data.summary,
          breakdown: data.breakdown,
          fromCache: data.fromCache,
          cachedAt: data.cachedAt
        };

        if (currency) {
          responsePayload.filteredCurrency = currency;
          responsePayload.totalAmount = data.totalAmount;
          responsePayload.transactionCount = data.transactionCount;
          responsePayload.formatted = data.formatted;
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(responsePayload, null, 2)
            }
          ]
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: "${name}". Only get_active_subscribers and get_total_revenue are exposed.`
        );
    }
  });

  return server;
};

module.exports = {
  createMcpServer
};

