require('dotenv').config();
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { createMcpServer } = require('./server');
const { testConnection } = require('../config/database');

const runMcpServer = async () => {
  try {
    // Database connection verification
    await testConnection();

    const server = createMcpServer();
    const transport = new StdioServerTransport();

    await server.connect(transport);
    console.error('[MCP] SaaS Analytics MCP Server running on stdio transport.');
  } catch (error) {
    console.error('[MCP] Failed to start MCP Server:', error.message);
    process.exit(1);
  }
};

if (require.main === module) {
  runMcpServer();
}

module.exports = { runMcpServer };

