#!/usr/bin/env tsx
/**
 * Test script to verify harness setup and functionality
 * 
 * Usage: npx tsx scripts/test-harness.ts
 */

import { api } from '../lib/api';

async function testHarness() {
  console.log('🧪 Testing Autonomous Coding Harness Setup...\n');

  try {
    // 1. Test API connection
    console.log('1. Testing API connection...');
    const projects = await api.getProjects();
    console.log(`   ✅ Connected! Found ${projects.length} projects\n`);

    if (projects.length === 0) {
      console.log('   ⚠️  No projects found. Creating a test project...');
      const testProject = await api.createProject({
        name: 'Test Autonomous Project',
        description: 'Test project for harness verification',
        touchLevel: 'medium',
        profitPotential: 'medium',
        difficulty: 'medium',
        automationMode: 'hybrid',
      });
      console.log(`   ✅ Created test project: ${testProject.id}\n`);
      return testProject.id;
    }

    // 2. Test harness status
    const projectId = projects[0].id;
    console.log(`2. Testing harness status for project: ${projectId}...`);
    try {
      const status = await api.getHarnessStatus(projectId);
      console.log(`   ✅ Harness status: ${status.status}`);
      if (status.pid) {
        console.log(`   ✅ Process ID: ${status.pid}`);
      }
    } catch (error: any) {
      console.log(`   ℹ️  Harness not running: ${error.message}`);
    }
    console.log();

    // 3. Test features endpoint
    console.log('3. Testing features endpoint...');
    const features = await api.getFeatures(projectId);
    console.log(`   ✅ Found ${features.length} features\n`);

    // 4. Test agent runs
    console.log('4. Testing agent runs endpoint...');
    const runs = await api.getAgentRuns(projectId);
    console.log(`   ✅ Found ${runs.length} agent runs\n`);

    // 5. Test analytics
    console.log('5. Testing analytics endpoint...');
    try {
      const analytics = await api.getAnalytics(projectId);
      console.log(`   ✅ Analytics loaded:`);
      console.log(`      - Features: ${analytics.featuresCompleted}/${analytics.featuresTotal}`);
      console.log(`      - Sessions: ${analytics.sessionsRun}`);
      console.log(`      - Success Rate: ${(analytics.successRate * 100).toFixed(1)}%`);
    } catch (error: any) {
      console.log(`   ℹ️  Analytics not available: ${error.message}`);
    }
    console.log();

    // 6. Test cost tracking
    console.log('6. Testing cost tracking...');
    try {
      const costs = await api.getCosts(projectId);
      console.log(`   ✅ Found ${costs.length} cost entries`);
      if (costs.length > 0) {
        const total = costs.reduce((sum, c) => sum + c.cost, 0);
        console.log(`   ✅ Total cost: $${total.toFixed(2)}`);
      }
    } catch (error: any) {
      console.log(`   ℹ️  Cost tracking not available: ${error.message}`);
    }
    console.log();

    console.log('✅ All tests completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Start the backend server: cd backend && npm run dev');
    console.log('   2. Start the dashboard: npm run dev');
    console.log('   3. Open http://localhost:3000 in your browser');
    console.log('   4. Select a project and start a harness');

    return projectId;
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('\n💡 Make sure:');
    console.error('   1. Backend server is running on http://localhost:3001');
    console.error('   2. NEXT_PUBLIC_API_URL is set correctly');
    console.error('   3. Database is initialized (run: cd backend && npm run db:push)');
    process.exit(1);
  }
}

testHarness();

