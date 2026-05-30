/**
 * Database Seed Script (CF-WC-160)
 *
 * Seeds the database with test data for development and testing
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ============================================
  // Scoring Config
  // ============================================

  console.log('Creating scoring configs...');

  const defaultScoringConfig = await prisma.cf_scoring_config.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Default (Balanced)',
      weights: {
        engagement: 0.4,
        ctr: 0.3,
        conversions: 0.3,
      },
      minViewsThreshold: 1000,
      active: true,
    },
  });

  await prisma.cf_scoring_config.create({
    data: {
      name: 'Engagement Focus',
      weights: {
        engagement: 0.7,
        ctr: 0.2,
        conversions: 0.1,
      },
      minViewsThreshold: 1000,
      active: false,
    },
  });

  await prisma.cf_scoring_config.create({
    data: {
      name: 'Conversion Focus',
      weights: {
        engagement: 0.2,
        ctr: 0.3,
        conversions: 0.5,
      },
      minViewsThreshold: 500,
      active: false,
    },
  });

  console.log('✅ Created scoring configs');

  // ============================================
  // Test Product Dossiers
  // ============================================

  console.log('Creating test dossiers...');

  const acnePatch = await prisma.cf_product_dossiers.upsert({
    where: { slug: 'acne-patch' },
    update: {},
    create: {
      slug: 'acne-patch',
      name: 'Acne Patch',
      benefits: [
        'Clear skin overnight',
        'Invisible wear during the day',
        'Absorbs impurities',
        'Prevents picking',
        'Reduces redness and inflammation',
      ],
      painPoints: [
        'Embarrassing breakouts before important events',
        'Slow healing process',
        'Visible acne scars',
        'Can\'t stop picking at breakouts',
        'Makeup doesn\'t cover well',
      ],
      proofTypes: ['before_after', 'testimonial'],
      targetAudience: 'Women 18-35 with occasional acne',
      category: 'Beauty',
      niche: 'Skincare',
      price: 12.99,
      tiktokShopUrl: 'https://shop.tiktok.com/view/product/acne-patch-example',
      affiliateLink: 'https://amzn.to/acne-patch-example',
      status: 'active',
    },
  });

  const weightLossTea = await prisma.cf_product_dossiers.upsert({
    where: { slug: 'weight-loss-tea' },
    update: {},
    create: {
      slug: 'weight-loss-tea',
      name: 'Weight Loss Tea',
      benefits: [
        'Boost metabolism naturally',
        '100% organic ingredients',
        'Increases energy levels',
        'Reduces bloating',
        'Supports healthy digestion',
      ],
      painPoints: [
        'Stubborn weight that won\'t budge',
        'Low energy from crash diets',
        'Bloating and discomfort',
        'Slow metabolism',
        'Difficulty sticking to diet plans',
      ],
      proofTypes: ['before_after', 'demo', 'testimonial'],
      targetAudience: 'Women 25-45 interested in weight loss',
      category: 'Health',
      niche: 'Weight Loss',
      price: 24.99,
      tiktokShopUrl: 'https://shop.tiktok.com/view/product/weight-loss-tea-example',
      status: 'active',
    },
  });

  const hairGrowthSerum = await prisma.cf_product_dossiers.upsert({
    where: { slug: 'hair-growth-serum' },
    update: {},
    create: {
      slug: 'hair-growth-serum',
      name: 'Hair Growth Serum',
      benefits: [
        'Stimulates hair follicles',
        'Thicker, fuller hair in 90 days',
        'Reduces hair fall',
        'All-natural ingredients',
        'Works for all hair types',
      ],
      painPoints: [
        'Thinning hair and receding hairline',
        'Excessive hair fall',
        'Low confidence due to hair loss',
        'Tried everything without results',
      ],
      proofTypes: ['before_after'],
      targetAudience: 'Men and women 30-60 with hair loss',
      category: 'Beauty',
      niche: 'Hair Care',
      price: 39.99,
      status: 'active',
    },
  });

  console.log('✅ Created test dossiers');

  // ============================================
  // Test Scripts
  // ============================================

  console.log('Creating test scripts...');

  // Scripts for Acne Patch (all 5 awareness levels)
  await prisma.cf_scripts.upsert({
    where: {
      dossierId_awarenessLevel_marketSophistication: {
        dossierId: acnePatch.id,
        awarenessLevel: 1,
        marketSophistication: 3,
      },
    },
    update: {},
    create: {
      dossierId: acnePatch.id,
      awarenessLevel: 1,
      marketSophistication: 3,
      hook: 'POV: You wake up and your skin is perfect',
      body: 'No really, this happened to me. I put these tiny patches on before bed and when I woke up, the redness was GONE. The bump was flat. I couldn\'t believe it. I wish I knew about these in high school.',
      cta: 'Now I never leave the house without them',
      estimatedDuration: 15,
    },
  });

  await prisma.cf_scripts.upsert({
    where: {
      dossierId_awarenessLevel_marketSophistication: {
        dossierId: acnePatch.id,
        awarenessLevel: 2,
        marketSophistication: 3,
      },
    },
    update: {},
    create: {
      dossierId: acnePatch.id,
      awarenessLevel: 2,
      marketSophistication: 3,
      hook: 'Struggling with breakouts that won\'t go away?',
      body: 'I used to cake on concealer and hope for the best. Then I discovered these hydrocolloid patches. They literally pull out the gunk while you sleep. Wake up with flatter, less red skin. Game changer for anyone with hormonal acne.',
      cta: 'Link in bio to try them',
      estimatedDuration: 18,
    },
  });

  await prisma.cf_scripts.upsert({
    where: {
      dossierId_awarenessLevel_marketSophistication: {
        dossierId: acnePatch.id,
        awarenessLevel: 3,
        marketSophistication: 3,
      },
    },
    update: {},
    create: {
      dossierId: acnePatch.id,
      awarenessLevel: 3,
      marketSophistication: 3,
      hook: 'I tried 5 different acne treatments. Only ONE worked.',
      body: 'Benzoyl peroxide? Dried out my skin. Salicylic acid? Meh results. These patches? Actual visible improvement overnight. The hydrocolloid technology is scientifically proven to draw out impurities. Plus they stop me from picking (which was half my problem).',
      cta: 'This is what I use now',
      estimatedDuration: 20,
    },
  });

  await prisma.cf_scripts.upsert({
    where: {
      dossierId_awarenessLevel_marketSophistication: {
        dossierId: acnePatch.id,
        awarenessLevel: 4,
        marketSophistication: 3,
      },
    },
    update: {},
    create: {
      dossierId: acnePatch.id,
      awarenessLevel: 4,
      marketSophistication: 3,
      hook: 'Acne Patch Review: 3 weeks later',
      body: 'Pros: Works overnight, invisible during the day, prevents picking, affordable. Cons: You need to apply to clean skin (duh), doesn\'t work on deep cystic acne, have to replace daily. Overall? 9/10. My skin is clearer than it\'s been in years. Would recommend.',
      cta: 'See my before/after below',
      estimatedDuration: 22,
    },
  });

  await prisma.cf_scripts.upsert({
    where: {
      dossierId_awarenessLevel_marketSophistication: {
        dossierId: acnePatch.id,
        awarenessLevel: 5,
        marketSophistication: 3,
      },
    },
    update: {},
    create: {
      dossierId: acnePatch.id,
      awarenessLevel: 5,
      marketSophistication: 3,
      hook: '⚠️ Last day of sale - don\'t miss this',
      body: 'These acne patches are 30% off today ONLY. I\'ve been using them for months and they\'re the reason my skin looks like this now. Over 10,000 5-star reviews. Free shipping. If you struggle with breakouts, this is your sign.',
      cta: 'Link in bio - sale ends tonight',
      estimatedDuration: 16,
    },
  });

  console.log('✅ Created test scripts');

  // ============================================
  // Test Images
  // ============================================

  console.log('Creating test images...');

  await prisma.cf_generated_images.create({
    data: {
      dossierId: acnePatch.id,
      type: 'before',
      prompt: 'Close-up photo of woman\'s face with visible acne breakout on chin and forehead, natural lighting, realistic skin texture',
      model: 'nano-banana',
      imageUrl: 'https://cdn.example.com/test/before-acne-1.png',
      status: 'completed',
      metadata: {
        width: 1080,
        height: 1920,
        format: 'png',
      },
    },
  });

  await prisma.cf_generated_images.create({
    data: {
      dossierId: acnePatch.id,
      type: 'after',
      prompt: 'Close-up photo of woman\'s face with clear, smooth skin, natural lighting, realistic skin texture, slight acne patch visible',
      model: 'nano-banana',
      imageUrl: 'https://cdn.example.com/test/after-acne-1.png',
      status: 'completed',
      metadata: {
        width: 1080,
        height: 1920,
        format: 'png',
      },
    },
  });

  console.log('✅ Created test images');

  // ============================================
  // Test A/B Tests
  // ============================================

  console.log('Creating test A/B tests...');

  await prisma.cf_ab_tests.create({
    data: {
      name: 'Hook Test: POV vs Problem',
      variants: [
        {
          id: 'variant-pov',
          name: 'POV Hook',
          allocation: 0.5,
        },
        {
          id: 'variant-problem',
          name: 'Problem Hook',
          allocation: 0.5,
        },
      ],
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-02-15'),
      status: 'completed',
      winnerId: 'variant-pov',
    },
  });

  console.log('✅ Created test A/B tests');

  // ============================================
  // Test Analytics Events
  // ============================================

  console.log('Creating test analytics events...');

  const testUserId = '00000000-0000-0000-0000-000000000010';
  const testSessionId = 'session-test-001';

  const events = [
    {
      eventName: 'dossier_created',
      eventCategory: 'content',
      properties: { dossierId: acnePatch.id },
    },
    {
      eventName: 'scripts_generated',
      eventCategory: 'generation',
      properties: { dossierId: acnePatch.id, count: 5 },
    },
    {
      eventName: 'images_generated',
      eventCategory: 'generation',
      properties: { dossierId: acnePatch.id, type: 'before', count: 2 },
    },
    {
      eventName: 'content_assembled',
      eventCategory: 'assembly',
      properties: { dossierId: acnePatch.id, platform: 'tiktok' },
    },
    {
      eventName: 'search',
      eventCategory: 'search',
      properties: { query: 'acne products', resultsCount: 3 },
    },
  ];

  for (const event of events) {
    await prisma.cf_analytics_events.create({
      data: {
        userId: testUserId,
        sessionId: testSessionId,
        eventName: event.eventName,
        eventCategory: event.eventCategory,
        properties: event.properties,
        timestamp: new Date(),
      },
    });
  }

  console.log('✅ Created test analytics events');

  // ============================================
  // Test User Feedback
  // ============================================

  console.log('Creating test user feedback...');

  await prisma.cf_user_feedback.create({
    data: {
      userId: testUserId,
      type: 'feature',
      message: 'Would love to see bulk content generation - upload 10 products at once',
      url: '/content-factory/dossiers',
      status: 'new',
    },
  });

  await prisma.cf_user_feedback.create({
    data: {
      userId: testUserId,
      type: 'praise',
      message: 'This tool is amazing! Generated 20 TikToks in an hour',
      status: 'reviewing',
    },
  });

  console.log('✅ Created test user feedback');

  console.log('');
  console.log('🎉 Database seeded successfully!');
  console.log('');
  console.log('📊 Summary:');
  console.log('  - 3 Scoring configs');
  console.log('  - 3 Product dossiers');
  console.log('  - 5 Scripts (Acne Patch)');
  console.log('  - 2 Generated images');
  console.log('  - 1 A/B test');
  console.log('  - 5 Analytics events');
  console.log('  - 2 User feedback items');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
