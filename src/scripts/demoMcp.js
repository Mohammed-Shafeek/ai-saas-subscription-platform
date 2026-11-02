require('dotenv').config();
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { createMcpServer } = require('../mcp/server');
const { sequelize } = require('../models');

async function runMcpDemo() {
  console.log('\n============================================================');
  console.log('🤖 SAAS PLATFORM: MODEL CONTEXT PROTOCOL (MCP) DEMONSTRATION');
  console.log('============================================================\n');

  try {
    await sequelize.authenticate();
    console.log(`[1/4] Connected to Database (${sequelize.getDialect()})`);

    // 1. Initialize MCP Server
    console.log('[2/4] Booting MCP Server (saas-analytics-mcp-server v1.0.0)...');
    const server = createMcpServer();

    // 2. Connect via MCP Transport (simulating an AI client like Claude Desktop)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'ai-client-demo', version: '1.0.0' }, { capabilities: {} });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    console.log('      Connected AI Client (Claude Desktop / Agent) via MCP Transport.');

    // 3. Discover Available Tools
    console.log('\n[3/4] AI Tool Discovery (ListToolsRequest):');
    const toolsResult = await client.listTools();
    toolsResult.tools.forEach((t) => {
      console.log(`   🛠️  Tool: "${t.name}"`);
      console.log(`       Description: ${t.description}`);
    });

    // 4. Execute Tools
    console.log('\n[4/4] Executing Tools via AI Client:');

    // Call 1: Active Subscribers
    console.log('\n   👉 Calling Tool: get_active_subscribers()...');
    const subResult = await client.callTool({
      name: 'get_active_subscribers',
      arguments: {}
    });
    console.log('      [Response from Platform]:');
    console.log('     ', subResult.content[0].text);

    // Call 2: Total Revenue
    console.log('\n   👉 Calling Tool: get_total_revenue() [First Call - Database Fetch]...');
    const revResult1 = await client.callTool({
      name: 'get_total_revenue',
      arguments: {}
    });
    console.log('      [Response from Platform]:');
    console.log('     ', revResult1.content[0].text);

    // Call 3: Demonstrate Redis Cache Hit
    console.log('\n   ⚡ Calling Tool: get_total_revenue() [Second Call - Redis Cache Hit]...');
    const revResult2 = await client.callTool({
      name: 'get_total_revenue',
      arguments: {}
    });
    console.log('      [Response from Platform]:');
    console.log('     ', revResult2.content[0].text);

    console.log('\n============================================================');
    console.log('✅ MCP DEMONSTRATION COMPLETE!');
    console.log('   - AI models (Claude Desktop, Cursor) query these tools safely.');
    console.log('   - Enforces Least Privilege (safe read-only aggregated analytics).');
    console.log('   - Backed by Redis 60-second read-through caching.');
    console.log('============================================================\n');

    await client.close();
    await server.close();
  } catch (error) {
    console.error('❌ MCP Demo failed:', error);
  } finally {
    await sequelize.close();
  }
}

runMcpDemo();
